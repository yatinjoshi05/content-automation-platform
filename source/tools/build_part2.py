from wf import *

# ============ 06 CLIPPING (OpenShorts adapter) ============
def w06():
    w = WF('CA 06 Clipping (OpenShorts adapter)', '06'); w.path = 'ca-w-clipping'
    w.sticky("Clipping-engine ADAPTER, first implementation = OpenShorts (self-hosted). Verified against OpenShorts examples/n8n: POST {base}/api/process {url, acknowledged, webhook_url, webhook_secret}; "
             "completion arrives on a signed webhook (X-OpenShorts-Signature: sha256=HMAC(JSON.stringify(body))). No polling. A different engine = a new adapter workflow + clip_engines row.")
    lj = load_job(w, 0, 0)
    ctx = w.pg('Clip Context', "SELECT s.source_id, s.normalized_url, s.status AS source_status, ca_rights_gate(s.source_id, $2::uuid) AS rights, "
               "ca_setting('allowed_source_domains','[]'::jsonb) AS allowed, "
               "(ca_setting('openshorts_base_url','\"http://localhost:8000\"'))#>>'{}' AS os_base, (ca_setting('n8n_webhook_base','\"http://localhost:5678\"'))#>>'{}' AS n8n_base "
               "FROM sources s WHERE s.source_id = $1::uuid", "[$json.entity_id, $json.channel_id]", 2, 0)
    g = w.code('Guard (rights + allowlists)', r"""const parseUrl = s => { const m = /^(https?):\/\/([A-Za-z0-9.\-]+)(?::(\d+))?(\/[^\s]*)?$/.exec(String(s || '')); if (!m) return null; return { protocol: m[1] + ':', hostname: m[2].toLowerCase(), host: m[2].toLowerCase() + (m[3] ? ':' + m[3] : ''), href: m[0] }; };  // n8n Code sandbox has NO URL global (verified on n8n 2.41.4)
const c = $input.first().json;
if (['rights_blocked', 'policy_blocked', 'needs_human_review'].includes(c.source_status)) throw new Error('RIGHTS: source status is ' + c.source_status);
if (c.rights.decision !== 'verified') throw new Error('RIGHTS: rights gate says ' + c.rights.decision + ' - ' + JSON.stringify(c.rights.reasons));   // rights acknowledgement is only sent after this passes
const u = parseUrl(c.normalized_url); if (!u) throw new Error('VALIDATION: bad source url');
if (u.protocol !== 'https:' || !c.allowed.includes(u.hostname)) throw new Error('VALIDATION: source host not in allowed_source_domains: ' + u.hostname);
const base = c.os_base.replace(/\/+$/, ''); if (!/^https?:\/\/[A-Za-z0-9.\-]+(:\d+)?$/.test(base)) throw new Error('VALIDATION: openshorts_base_url malformed');
return [{ json: { url: u.href, os_base: base, webhook_url: c.n8n_base.replace(/\/+$/, '') + '/webhook/ca-openshorts-done' } }];""", 3, 0)
    sub = w.http('OpenShorts Submit', 'POST', "={{ $json.os_base }}/api/process", 4, 0, timeout=60000,
                 body="={{ JSON.stringify({ url: $json.url, acknowledged: true, webhook_url: $json.webhook_url, webhook_secret: $env.OPENSHORTS_WEBHOOK_SECRET }) }}")
    jid = w.code('Read OpenShorts Job Id', r"""const id = $input.first().json.job_id;
if (!id || typeof id !== 'string') throw new Error('VALIDATION: unexpected OpenShorts response (no job_id) - check OpenShorts version/API');
return [{ json: { ext: id } }];""", 5, 0)
    wait = w.pg('Mark Waiting For Webhook', "SELECT ca_job_wait($1::uuid, $2)", "[$('Load Job').first().json.job_id, $json.ext]", 6, 0)
    w.chain(lj, ctx, g, sub); w.link(sub, jid); w.link(jid, wait); fail_path(w, 'Submit', sub, 5, 2)
    # completion webhook (no header auth: HMAC verified in code)
    d = w.add('OpenShorts Completion Webhook', 'webhook', {"httpMethod": "POST", "path": "ca-openshorts-done", "responseMode": "onReceived", "options": {}}, 0, 5)
    v = w.code('Verify Signature', r"""const crypto = require('crypto');
const it = $input.first().json; const secret = $env.OPENSHORTS_WEBHOOK_SECRET;
if (!secret) return [{ json: { valid: false, why: 'no secret configured' } }];
const sig = String((it.headers || {})['x-openshorts-signature'] || '');
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(JSON.stringify(it.body)).digest('hex');
const a = Buffer.from(sig), b = Buffer.from(expected);
const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
const body = it.body || {};
return [{ json: { valid, event: body.event, status: body.status, job_id: body.job_id, clips: Array.isArray(body.clips) ? body.clips.slice(0, 30) : [], error: body.error ? String(body.error).slice(0, 300) : null } }];""", 1, 5)
    ok = w.iff('Signature Valid?', "$json.valid", 2, 5)
    bad = w.pg('Audit Rejected Webhook', "SELECT ca_audit('external','openshorts_webhook','signature_rejected',NULL,NULL,NULL,NULL,'{}'::jsonb)", None, 3, 6)
    okc = w.iff('Completed?', "$json.event === 'job.completed' && $json.status === 'completed'", 3, 5)
    ing = w.pg('Ingest Clips (idempotent)', "SELECT ca_ingest_clips($1, 'openshorts', $2::jsonb) AS result", "[$json.job_id, JSON.stringify($json.clips)]", 4, 5)
    fl = w.pg('Fail Clipping Job', "SELECT ca_job_fail(job_id, 'TRANSIENT', $2) FROM jobs WHERE external_job_id = $1 AND job_type = 'clipping' AND status = 'waiting'", "[$json.job_id, $json.error || 'OpenShorts job failed']", 4, 6)
    w.chain(d, v, ok); w.link(ok, okc, 0); w.link(ok, bad, 1); w.link(okc, ing, 0); w.link(okc, fl, 1)
    return w

# ============ 07 CONTENT PACKAGING + QA ============
def w07():
    w = WF('CA 07 Content Packaging And QA', '07'); w.path = 'ca-w-packaging'
    lj = load_job(w, 0, 0)
    ctx = w.pg('Clip Context', "SELECT cl.clip_id, cl.title, cl.hook, cl.duration, cl.video_url, s.title AS source_title, s.creator, p.attribution_required, p.attribution_text, "
               "(SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (SELECT cv.per_platform->'youtube'->>'title' AS t FROM content_versions cv JOIN content c2 ON c2.content_id = cv.content_id WHERE c2.channel_id = $2::uuid ORDER BY cv.created_at DESC LIMIT 200) x) AS recent_titles, "
               "((ca_setting('max_hashtags','5'))#>>'{}')::int AS max_hashtags FROM clips cl JOIN sources s ON s.source_id = cl.source_id "
               "LEFT JOIN permissions p ON p.source_id = s.source_id AND p.status = 'active' WHERE cl.clip_id = $1::uuid",
               "[$json.payload.clip_id, $json.channel_id]", 2, 0)
    bp = w.code('Build Prompt', r"""const job = $('Load Job').first().json; const c = $input.first().json; const rules = job.rules || {};
const prompt = `Channel: ${job.channel_name} (niche: ${job.niche_name}). Platforms: ${job.platforms.join(', ')}.\nClip title from engine: ${c.title}. Hook: ${c.hook || 'n/a'}. Duration: ${c.duration || 'n/a'}s. Source: ${c.source_title} by ${c.creator}.\n` +
 `Rules: max ${c.max_hashtags} hashtags, no keyword stuffing, no clickbait lies, no claims of guaranteed results. Banned phrases: ${(rules.banned_phrases || []).join(', ') || 'none'}.\n` +
 (job.payload.feedback ? `Human feedback to address: ${job.payload.feedback}\n` : '') +
 `Write DIFFERENT metadata per platform (YouTube Shorts: searchable title <=90 chars; Instagram Reels: conversational caption; Facebook Reels: community-oriented).\n` +
 `Return JSON {"hook_text":str,"hook_strength":0..1,"per_platform":{"<platform>":{"title":str,"description":str,"hashtags":[str]}}}.`;
return [{ json: { prompt, system: 'You are a short-form social copywriter. Output valid JSON only. Honest, non-spammy.' } }];""", 3, 0)
    w.chain(lj, ctx, bp)
    pick, okrec = llm_block(w, 4, 0, 'Build Prompt', ['text', 'json'], 'Validate And QA')
    w.link(bp, pick)
    qa = w.code('Validate And QA', r"""const job = $('Load Job').first().json; const c = $('Clip Context').first().json; const d = $('Parse LLM JSON').first().json.data; const rules = job.rules || {};
const banned = (rules.banned_phrases || []).map(s => s.toLowerCase()); const guar = /(guaranteed|100% safe|definitely safe|get rich)/i;
const recent = new Set((c.recent_titles || []).filter(Boolean).map(t => t.toLowerCase()));
const per = {}; let metaOk = true; const problems = [];
for (const p of job.platforms) {
  const m = (d.per_platform || {})[p]; if (!m || !m.title) { metaOk = false; problems.push('missing ' + p); continue; }
  let tags = (m.hashtags || []).map(h => '#' + String(h).replace(/^#+/, '').replace(/[^\w]/g, '')).filter(h => h.length > 1);
  tags = [...new Set(tags)].slice(0, c.max_hashtags);
  let desc = String(m.description || '').slice(0, 2000);
  if (c.attribution_required && c.attribution_text) desc += '\n\n' + c.attribution_text;            // attribution enforced deterministically
  const title = String(m.title).slice(0, p === 'youtube' ? 95 : 150);
  const txt = (title + ' ' + desc).toLowerCase();
  if (banned.some(b => txt.includes(b)) || guar.test(txt)) { metaOk = false; problems.push('banned/guarantee phrase on ' + p); }
  per[p] = { title, description: desc, hashtags: tags, caption: (title + '\n\n' + tags.join(' ')).slice(0, 2200) };
}
const dur = Number(c.duration); const durOk = !dur || (dur >= job.clip_min_seconds && dur <= job.clip_max_seconds);
const unique = !per.youtube || !recent.has(per.youtube.title.toLowerCase());
const hook = Math.min(1, Math.max(0, Number(d.hook_strength) || 0));
const dims = [durOk ? 1 : 0, metaOk ? 1 : 0, unique ? 1 : 0, hook];
const score = +(dims.reduce((a, b) => a + b, 0) / dims.length).toFixed(3);
const qa = { duration_ok: durOk, metadata_valid: metaOk, unique_title: unique, hook_strength: hook, problems,
  assessed: ['duration', 'metadata', 'uniqueness', 'hook (text-based)'], not_assessed: ['framing', 'audio quality', 'visual quality', 'subtitle quality', 'thumbnail'], visual_checked: false,
  model: $('Parse LLM JSON').first().json.provider };
return [{ json: { per, hook: String(d.hook_text || c.hook || '').slice(0, 200), qa, score } }];""", 10, 0)
    st = w.pg('Store Version + Enqueue Approval', "SELECT ca_packaging_store($1::uuid, $2::jsonb, $3, $4::jsonb, $5::numeric) AS result",
              "[$('Load Job').first().json.job_id, JSON.stringify($json.per), $json.hook, JSON.stringify($json.qa), $json.score]", 11, 0)
    w.link(qa, st)
    return w

# ============ 08 APPROVAL ============
def w08():
    w = WF('CA 08 Approval', '08'); w.path = 'ca-w-approval-request'
    lj = load_job(w, 0, 0)
    ar = w.pg('Approval Request (autonomy gate)', "SELECT ca_approval_request($1::uuid) AS result", "[$json.job_id]", 2, 0)
    w.chain(lj, ar)
    w.sticky("Manual mode: approval row stays awaiting_approval (+IMPORTANT email). Automatic mode: ca_autonomy_gate auto-approves ONLY if rights verified, policy not review_required/blocked, quality >= threshold, "
             "visual QA satisfied, no auth failure open. Human API below: approve | reject | edit | regenerate.", 0, 2)
    a = w.add('API Approval Action', 'webhook', {"httpMethod": "POST", "path": "ca-api-approval", "responseMode": "lastNode", "authentication": "headerAuth", "options": {}}, 0, 4)
    v = w.code('Validate API Input', r"""const b = $input.first().json.body || {};
if (!/^[0-9a-f-]{36}$/i.test(b.approval_id || '')) throw new Error('VALIDATION: approval_id must be a UUID');
if (!['approve', 'reject', 'edit', 'regenerate'].includes(b.action)) throw new Error('VALIDATION: action must be approve|reject|edit|regenerate');
const out = { action: b.action, approval_id: b.approval_id, by: String(b.by || 'owner').slice(0, 60), comments: b.comments ? String(b.comments).slice(0, 1000) : null, nonce: b.nonce || null };
if (b.version !== undefined) out.version = Number(b.version);
if (b.action === 'edit') {
  const allow = ['youtube', 'instagram', 'facebook']; const pp = {};
  for (const [k, m] of Object.entries(b.per_platform || {})) { if (!allow.includes(k)) continue;
    pp[k] = { title: String(m.title || '').slice(0, 150), description: String(m.description || '').slice(0, 2000), hashtags: (m.hashtags || []).slice(0, 10).map(String) }; }
  if (!Object.keys(pp).length) throw new Error('VALIDATION: edit needs per_platform metadata');
  out.per_platform = pp;
}
return [{ json: out }];""", 1, 4)
    p = w.pg('Apply Action (versioned)', "SELECT ca_approval_action($1::jsonb) AS result", "[JSON.stringify($json)]", 2, 4)
    w.chain(a, v, p)
    return w

# ============ 09 SCHEDULER ============
def w09():
    w = WF('CA 09 Scheduler', '09'); w.path = 'ca-w-scheduling'
    lj = load_job(w, 0, 0)
    sc = w.pg('Schedule Content (windows, gap, cap, no duplicates)', "SELECT ca_schedule_content($1::uuid) AS result", "[$json.job_id]", 2, 0)
    w.chain(lj, sc)
    w.sticky("Slots come from channels.preferred_windows (configurable, or auto-updated weekly from analytics when channels.rules.auto_windows=true). Nothing is hard-coded. "
             "Publishing always uses content.approved_version. Reschedule endpoint below.", 0, 2)
    a = w.add('API Reschedule', 'webhook', {"httpMethod": "POST", "path": "ca-api-reschedule", "responseMode": "lastNode", "authentication": "headerAuth", "options": {}}, 0, 4)
    v = w.code('Validate API Input', r"""const b = $input.first().json.body || {};
if (!/^[0-9a-f-]{36}$/i.test(b.content_id || '')) throw new Error('VALIDATION: content_id must be a UUID');
if (!['youtube', 'instagram', 'facebook'].includes(b.platform)) throw new Error('VALIDATION: unsupported platform');
const t = new Date(b.scheduled_at); if (isNaN(t)) throw new Error('VALIDATION: scheduled_at must be ISO-8601 with offset, e.g. 2026-10-02T20:00:00+05:30');
return [{ json: { content_id: b.content_id, platform: b.platform, scheduled_at: t.toISOString() } }];""", 1, 4)
    p = w.pg('Reschedule', "SELECT ca_reschedule($1::uuid, $2, $3::timestamptz) AS result", "[$json.content_id, $json.platform, $json.scheduled_at]", 2, 4)
    w.chain(a, v, p)
    return w

# ============ 10 PUBLISHING ============
PUB_CLASSIFY = CLASSIFY_JS.replace("$('Load Job').first().json.job_id", "$('Begin Publication').first().json.r.publication_id").replace("job_id: jobId", "publication_id: jobId") \
    .replace("if (/VALIDATION:/.test(raw)) cat = 'VALIDATION';", "if (/UNSUPPORTED:/.test(raw)) cat = 'UNSUPPORTED';\nelse if (/VALIDATION:/.test(raw)) cat = 'VALIDATION';")
PUB_CLASSIFY = PUB_CLASSIFY.replace("const msg = raw.replace(", "if (['YouTube Upload', 'IG Publish'].includes($prevNode.name) && (cat === 'TRANSIENT' || cat === 'UNKNOWN')) cat = 'AMBIGUOUS';   // upload may have succeeded: never auto-retried\nconst msg = raw.replace(")
PUB_FAIL = "SELECT ca_publish_result($1::uuid, false, NULL, $3, $2)"
PUB_FAIL_P = "[$json.publication_id, $json.category, $json.message]"

def w10():
    w = WF('CA 10 Publishing', '10')
    w.sticky("Every minute: due schedules -> ca_publish_begin (idempotency key content:platform:channel, only 'scheduled' items, approved_version only) -> platform adapter. "
             "YouTube = official YouTube node (OAuth2). Instagram = Graph API Reels flow, GATED behind settings.adapter_verified_instagram. Facebook = fail-closed stub (unsupported). "
             "n8n triggers at the scheduled minute (platform-side scheduling is not used).", 0, -2)
    t = w.sched('Every minute', 0, 0, field='minutes', minutesInterval=1)
    due = w.pg('Due Schedules', "SELECT schedule_id FROM ca_due_schedules(1)", None, 1, 0)
    beg = w.pg('Begin Publication', "SELECT ca_publish_begin($1::uuid) AS r", "[$json.schedule_id]", 2, 0)
    ok = w.iff('Begin OK?', "$json.r.ok === true", 3, 0)
    dup = w.iff('Duplicate Blocked?', "$json.r.critical === true", 3, 2)
    dn = w.pg('Note Duplicate Blocked', "SELECT 1", None, 4, 2)   # ca_publish_begin already emitted the event + CRITICAL notification
    load = w.pg('Load Payload', "SELECT $1::uuid AS publication_id, $2::text AS platform, cv.per_platform -> $2::text AS meta, cl.video_url, "
                "(ca_setting('openshorts_base_url','\"http://localhost:8000\"'))#>>'{}' AS os_base, (ca_setting('public_media_base_url','\"\"'))#>>'{}' AS public_base, "
                "(ca_setting('meta_graph_version','\"v21.0\"'))#>>'{}' AS graph_v, (ca_setting('adapter_verified_' || $2::text,'false'))#>>'{}' AS verified, "
                "pa.external_account_id, COALESCE(ch.rules->>'youtube_category_id','22') AS yt_category, COALESCE(NULLIF(ch.rules->>'youtube_privacy',''),(ca_setting('youtube_default_privacy','\"private\"'))#>>'{}') AS yt_privacy, COALESCE(ch.rules->>'youtube_region','IN') AS yt_region "
                "FROM content c JOIN content_versions cv ON cv.content_id = c.content_id AND cv.version = c.approved_version JOIN clips cl ON cl.clip_id = cv.clip_id "
                "JOIN channels ch ON ch.id = c.channel_id LEFT JOIN platform_accounts pa ON pa.channel_id = c.channel_id AND pa.platform = $2::text AND pa.enabled WHERE c.content_id = $3::uuid",
                "[$json.r.publication_id, $json.r.platform, $json.r.content_id]", 4, 0)
    ck = w.code('Guard Media And Adapter', r"""const parseUrl = s => { const m = /^(https?):\/\/([A-Za-z0-9.\-]+)(?::(\d+))?(\/[^\s]*)?$/.exec(String(s || '')); if (!m) return null; return { protocol: m[1] + ':', hostname: m[2].toLowerCase(), host: m[2].toLowerCase() + (m[3] ? ':' + m[3] : ''), href: m[0] }; };  // n8n Code sandbox has NO URL global (verified on n8n 2.41.4)
const j = $input.first().json; const m = j.meta;
if (!m || !m.title) throw new Error('VALIDATION: approved version has no metadata for ' + j.platform);
if (j.platform === 'youtube') { if (!['public', 'private', 'unlisted'].includes(j.yt_privacy)) throw new Error('VALIDATION: youtube privacy must be public|private|unlisted'); if (String(m.title).length > 100) throw new Error('VALIDATION: youtube title longer than 100 characters'); }
if (j.verified !== 'true') throw new Error('UNSUPPORTED: adapter for ' + j.platform + ' is not enabled (settings.adapter_verified_' + j.platform + ' != true)');
const u = parseUrl(j.video_url); if (!u) throw new Error('VALIDATION: clip url invalid');
const b = parseUrl(j.os_base); if (!b) throw new Error('VALIDATION: openshorts_base_url invalid'); if (u.host !== b.host) throw new Error('VALIDATION: clip url host is not the configured clip engine host');   // no arbitrary URLs
return [{ json: { ...j, platform: j.platform } }];""", 5, 0)
    sw = w.iff('Platform = YouTube?', "$json.platform === 'youtube'", 6, 0)
    swi = w.iff('Platform = Instagram?', "$json.platform === 'instagram'", 7, 2)
    dl = w.http('Download Clip (local engine)', 'GET', "={{ $json.video_url }}", 7, -1, timeout=600000, fmt='file')
    yt = w.add('YouTube Upload', 'youtube', {"resource": "video", "operation": "upload",
               "title": "={{ $('Guard Media And Adapter').first().json.meta.title }}", "regionCode": "={{ $('Guard Media And Adapter').first().json.yt_region }}",
               "categoryId": "={{ $('Guard Media And Adapter').first().json.yt_category }}", "binaryProperty": "data",
               "options": {"description": "={{ $('Guard Media And Adapter').first().json.meta.description + '\\n\\n#Shorts' }}", "privacyStatus": "={{ $('Guard Media And Adapter').first().json.yt_privacy }}",
                           "tags": "={{ ($('Guard Media And Adapter').first().json.meta.hashtags || []).map(h => h.replace('#','')).join(',') }}", "selfDeclaredMadeForKids": False}},
               8, -1, onError='continueErrorOutput')
    ytok = w.pg('YouTube Result', "SELECT ca_publish_result($1::uuid, true, $2, NULL)", "[$('Guard Media And Adapter').first().json.publication_id, $json.id]", 9, -1)
    ig1 = w.http('IG Create Reels Container', 'POST', "=https://graph.facebook.com/{{ $json.graph_v }}/{{ $json.external_account_id }}/media", 8, 2, auth='httpQueryAuth',
                 body="={{ JSON.stringify({ media_type: 'REELS', video_url: $json.video_url.replace($json.os_base, $json.public_base), caption: $json.meta.caption || $json.meta.title }) }}")
    igw = w.add('IG Wait For Processing', 'wait', {"amount": 90, "unit": "seconds"}, 9, 2)
    ig2 = w.http('IG Check Container', 'GET', "=https://graph.facebook.com/{{ $('Guard Media And Adapter').first().json.graph_v }}/{{ $('IG Create Reels Container').first().json.id }}", 10, 2, auth='httpQueryAuth',
                 qs="={{ JSON.stringify({ fields: 'status_code' }) }}")
    igf = w.iff('IG Finished?', "$json.status_code === 'FINISHED'", 11, 2)
    ig3 = w.http('IG Publish', 'POST', "=https://graph.facebook.com/{{ $('Guard Media And Adapter').first().json.graph_v }}/{{ $('Guard Media And Adapter').first().json.external_account_id }}/media_publish", 12, 2, auth='httpQueryAuth',
                 body="={{ JSON.stringify({ creation_id: $('IG Create Reels Container').first().json.id }) }}")
    igok = w.pg('IG Result', "SELECT ca_publish_result($1::uuid, true, $2, NULL)", "[$('Guard Media And Adapter').first().json.publication_id, $json.id]", 13, 2)
    igno = w.pg('IG Not Ready - Retry Later', "SELECT ca_publish_result($1::uuid, false, NULL, $2, 'TRANSIENT')", "[$('Guard Media And Adapter').first().json.publication_id, 'Instagram container not FINISHED: ' + $json.status_code]", 12, 3)
    fb = w.code('Facebook Reels (not implemented)', "throw new Error('UNSUPPORTED: Facebook Reels adapter is a fail-closed stub. Implement + verify against current Meta docs, then set settings.adapter_verified_facebook=true');", 7, 4)
    w.chain(t, due, beg, ok); w.link(ok, load, 0); w.link(ok, dup, 1); w.link(dup, dn, 0)
    w.chain(load, ck, sw); w.link(sw, dl, 0); w.link(sw, swi, 1); w.link(dl, yt); w.link(yt, ytok)
    w.link(swi, ig1, 0); w.link(swi, fb, 1); w.chain(ig1, igw, ig2, igf); w.link(igf, ig3, 0); w.link(igf, igno, 1); w.link(ig3, igok)
    # error paths -> normalized publication failure (AUTH stops channel via auth circuit + CRITICAL email; transient retries with backoff; bounded)
    pc = w.code('Publish Classify Error', PUB_CLASSIFY, 14, 5); pf = w.pg('Publish Record Failure', PUB_FAIL, PUB_FAIL_P, 15, 5)
    w.link(pc, pf)
    for n in (dl, yt, ig1, ig2, ig3): w.link(n, pc, 1)
    for n in (ck, fb): 
        for x in w.nodes:
            if x['name'] == n: x['onError'] = 'continueErrorOutput'
        w.link(n, pc, 1)
    return w

# ============ 11 ANALYTICS + EARNINGS ============
def w11():
    w = WF('CA 11 Analytics And Earnings', '11')
    w.sticky("YouTube: public statistics via Data API videos.list (views, likes, comments) - only metrics the API returns are stored; others stay NULL (never invented). Watch time/retention/revenue need the YouTube Analytics API "
             "(OAuth, extra scopes) -> adapter NOT implemented. Instagram/Facebook insights: NOT implemented. Earnings: record via API below (estimated vs confirmed kept separate).", 0, -2)
    t = w.sched('Every 6 hours', 0, 0, field='hours', hoursInterval=6)
    pubs = w.pg('Recent Publications', "SELECT p.id AS publication_id, p.channel_id, p.platform_post_id FROM publications p WHERE p.status = 'published' AND p.platform = 'youtube' "
                "AND p.platform_post_id IS NOT NULL AND p.published_at > now() - interval '30 days' "
                "AND NOT EXISTS (SELECT 1 FROM analytics_snapshots a WHERE a.publication_id = p.id AND a.captured_at > now() - interval '5 hours') LIMIT 40", None, 1, 0)
    ids = w.code('Build ID List', r"""const rows = $input.all().map(i => i.json).filter(r => r.platform_post_id);
if (!rows.length) return [{ json: { none: true } }];
return [{ json: { ids: rows.map(r => r.platform_post_id).join(','), map: Object.fromEntries(rows.map(r => [r.platform_post_id, r])) } }];""", 2, 0)
    has = w.iff('Any To Collect?', "!$json.none", 3, 0)
    api = w.http('YouTube Statistics', 'GET', "https://www.googleapis.com/youtube/v3/videos", 4, 0, auth='httpQueryAuth', qs="={{ JSON.stringify({ part: 'statistics', id: $json.ids }) }}")
    rows = w.code('Map Snapshots', r"""const map = $('Build ID List').first().json.map; const out = [];
for (const v of ($input.first().json.items || [])) { const r = map[v.id]; if (!r) continue; const s = v.statistics || {}; const avail = []; const n = k => (s[k] !== undefined ? (avail.push(k.replace('Count', 's')), Number(s[k])) : null);
  const views = n('viewCount'), likes = n('likeCount'), comments = n('commentCount');
  out.push({ json: { publication_id: r.publication_id, channel_id: r.channel_id, raw: v, views, likes, comments, avail: '{' + avail.join(',') + '}' } }); }
return out.length ? out : [{ json: { none: true } }];""", 5, 0)
    ins = w.pg('Insert Snapshot', "INSERT INTO analytics_snapshots(publication_id, channel_id, platform, raw, views, likes, comments, metrics_available) "
               "VALUES ($1::uuid, $2::uuid, 'youtube', $3::jsonb, $4::bigint, $5::bigint, $6::bigint, $7::text[]) RETURNING id",
               "[$json.publication_id, $json.channel_id, JSON.stringify($json.raw), $json.views, $json.likes, $json.comments, $json.avail]", 6, 0)
    ev = w.pg('Emit analytics.updated', "SELECT ca_emit('analytics.updated', NULL, NULL, jsonb_build_object('snapshots', $1::int), 'analytics')", "[$input.all().length]", 7, 0, once=True)
    w.chain(t, pubs, ids, has); w.link(has, api, 0); w.chain(api, rows, ins, ev)
    okr = w.pg('Record API Success', "SELECT ca_circuit_record('youtube_api', true)", None, 5, 3, once=True)
    w.link(api, okr, 0)
    ef = w.pg('Analytics API Failure Record', "SELECT ca_circuit_record('youtube_api', false, $1)", "[JSON.stringify($json.error ?? $json).slice(0, 300)]", 5, 2)
    w.link(api, ef, 1)
    t2 = w.sched('Weekly window suggestions', 0, 4, field='weeks', weeksInterval=1)
    aw = w.pg('Suggest/Apply Windows', "SELECT ca_apply_windows() AS applied", None, 1, 4)
    w.chain(t2, aw)
    e = w.add('API Record Earning', 'webhook', {"httpMethod": "POST", "path": "ca-api-earning", "responseMode": "lastNode", "authentication": "headerAuth", "options": {}}, 0, 6)
    v = w.code('Validate API Input', r"""const b = $input.first().json.body || {};
if (!['youtube', 'instagram', 'facebook'].includes(b.platform)) throw new Error('VALIDATION: platform');
if (!/^[A-Z]{3}$/.test(b.currency || '')) throw new Error('VALIDATION: currency must be ISO-4217, e.g. USD');
const amt = Number(b.gross_amount); if (!isFinite(amt) || amt < 0) throw new Error('VALIDATION: gross_amount');
if (!['estimated', 'confirmed'].includes(b.confirmation)) throw new Error('VALIDATION: confirmation must be estimated|confirmed');
return [{ json: { platform: b.platform, channel_id: b.channel_id || null, content_id: b.content_id || null, period_start: b.period_start, period_end: b.period_end, gross_amount: amt,
  currency: b.currency, usd_amount: b.usd_amount ?? null, program: b.program || null, rpm: b.rpm ?? null, confirmation: b.confirmation, payout_status: b.payout_status || null } }];""", 1, 6)
    ins2 = w.pg('Insert Earning', "INSERT INTO earnings(platform, channel_id, content_id, period_start, period_end, gross_amount, currency, usd_amount, program, rpm, confirmation, payout_status) "
                "VALUES ($1, $2::uuid, $3::uuid, $4::date, $5::date, $6::numeric, $7, $8::numeric, $9, $10::numeric, $11, $12) RETURNING id",
                "[$json.platform, $json.channel_id, $json.content_id, $json.period_start, $json.period_end, $json.gross_amount, $json.currency, $json.usd_amount, $json.program, $json.rpm, $json.confirmation, $json.payout_status]", 2, 6)
    w.chain(e, v, ins2)
    return w

# ============ 12 SUPERVISOR + RESOURCE MANAGER ============
def w12():
    w = WF('CA 12 Supervisor And Resource Manager', '12')
    w.sticky("Bounded supervisor (no recursive agents): every 2 min ca_supervisor_tick() recovers stuck jobs (retry ladder, max attempts -> dead_letter), moves cooled-down circuits to half_open, "
             "alerts on backlog/dead letters/low disk. Recovery levels 1-6 live in ca_job_fail. Resource snapshots arrive from tools/host_reporter.ps1 (n8n cannot read host CPU/RAM by itself).", 0, -2)
    t = w.sched('Every 2 minutes', 0, 0, field='minutes', minutesInterval=2)
    s = w.pg('Supervisor Tick', "SELECT ca_supervisor_tick() AS actions", None, 1, 0)
    w.chain(t, s)
    r = w.add('Resource Snapshot Webhook', 'webhook', {"httpMethod": "POST", "path": "ca-w-resource", "responseMode": "lastNode", "authentication": "headerAuth", "options": {}}, 0, 3)
    v = w.code('Validate Snapshot', r"""const b = $input.first().json.body || {}; const num = (x, lo, hi) => { const n = Number(x); if (!isFinite(n) || n < lo || n > hi) throw new Error('VALIDATION: out of range'); return n; };
return [{ json: { cpu: num(b.cpu_percent, 0, 100), ram: num(b.ram_percent, 0, 100), disk: num(b.disk_free_gb, 0, 100000) } }];""", 1, 3)
    i = w.pg('Insert Snapshot', "INSERT INTO resource_snapshots(cpu_percent, ram_percent, disk_free_gb) VALUES ($1::numeric, $2::numeric, $3::numeric) RETURNING id", "[$json.cpu, $json.ram, $json.disk]", 2, 3)
    w.chain(r, v, i)
    return w

# ============ 13 ERROR HANDLER ============
def w13():
    w = WF('CA 13 Error Handler', '13')
    w.sticky("Set THIS workflow as the 'Error Workflow' (Workflow settings) of every other CA workflow. Normalizes, redacts secrets, persists to errors, and raises a deduplicated CRITICAL notification.", 0, -2)
    t = w.add('Error Trigger', 'errtrig', {}, 0, 0)
    n = w.code('Normalize Error', r"""const e = $input.first().json; const msg = String(e.execution?.error?.message || 'unknown error');
const redact = s => String(s).replace(/(api[_-]?key|key|token|secret|authorization|bearer|password)["'=: ]+[A-Za-z0-9._\-]{8,}/gi, '$1=[redacted]').slice(0, 900);
let category = 'UNKNOWN'; if (/VALIDATION:/.test(msg)) category = 'VALIDATION'; else if (/RIGHTS:/.test(msg)) category = 'RIGHTS'; else if (/401|403|unauthori|token|credential/i.test(msg)) category = 'AUTH';
else if (/429|quota|rate/i.test(msg)) category = 'RATE_LIMIT'; else if (/ECONN|ETIMEDOUT|timeout|5\d\d/i.test(msg)) category = 'TRANSIENT';
const severity = ['AUTH', 'RIGHTS', 'POLICY'].includes(category) ? 'critical' : (category === 'UNKNOWN' ? 'error' : 'warning');
return [{ json: { category, severity, retryable: ['TRANSIENT', 'RATE_LIMIT', 'UNKNOWN'].includes(category), workflow: e.workflow?.name || 'unknown', node: e.execution?.lastNodeExecuted || null, message: redact(msg), execution_id: e.execution?.id || null } }];""", 1, 0)
    p = w.pg('Persist Error + Notify', "WITH e AS (INSERT INTO errors(category, severity, retryable, workflow, node, message, details) VALUES ($1, $2, $3::boolean, $4, $5, $6, jsonb_build_object('execution_id', $7::text)) RETURNING id) "
             "SELECT ca_notify(CASE WHEN $2 = 'critical' THEN 'CRITICAL' ELSE 'INFO' END, 'error', 'Workflow error: ' || $4 || ' / ' || COALESCE($5,'?') || ' (' || $1 || ')', $6, "
             "'err:' || $4 || ':' || COALESCE($5,'') || ':' || $1 || ':' || to_char(now(),'YYYYMMDDHH24'), NULL, NULL) FROM e",
             "[$json.category, $json.severity, $json.retryable, $json.workflow, $json.node, $json.message, $json.execution_id]", 2, 0)
    w.chain(t, n, p)
    return w

# ============ 14 NOTIFICATIONS (Gmail, critical/important only) ============
def w14():
    w = WF('CA 14 Notifications (Gmail)', '14')
    w.sticky("Only CRITICAL and IMPORTANT rows are emailed (INFO stays in the DB/frontend). Deduplicated at insert. Bodies are re-redacted here. Gmail failures open the 'gmail' circuit (bounded retries).", 0, -2)
    t = w.sched('Every 2 minutes', 0, 0, field='minutes', minutesInterval=2)
    q = w.pg('Claim Pending', "SELECT n.id, n.level, n.category, n.subject, n.body, (ca_setting('notify_email','\"\"'))#>>'{}' AS email FROM notifications n "
             "WHERE n.status = 'pending' AND n.level IN ('CRITICAL','IMPORTANT') AND ca_circuit_allowed('gmail') ORDER BY (n.level = 'CRITICAL') DESC, n.created_at LIMIT 10 FOR UPDATE SKIP LOCKED", None, 1, 0)
    ok = w.iff('Recipient Configured?', "/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test($json.email || '')", 2, 0)
    skip = w.pg('Skip (no recipient)', "UPDATE notifications SET status = 'skipped' WHERE id = $1::uuid", "[$json.id]", 3, 1)
    fmt = w.code('Format And Redact', r"""const redact = s => String(s || '').replace(/(api[_-]?key|key|token|secret|authorization|bearer|password)["'=: ]+[A-Za-z0-9._\-]{8,}/gi, '$1=[redacted]');
return $input.all().map(i => ({ json: { id: i.json.id, email: i.json.email, subject: '[' + i.json.level + '] ' + redact(i.json.subject).slice(0, 180), body: redact(i.json.body).slice(0, 3000) + '\n\n-- Content Automation System' } }));""", 3, 0)
    g = w.add('Send Gmail', 'gmail', {"resource": "message", "operation": "send", "sendTo": "={{ $json.email }}", "subject": "={{ $json.subject }}", "emailType": "text", "message": "={{ $json.body }}",
              "options": {"appendAttribution": False}}, 4, 0, onError='continueErrorOutput')
    sent = w.pg('Mark Sent', "UPDATE notifications SET status = 'sent', sent_at = now() WHERE id = $1::uuid RETURNING ca_circuit_record('gmail', true)", "[$('Format And Redact').item.json.id]", 5, 0)
    bad = w.pg('Record Gmail Failure', "SELECT ca_circuit_record('gmail', false, $1)", "[JSON.stringify($json.error ?? $json).slice(0, 300)]", 5, 1)
    w.chain(t, q, ok); w.link(ok, fmt, 0); w.link(ok, skip, 1); w.link(fmt, g); w.link(g, sent, 0); w.link(g, bad, 1)
    return w

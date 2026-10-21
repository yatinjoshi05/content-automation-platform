import json
from wf import *
OUT = {}

# ============ 01 MASTER ORCHESTRATOR ============
def w01():
    w = WF('CA 01 Master Orchestrator', '01')
    w.sticky("Master dispatcher. Every 15s claims ONE job from PostgreSQL (ca_claim_job honours concurrency, CPU/RAM/disk limits, circuit breakers, system_paused) "
             "and calls the worker workflow's webhook. Worker paths come from the job_type_config allowlist table; the base URL from settings. No workflow IDs are referenced.")
    t = w.sched('Tick (15s)', 0, 0, field='seconds', secondsInterval=15)
    c = w.pg('Claim Job', "SELECT j.job_id, j.job_type, c.webhook_path, (ca_setting('n8n_webhook_base','\"http://localhost:5678\"'))#>>'{}' AS base "
             "FROM ca_claim_job() j JOIN job_type_config c ON c.job_type = j.job_type", None, 1, 0)
    d = w.http('Dispatch Worker', 'POST', "={{ $json.base.replace(/\\/+$/, '') }}/webhook/{{ $json.webhook_path }}", 2, 0,
               body="={{ JSON.stringify({ job_id: $json.job_id }) }}", auth='httpHeaderAuth', timeout=15000)
    w.chain(t, c, d)
    cl = w.code('Dispatch Classify Error', CLASSIFY_JS.replace("$('Load Job')", "$('Claim Job')"), 3, 1)
    f = w.pg('Dispatch Fail Job', FAIL_SQL, FAIL_PARAM, 4, 1)
    w.link(d, cl, 1); w.link(cl, f)
    t2 = w.sched('Seed research (every 6h)', 0, 3, field='hours', hoursInterval=6)
    s2 = w.pg('Seed Research Jobs', "SELECT ca_seed_research() AS seeded", None, 1, 3)
    w.chain(t2, s2)
    return w

# ============ 02 TREND RESEARCH ============
def w02():
    w = WF('CA 02 Trend Research', '02'); w.path = 'ca-w-trend-research'
    lj = load_job(w, 0, 0)
    bs = w.code('Build Searches', r"""// one query per niche keyword (max 3); dates computed here, never hard-coded
const j = $input.first().json;
const kws = (j.keywords && j.keywords.length ? j.keywords : [j.niche_name]).filter(Boolean).slice(0, 3);
if (!kws.length) throw new Error('VALIDATION: channel has no niche keywords to research');
const after = new Date(Date.now() - 7 * 864e5).toISOString();
return kws.map(k => ({ json: { q: k, publishedAfter: after } }));""", 2, 0)
    se = w.http('YouTube Search', 'GET', "https://www.googleapis.com/youtube/v3/search", 3, 0, auth='httpQueryAuth',
                qs="={{ JSON.stringify({ part: 'snippet', type: 'video', order: 'viewCount', maxResults: 15, q: $json.q, publishedAfter: $json.publishedAfter, relevanceLanguage: 'en' }) }}")
    ids = w.code('Collect Video IDs', r"""const items = $input.all().flatMap(i => i.json.items || []);
const seen = new Set(); const ids = [];
for (const it of items) { const id = it.id?.videoId; if (id && !seen.has(id)) { seen.add(id); ids.push(id); } }
if (!ids.length) throw new Error('VALIDATION: YouTube search returned no videos');
return [{ json: { ids: ids.slice(0, 50).join(',') } }];""", 4, 0)
    vi = w.http('YouTube Video Stats', 'GET', "https://www.googleapis.com/youtube/v3/videos", 5, 0, auth='httpQueryAuth',
                qs="={{ JSON.stringify({ part: 'snippet,statistics', id: $json.ids }) }}")
    mom = w.code('Compute Momentum (deterministic)', r"""const now = Date.now(); const vids = ($input.first().json.items || []).map(v => {
  const hrs = Math.max(1, (now - new Date(v.snippet.publishedAt).getTime()) / 36e5);
  const views = Number(v.statistics?.viewCount || 0);
  return { id: v.id, url: 'https://www.youtube.com/watch?v=' + v.id, title: v.snippet.title, channel: v.snippet.channelTitle, views, vph: views / hrs };
}).sort((a, b) => b.vph - a.vph).slice(0, 25);
const maxv = Math.max(1, ...vids.map(v => v.vph));
vids.forEach(v => v.momentum = +(v.vph / maxv).toFixed(3));
const job = $('Load Job').first().json;
const prompt = `Channel niche: ${job.niche_name}. Existing channel keywords: ${(job.keywords || []).join(', ')}.\n` +
 `Recent high-velocity videos (real data, views-per-hour computed):\n` + vids.map(v => `- [${v.id}] ${v.title} | ${v.channel} | vph=${Math.round(v.vph)} | momentum=${v.momentum}`).join('\n') +
 `\n\nGroup these into up to 5 topics/formats. Use ONLY the video ids above as evidence. Set new_channel_opportunity=true ONLY if a topic is clearly OUTSIDE the channel niche but shows strong momentum. ` +
 `Return JSON: {"trends":[{"niche":str,"topic":str,"llm_score":0..1,"confidence":0..1,"evidence_ids":[ids],"recommended_content_format":str,"recommended_posting_frequency":str,"recommended_posting_windows":[str],"recommended_channel":str,"new_channel_opportunity":bool}]}. Scores are decision-support signals, never guarantees.`;
return [{ json: { vids, prompt, system: 'You are a careful short-form content trend analyst. Output valid JSON only. Never claim virality is guaranteed.' } }];""", 6, 0)
    w.chain(lj, bs, se, ids); w.link(ids, vi); w.link(vi, mom)
    for n in (se, vi): fail_path(w, n, n, 4 + (n == vi) * 2, 2)
    pick, okrec = llm_block(w, 7, 0, 'Compute Momentum (deterministic)', ['text', 'json'], 'Validate Trends')
    w.link(mom, pick)
    val = w.code('Validate Trends', r"""const d = $('Parse LLM JSON').first().json.data; const vids = $('Compute Momentum (deterministic)').first().json.vids;
const byId = Object.fromEntries(vids.map(v => [v.id, v]));
const out = [];
for (const t of (d.trends || []).slice(0, 5)) {
  const ev = (t.evidence_ids || []).filter(i => byId[i]);            // AI may not invent evidence
  if (!t.topic || !ev.length) continue;
  const det = ev.reduce((a, i) => a + byId[i].momentum, 0) / ev.length;
  const llm = Math.min(1, Math.max(0, Number(t.llm_score) || 0));
  out.push({ niche: String(t.niche || '').slice(0, 80), topic: String(t.topic).slice(0, 160), source: 'youtube_search+' + $('Parse LLM JSON').first().json.provider,
    trend_score: +((0.6 * det + 0.4 * llm).toFixed(3)), confidence: Math.min(1, Math.max(0, Number(t.confidence) || 0)),
    evidence: ev.map(i => ({ url: byId[i].url, title: byId[i].title, views_per_hour: Math.round(byId[i].vph) })),
    recommended_channel: t.recommended_channel || null, recommended_content_format: t.recommended_content_format || null,
    recommended_posting_frequency: t.recommended_posting_frequency || null, recommended_posting_windows: t.recommended_posting_windows || [],
    new_channel_opportunity: t.new_channel_opportunity === true });
}
return [{ json: { trends: out } }];""", 9, 0)
    st = w.pg('Store Trends + Enqueue Discovery', "SELECT ca_trend_store($1::uuid, $2::jsonb)", "[$('Load Job').first().json.job_id, JSON.stringify($json.trends)]", 10, 0)
    w.chain(val, st)
    return w

# ============ 03 SOURCE DISCOVERY ============
def w03():
    w = WF('CA 03 Source Discovery', '03'); w.path = 'ca-w-source-discovery'
    lj = load_job(w, 0, 0)
    cr = w.pg('Authorized Creators For Channel', "SELECT ac.id AS creator_id, ac.creator, ac.external_channel_id, ac.permission_status FROM authorized_creators ac "
              "JOIN channels ch ON ch.id = $1::uuid LEFT JOIN niches n ON n.id = ch.niche_id WHERE ac.status = 'active' AND ac.platform = 'youtube' "
              "AND ac.permission_status <> 'rejected' AND (cardinality(ac.niche_slugs) = 0 OR n.slug = ANY(ac.niche_slugs)) "
              "AND (ac.expiration_date IS NULL OR ac.expiration_date >= current_date)", "[$('Load Job').first().json.channel_id]", 2, 0, always=True)
    bq = w.code('Build Creator Queries', r"""const job = $('Load Job').first().json; const rows = $input.all().map(i => i.json).filter(r => r.creator_id);
if (!rows.length) throw new Error('VALIDATION: no authorized creators configured for this channel/niche - add rows to authorized_creators (rights registry). Discovery never searches unauthorized channels.');
const topic = job.payload.topic;
return rows.slice(0, 10).map(r => ({ json: { ...r, q: topic } }));""", 3, 0)
    se = w.http('YouTube Search (creator)', 'GET', "https://www.googleapis.com/youtube/v3/search", 4, 0, auth='httpQueryAuth',
                qs="={{ JSON.stringify({ part: 'snippet', type: 'video', channelId: $json.external_channel_id, q: $json.q, order: 'relevance', videoDuration: 'long', maxResults: 8 }) }}")
    ids = w.code('Collect IDs', r"""const creators = $('Build Creator Queries').all().map(i => i.json);
const meta = {}; const items = $input.all();
items.forEach((it, idx) => { const cr = creators[idx] || creators[0]; for (const v of (it.json.items || [])) if (v.id?.videoId) meta[v.id.videoId] = { creator_id: cr.creator_id, creator: cr.creator }; });
const ids = Object.keys(meta); if (!ids.length) throw new Error('VALIDATION: no candidate videos found from authorized creators for this topic');
return [{ json: { ids: ids.slice(0, 50).join(','), meta } }];""", 5, 0)
    vi = w.http('YouTube Video Details', 'GET', "https://www.googleapis.com/youtube/v3/videos", 6, 0, auth='httpQueryAuth',
                qs="={{ JSON.stringify({ part: 'snippet,contentDetails,status', id: $json.ids }) }}")
    fl = w.code('Normalize Filter Score', r"""const meta = $('Collect IDs').first().json.meta; const job = $('Load Job').first().json;
const dur = s => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(s || '') || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };
const words = String(job.payload.topic || '').toLowerCase().split(/\W+/).filter(w => w.length > 2);
const seen = new Set(); const out = [];
for (const v of ($input.first().json.items || [])) {
  const id = v.id; if (!/^[\w-]{11}$/.test(id) || seen.has(id)) continue; seen.add(id);        // validated id, in-batch dedup
  if (v.status?.privacyStatus !== 'public') continue;
  const d = dur(v.contentDetails?.duration); if (d < 480) continue;                             // long-form only
  const t = (v.snippet?.title || '').toLowerCase();
  const rel = words.length ? words.filter(w => t.includes(w)).length / words.length : 0;
  if (rel < 0.34) continue;                                                                      // relevance floor (deterministic)
  const m = meta[id] || {};
  out.push({ json: { canonical_id: 'youtube:' + id, normalized_url: 'https://www.youtube.com/watch?v=' + id, source_platform: 'youtube', platform_video_id: id,
    creator: m.creator, authorized_creator_id: m.creator_id, title: (v.snippet.title || '').slice(0, 200), duration_seconds: d, relevance_score: +rel.toFixed(2),
    trend_id: job.payload.trend_id, channel_id: job.channel_id, metadata: { published_at: v.snippet.publishedAt } } });
}
return out.length ? out.slice(0, 5) : [{ json: { none: true } }];""", 7, 0)
    hasr = w.iff('Any Sources?', "!$json.none", 8, 0)
    reg = w.pg('Register Source (dedup + enqueue rights)', "SELECT ca_register_source($1::jsonb)", "[JSON.stringify($json)]", 9, 0)
    fin = w.pg('Complete Job', "SELECT ca_job_done($1::uuid, $2::jsonb)", "[$('Load Job').first().json.job_id, JSON.stringify({ registered: $('Register Source (dedup + enqueue rights)').all().map(i => i.json.ca_register_source) })]", 10, 0, once=True)
    none = w.pg('No Sources - Complete', "SELECT ca_job_done($1::uuid, '{\"sources\":0}'::jsonb)", "[$('Load Job').first().json.job_id]", 9, 1)
    w.chain(lj, cr, bq, se, ids); w.link(ids, vi); w.chain(vi, fl, hasr); w.link(hasr, reg, 0); w.link(hasr, none, 1); w.link(reg, fin)
    for n, x in ((se, 5), (vi, 7)): fail_path(w, n, n, x, 2)
    # bq / ids validation errors are thrown -> caught by the workflow-level Error Workflow (13) which persists them; also fail the job here
    return w

# ============ 04 RIGHTS ============
def w04():
    w = WF('CA 04 Rights Verification', '04'); w.path = 'ca-w-rights'
    lj = load_job(w, 0, 0)
    st = w.pg('Rights Stage (gate + route)', "SELECT ca_rights_stage($1::uuid) AS gate", "[$json.job_id]", 2, 0)
    w.chain(lj, st)
    w.sticky("Rights gate is deterministic SQL (ca_rights_gate): verified -> policy stage; pending/needs_human_review -> human review (IMPORTANT email); rejected/expired/missing -> hard stop (CRITICAL email). "
             "Second entry point below lets you (or the future frontend) resolve a source by supplying evidence.", 0, 2)
    return w

def w04b(w):
    r = w.add('API Source Review', 'webhook', {"httpMethod": "POST", "path": "ca-api-source-review", "responseMode": "lastNode", "authentication": "headerAuth", "options": {}}, 0, 4)
    v = w.code('Validate Review Input', r"""const b = $input.first().json.body || {};
if (!/^[0-9a-f-]{36}$/i.test(b.source_id || '')) throw new Error('VALIDATION: source_id must be a UUID');
if (!['verify', 'reject'].includes(b.action)) throw new Error('VALIDATION: action must be verify|reject');
if (b.action === 'verify' && !String(b.evidence || '').trim()) throw new Error('VALIDATION: evidence is required to verify rights');
const allow = ['youtube', 'instagram', 'facebook'];
return [{ json: { source_id: b.source_id, action: b.action, evidence: b.evidence, evidence_url: b.evidence_url || null, allowed_platforms: (b.allowed_platforms || []).filter(p => allow.includes(p)),
  commercial_use_allowed: b.commercial_use_allowed ?? null, monetization_allowed: b.monetization_allowed ?? null, attribution_required: !!b.attribution_required, attribution_text: b.attribution_text || null, by: b.by || 'owner' } }];""", 1, 4)
    p = w.pg('Apply Review', "SELECT ca_source_review($1::jsonb) AS result", "[JSON.stringify($json)]", 2, 4)
    w.chain(r, v, p)

# ============ 05 MONETIZATION & POLICY ============
def w05():
    w = WF('CA 05 Monetization And Policy', '05'); w.path = 'ca-w-policy'
    lj = load_job(w, 0, 0)
    ctx = w.pg('Policy Context', "SELECT s.source_id, s.title, s.creator, s.source_platform, ch.platforms, "
               "(SELECT to_jsonb(p) FROM permissions p WHERE p.source_id = s.source_id AND p.status = 'active' ORDER BY created_at DESC LIMIT 1) AS permission, "
               "ca_setting('policy_source_urls', '{}'::jsonb) AS policy_urls, "
               "(CASE WHEN $3::boolean THEN '{}'::jsonb ELSE (SELECT COALESCE(jsonb_object_agg(platform, summary), '{}'::jsonb) FROM policy_knowledge WHERE expires_at > now()) END) AS cached "
               "FROM sources s JOIN channels ch ON ch.id = $2::uuid WHERE s.source_id = $1::uuid",
               "[$json.entity_id, $json.channel_id, $json.payload.force_refresh === true]", 2, 0)
    urls = w.code('Plan Policy Fetch', r"""const c = $input.first().json; const items = [];
for (const p of c.platforms) {
  if (c.cached && c.cached[p]) continue;                                   // fresh cached research is reused (refreshed every policy_refresh_days)
  for (const u of (c.policy_urls[p] || [])) { if (/^https:\/\//.test(u)) items.push({ json: { platform: p, url: u } }); }
}
return items.length ? items : [{ json: { none: true, cache_ok: c.platforms.every(p => c.cached && c.cached[p]) } }];""", 3, 0)
    fetch_needed = w.iff('Need Fetch?', "!$json.none", 4, 0)
    ft = w.http('Fetch Official Policy Page', 'GET', "={{ $json.url }}", 5, 0, timeout=30000, fmt='text')
    stash = w.code('Assemble Policy Text', r"""const plan = $('Plan Policy Fetch').all().map(i => i.json);
const byPlat = {}; $input.all().forEach((it, i) => { const p = plan[i]?.platform; if (!p) return;
  const txt = String(it.json.data ?? it.json).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 9000);
  byPlat[p] = (byPlat[p] || []).concat([{ url: plan[i].url, text: txt }]); });
const c = $('Policy Context').first().json; const job = $('Load Job').first().json;
const prompt = `Assess each platform ONLY from the provided policy text (and cached summaries). If the text does not address something, mark it unknown - do not guess.\n` +
 `Source: "${c.title}" by ${c.creator}. Rights record: ${JSON.stringify(c.permission || {})}\nPlatforms: ${c.platforms.join(', ')}\n` +
 `Cached summaries: ${JSON.stringify(c.cached || {})}\nFetched policy text: ${JSON.stringify(byPlat)}\n\n` +
 `Return JSON {"assessments":[{"platform":str,"monetization_status":"pass|conditional|review_required|blocked","policy_risk":"low|medium|high|unknown","reasons":[str],"required_actions":[str],"evidence":[{"url":str,"note":str}]}]}. ` +
 `Remember: permission to use content is NOT monetization eligibility. Never write "guaranteed", "definitely safe".`;
return [{ json: { prompt, system: 'You are a cautious platform-policy analyst. Output valid JSON only. Uncertain => review_required.', byPlat, fetched: Object.keys(byPlat).length > 0 } }];""", 6, 0)
    nourls = w.code('No Policy Sources Configured', r"""const c = $('Policy Context').first().json;
const a = c.platforms.map(p => ({ platform: p, rights_status: c.permission?.permission_status || 'unknown', monetization_status: 'review_required', policy_risk: 'unknown',
  reasons: ['No official policy source URLs are configured (settings.policy_source_urls) and no fresh cached research exists'], required_actions: ['Configure policy_source_urls for ' + p + ' or review the platform policy manually'], evidence: [], checked_at: new Date().toISOString() }));
return [{ json: { assessments: a } }];""", 5, 2)
    cache_ok = w.iff('Cache Covers Platforms?', "$json.cache_ok === true", 5, 1)
    w.chain(lj, ctx, urls, fetch_needed); w.link(fetch_needed, ft, 0); w.link(fetch_needed, cache_ok, 1); w.link(ft, stash)
    w.link(cache_ok, stash, 0); w.link(cache_ok, nourls, 1)   # fresh cached policy research is used (not discarded); nothing cached + no URLs => review_required
    fail_path(w, 'Fetch', ft, 6, 2)
    pick, okrec = llm_block(w, 7, 0, 'Assemble Policy Text', ['text', 'json'], 'Validate Assessments')
    w.link(stash, pick)
    val = w.code('Validate Assessments', r"""const d = $('Parse LLM JSON').first().json.data; const c = $('Policy Context').first().json;
const okS = ['pass', 'conditional', 'review_required', 'blocked'], okR = ['low', 'medium', 'high', 'unknown'];
const seen = {}; const out = [];
for (const a of (d.assessments || [])) { if (!c.platforms.includes(a.platform) || seen[a.platform]) continue; seen[a.platform] = 1;
  let st = okS.includes(a.monetization_status) ? a.monetization_status : 'review_required'; let risk = okR.includes(a.policy_risk) ? a.policy_risk : 'unknown';
  const actions = Array.isArray(a.required_actions) ? a.required_actions.slice(0, 8) : [];
  // Deterministic guard: reused third-party content can never be an unconditional 'pass' - permission != monetization eligibility.
  if (st === 'pass') { st = 'conditional'; actions.unshift('Add original commentary/transformation; permission alone does not establish monetization eligibility'); }
  if (!(a.evidence || []).length) { if (st === 'conditional') st = 'review_required'; }              // no evidence => human review
  out.push({ platform: a.platform, rights_status: c.permission?.permission_status || 'unknown', monetization_status: st, policy_risk: risk,
    reasons: (a.reasons || []).slice(0, 8), required_actions: actions, evidence: (a.evidence || []).slice(0, 6), checked_at: new Date().toISOString() }); }
for (const p of c.platforms) if (!seen[p]) out.push({ platform: p, rights_status: c.permission?.permission_status || 'unknown', monetization_status: 'review_required', policy_risk: 'unknown',
  reasons: ['Model returned no assessment for this platform'], required_actions: ['Manual policy review'], evidence: [], checked_at: new Date().toISOString() });
return [{ json: { assessments: out } }];""", 9, 0)
    store = w.pg('Store Assessments (+ enqueue clipping unless blocked)', "SELECT ca_policy_store($1::uuid, $2::jsonb, $3::boolean) AS result", "[$('Load Job').first().json.job_id, JSON.stringify($json.assessments), $('Assemble Policy Text').first().json.fetched === true]", 10, 0)
    w.link(val, store); w.link(nourls, store)
    return w

from wf import *
def w15():
    w = WF('CA 15 Visual QA And Thumbnail', '15'); w.path = 'ca-w-visual-qa'
    w.sticky("Heavy job. Calls the host-side ffmpeg QA worker (tools/qa_worker.js): playable, duration, 9:16, resolution, audio present/level, black/frozen frames, thumbnail generation+validation. "
             "NOT assessed (reported honestly): speaker framing, subtitles. Result gates automatic mode AND the final pre-publish gate. If the worker is down the job retries/dead-letters - content never skips QA.")
    lj = load_job(w, 0, 0)
    ctx = w.pg('QA Context', "SELECT cl.clip_id, cl.video_url, ch.clip_min_seconds, ch.clip_max_seconds, (ca_setting('qa_worker_url','\"http://localhost:9100\"'))#>>'{}' AS qa_url, "
               "(ca_setting('openshorts_base_url','\"http://localhost:8000\"'))#>>'{}' AS os_base FROM clips cl JOIN channels ch ON ch.id = $2::uuid WHERE cl.clip_id = $1::uuid",
               "[$json.payload.clip_id, $json.channel_id]", 2, 0)
    g = w.code('Guard QA Request', r"""const parseUrl = s => { const m = /^(https?):\/\/([A-Za-z0-9.\-]+)(?::(\d+))?(\/[^\s]*)?$/.exec(String(s || '')); if (!m) return null; return { host: m[2].toLowerCase() + (m[3] ? ':' + m[3] : ''), href: m[0] }; };
const c = $input.first().json; const job = $('Load Job').first().json;
const v = parseUrl(c.video_url), b = parseUrl(c.os_base), q = parseUrl(c.qa_url);
if (!v) throw new Error('VALIDATION: clip has no valid video_url'); if (!b || !q) throw new Error('VALIDATION: openshorts_base_url / qa_worker_url malformed');
if (v.host !== b.host) throw new Error('VALIDATION: clip url host is not the configured clip engine host');
return [{ json: { qa_url: q.href.replace(/\/+$/, ''), body: { video_url: v.href, min_seconds: c.clip_min_seconds, max_seconds: c.clip_max_seconds, thumb_name: 'c-' + String(c.clip_id).replace(/-/g, '') + '-v' + job.payload.version } } }];""", 3, 0)
    qa = w.http('QA Worker', 'POST', "={{ $json.qa_url }}/qa", 4, 0, auth='httpHeaderAuth', body="={{ JSON.stringify($json.body) }}", timeout=300000)
    st = w.pg('Store Visual QA (+ enqueue approval)', "SELECT ca_visual_qa_store($1::uuid, $2::jsonb) AS result", "[$('Load Job').first().json.job_id, JSON.stringify($json)]", 5, 0)
    w.chain(lj, ctx, g, qa); w.link(qa, st); fail_path(w, 'QA', qa, 5, 2)
    return w
def w05_api(w):
    r = w.add('API Policy Review', 'webhook', {"httpMethod": "POST", "path": "ca-api-policy-review", "responseMode": "lastNode", "authentication": "headerAuth", "options": {}}, 0, 6)
    v = w.code('Validate Review Input', r"""const b = $input.first().json.body || {};
if (!/^[0-9a-f-]{36}$/i.test(b.source_id || '')) throw new Error('VALIDATION: source_id must be a UUID');
if (!['approved', 'rejected', 'changes_requested'].includes(b.decision)) throw new Error('VALIDATION: decision must be approved|rejected|changes_requested');
if (!String(b.reason || '').trim()) throw new Error('VALIDATION: reason is required'); if (!String(b.reviewer || '').trim()) throw new Error('VALIDATION: reviewer is required');
if (b.platform && !['youtube', 'instagram', 'facebook'].includes(b.platform)) throw new Error('VALIDATION: platform');
return [{ json: { source_id: b.source_id, decision: b.decision, reason: String(b.reason).slice(0, 1000), reviewer: String(b.reviewer).slice(0, 80), platform: b.platform || null,
  content_id: /^[0-9a-f-]{36}$/i.test(b.content_id || '') ? b.content_id : null, content_version: Number.isInteger(b.content_version) ? b.content_version : null, evidence: Array.isArray(b.evidence) ? b.evidence.slice(0, 10) : [] } }];""", 1, 6)
    p = w.pg('Apply Policy Review', "SELECT ca_policy_review($1::jsonb) AS result", "[JSON.stringify($json)]", 2, 6)
    w.chain(r, v, p)

def w09_api(w):
    r = w.add('API Publication Reconcile', 'webhook', {"httpMethod": "POST", "path": "ca-api-publication-reconcile", "responseMode": "lastNode", "authentication": "headerAuth", "options": {}}, 0, 8)
    v = w.code('Validate Reconcile Input', r"""const b = $input.first().json.body || {};
if (!/^[0-9a-f-]{36}$/i.test(b.publication_id || '')) throw new Error('VALIDATION: publication_id must be a UUID');
if (!['published', 'not_published'].includes(b.outcome)) throw new Error('VALIDATION: outcome must be published|not_published');
if (!String(b.reason || '').trim()) throw new Error('VALIDATION: reason is required (what did you check on the platform?)');
if (b.outcome === 'published' && !String(b.post_id || '').trim()) throw new Error('VALIDATION: post_id is required to confirm a publication');
return [{ json: { publication_id: b.publication_id, outcome: b.outcome, post_id: b.post_id ? String(b.post_id).slice(0, 200) : null, reason: String(b.reason).slice(0, 500), by: String(b.by || 'owner').slice(0, 80) } }];""", 1, 8)
    p = w.pg('Reconcile Publication', "SELECT ca_publication_reconcile($1::jsonb) AS result", "[JSON.stringify($json)]", 2, 8)
    w.chain(r, v, p)

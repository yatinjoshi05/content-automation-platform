// Executes the REAL jsCode of workflow Code nodes with mocked n8n globals ($input, $('Node'), $env). Run: node test_code_nodes.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
function findWorkflowPath(f) {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'workflows', f),
    path.resolve(__dirname, '..', 'workflows', f),
    path.resolve(__dirname, '..', f),
    path.resolve(process.cwd(), 'workflows', f),
    path.resolve(process.cwd(), f)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`Workflow file '${f}' not found. Checked:\n  ${candidates.join('\n  ')}`);
}
const load = f => JSON.parse(fs.readFileSync(findWorkflowPath(f), 'utf8'));
const code = (f, name) => load(f).nodes.find(n => n.name === name).parameters.jsCode;
function run(f, name, { input = {}, nodes = {}, env = {}, prev = 'X' } = {}) {
  const $ = n => { if (!(n in nodes)) throw new Error('mock missing node ' + n); const v = nodes[n]; const arr = Array.isArray(v) ? v : [v];
    return { first: () => ({ json: arr[0] }), all: () => arr.map(j => ({ json: j })), item: { json: arr[0] } }; };
  const items = Array.isArray(input) ? input : [input];
  const $input = { first: () => ({ json: items[0] }), all: () => items.map(j => ({ json: j })) };
  const vm = require('vm'); const ctx = vm.createContext({ $input, $, $env: env, $prevNode: { name: prev }, require, Buffer, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Set, Map, Promise, isFinite, isNaN, parseInt, parseFloat, structuredClone, console });
  return vm.runInContext('(function(){' + code(f, name) + '\n})()', ctx).map(x => x.json);   // sandbox without URL/fetch (matches real n8n)
}
let pass = 0, fail = 0; const t = (n, fn) => { try { fn(); pass++; console.log('PASS', n); } catch (e) { fail++; console.log('FAIL', n, '-', e.message); } };
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
const throws = (fn, re) => { try { fn(); } catch (e) { if (re.test(e.message)) return; throw new Error('wrong error: ' + e.message); } throw new Error('did not throw'); };

// --- OpenShorts webhook signature (algorithm per OpenShorts examples/n8n README) ---
const body = { event: 'job.completed', job_id: 'abc', status: 'completed', clips: [{ index: 0, title: 't', video_url: 'u', download_url: 'd' }] };
const sign = (b, s) => 'sha256=' + crypto.createHmac('sha256', s).update(JSON.stringify(b)).digest('hex');
t('signature: valid HMAC accepted', () => { const r = run('06_clipping.json', 'Verify Signature', { input: { headers: { 'x-openshorts-signature': sign(body, 's3cret') }, body }, env: { OPENSHORTS_WEBHOOK_SECRET: 's3cret' } })[0]; eq(r.valid, true); eq(r.clips.length, 1); });
t('signature: wrong secret rejected', () => eq(run('06_clipping.json', 'Verify Signature', { input: { headers: { 'x-openshorts-signature': sign(body, 'other') }, body }, env: { OPENSHORTS_WEBHOOK_SECRET: 's3cret' } })[0].valid, false));
t('signature: tampered body rejected', () => eq(run('06_clipping.json', 'Verify Signature', { input: { headers: { 'x-openshorts-signature': sign(body, 's3cret') }, body: { ...body, job_id: 'evil' } }, env: { OPENSHORTS_WEBHOOK_SECRET: 's3cret' } })[0].valid, false));
t('signature: missing header / missing secret rejected', () => { eq(run('06_clipping.json', 'Verify Signature', { input: { headers: {}, body }, env: { OPENSHORTS_WEBHOOK_SECRET: 's' } })[0].valid, false); eq(run('06_clipping.json', 'Verify Signature', { input: { headers: {}, body }, env: {} })[0].valid, false); });

// --- Clipping guard: rights + allowlists (TEST 3 in code path, no arbitrary URLs) ---
const ctx = (o = {}) => ({ source_status: 'rights_verified', rights: { decision: 'verified', reasons: [] }, normalized_url: 'https://www.youtube.com/watch?v=abcdefghijk', allowed: ['www.youtube.com'], os_base: 'http://localhost:8000', n8n_base: 'http://localhost:5678', ...o });
t('guard: verified source passes, builds webhook url', () => { const r = run('06_clipping.json', 'Guard (rights + allowlists)', { input: ctx() })[0]; eq(r.webhook_url, 'http://localhost:5678/webhook/ca-openshorts-done'); });
t('guard: missing rights => RIGHTS error (no acknowledgement sent)', () => throws(() => run('06_clipping.json', 'Guard (rights + allowlists)', { input: ctx({ rights: { decision: 'blocked', reasons: ['no permission record'] } }) }), /^RIGHTS:/));
t('guard: rights_blocked status => RIGHTS', () => throws(() => run('06_clipping.json', 'Guard (rights + allowlists)', { input: ctx({ source_status: 'rights_blocked' }) }), /^RIGHTS:/));
t('guard: non-allowlisted host rejected', () => throws(() => run('06_clipping.json', 'Guard (rights + allowlists)', { input: ctx({ normalized_url: 'https://evil.example/x' }) }), /allowed_source_domains/));
t('guard: http:// and file:// rejected', () => { throws(() => run('06_clipping.json', 'Guard (rights + allowlists)', { input: ctx({ normalized_url: 'http://www.youtube.com/watch?v=x' }) }), /allowed_source_domains/); throws(() => run('06_clipping.json', 'Guard (rights + allowlists)', { input: ctx({ normalized_url: 'file:///etc/passwd' }) }), /bad source url/); });
t('guard: malicious openshorts base rejected', () => throws(() => run('06_clipping.json', 'Guard (rights + allowlists)', { input: ctx({ os_base: 'http://x;rm -rf /' }) }), /malformed/));
t('openshorts response without job_id => VALIDATION (no hallucinated field)', () => throws(() => run('06_clipping.json', 'Read OpenShorts Job Id', { input: { foo: 1 } }), /^VALIDATION:/));

// --- error classification (retry ladder input) ---
const cls = (err, wf = '02_trend_research.json', node = 'Trend Research Classify Error') => run('01_master_orchestrator.json', 'Dispatch Classify Error', { input: err, nodes: { 'Claim Job': { job_id: 'J1' } } })[0];
t('classify: 401 => AUTH', () => eq(cls({ error: 'Request failed with status code 401' }).category, 'AUTH'));
t('classify: 429 => RATE_LIMIT', () => eq(cls({ error: { message: 'HTTP 429 quota exceeded' } }).category, 'RATE_LIMIT'));
t('classify: ECONNREFUSED / 503 => TRANSIENT', () => { eq(cls({ error: 'connect ECONNREFUSED 127.0.0.1:8000' }).category, 'TRANSIENT'); eq(cls({ error: '503 Service Unavailable' }).category, 'TRANSIENT'); });
t('classify: missing n8n credential => AUTH (found in real run: was UNKNOWN)', () => eq(cls({ error: 'Node does not have any credentials set' }).category, 'AUTH'));
t('classify: VALIDATION:/RIGHTS: prefixes win', () => { eq(cls({ error: 'VALIDATION: permission text 403' }).category, 'VALIDATION'); eq(cls({ error: 'RIGHTS: blocked' }).category, 'RIGHTS'); });
t('classify: secrets redacted', () => { const m = cls({ error: 'failed api_key=AIzaSyDUMMYDUMMYDUMMY1234 status 500' }).message; if (/AIzaSyDUMMY/.test(m)) throw new Error('leaked'); });

// --- policy validator: no guaranteed pass, evidence required ---
const pctx = { platforms: ['youtube', 'instagram'], permission: { permission_status: 'verified' } };
t('policy: model "pass" is downgraded (permission != monetization)', () => { const r = run('05_monetization_policy.json', 'Validate Assessments', { nodes: { 'Parse LLM JSON': { data: { assessments: [{ platform: 'youtube', monetization_status: 'pass', policy_risk: 'low', evidence: [{ url: 'https://x' }] }] } }, 'Policy Context': pctx } })[0].assessments;
  const y = r.find(a => a.platform === 'youtube'); eq(y.monetization_status, 'conditional'); if (!/commentary/.test(y.required_actions[0])) throw new Error('missing required action'); });
t('policy: no evidence => review_required; missing platform => review_required', () => { const r = run('05_monetization_policy.json', 'Validate Assessments', { nodes: { 'Parse LLM JSON': { data: { assessments: [{ platform: 'youtube', monetization_status: 'pass', evidence: [] }] } }, 'Policy Context': pctx } })[0].assessments;
  eq(r.find(a => a.platform === 'youtube').monetization_status, 'review_required'); eq(r.find(a => a.platform === 'instagram').monetization_status, 'review_required'); });
t('policy: garbage status => review_required', () => eq(run('05_monetization_policy.json', 'Validate Assessments', { nodes: { 'Parse LLM JSON': { data: { assessments: [{ platform: 'youtube', monetization_status: 'GUARANTEED', evidence: [{}] }] } }, 'Policy Context': { ...pctx, platforms: ['youtube'] } } })[0].assessments[0].monetization_status, 'review_required'));
t('policy: no URLs configured => review_required (fail safe, no invented research)', () => { const r = run('05_monetization_policy.json', 'No Policy Sources Configured', { nodes: { 'Policy Context': pctx } })[0].assessments; eq(r.every(a => a.monetization_status === 'review_required' && a.policy_risk === 'unknown'), true); });

// --- trend validator: AI may not invent evidence ---
const vids = [{ id: 'v1', url: 'u1', title: 'A', vph: 100, momentum: 1 }, { id: 'v2', url: 'u2', title: 'B', vph: 50, momentum: 0.5 }];
t('trend: invented evidence dropped, score blends deterministic momentum', () => { const r = run('02_trend_research.json', 'Validate Trends', { nodes: { 'Parse LLM JSON': { provider: 'ollama', data: { trends: [{ topic: 'ok', evidence_ids: ['v1', 'zzz'], llm_score: 0.5, confidence: 0.7 }, { topic: 'fake', evidence_ids: ['nope'], llm_score: 1 }] } }, 'Compute Momentum (deterministic)': { vids } } })[0].trends;
  eq(r.length, 1); eq(r[0].trend_score, 0.8); eq(r[0].evidence.length, 1); });
t('trend: score clamped to [0,1]', () => { const r = run('02_trend_research.json', 'Validate Trends', { nodes: { 'Parse LLM JSON': { provider: 'x', data: { trends: [{ topic: 't', evidence_ids: ['v1'], llm_score: 99, confidence: 5 }] } }, 'Compute Momentum (deterministic)': { vids } } })[0].trends[0]; eq(r.trend_score <= 1 && r.confidence <= 1, true); });

// --- discovery normalizer ---
const dctx = { 'Collect IDs': { meta: { abcdefghijk: { creator_id: 'c1', creator: 'Cr' } } }, 'Load Job': { channel_id: 'ch1', payload: { topic: 'cat fails funny', trend_id: 't1' } } };
const vid = (id, o = {}) => ({ id, status: { privacyStatus: 'public' }, contentDetails: { duration: 'PT45M10S' }, snippet: { title: 'Funny cat fails compilation', publishedAt: '2026-09-01T00:00:00Z' }, ...o });
t('discovery: canonical id + normalized url + long-form kept', () => { const r = run('03_source_discovery.json', 'Normalize Filter Score', { input: { items: [vid('abcdefghijk')] }, nodes: dctx }); eq(r[0].canonical_id, 'youtube:abcdefghijk'); eq(r[0].duration_seconds, 2710); });
t('discovery: shorts/private/irrelevant/invalid-id/dup filtered', () => { const r = run('03_source_discovery.json', 'Normalize Filter Score', { input: { items: [vid('abcdefghijk', { contentDetails: { duration: 'PT2M' } }), vid('abcdefghijl', { status: { privacyStatus: 'private' } }), vid('abcdefghijm', { snippet: { title: 'Tax law lecture', publishedAt: 'x' } }), vid('bad id!'), vid('abcdefghijn'), vid('abcdefghijn')] }, nodes: dctx }); eq(r.length, 1); eq(r[0].platform_video_id, 'abcdefghijn'); });

// --- packaging QA ---
const pk = (per, extra = {}) => run('07_content_packaging.json', 'Validate And QA', { nodes: { 'Load Job': { platforms: ['youtube', 'instagram'], rules: { banned_phrases: ['giveaway'] }, clip_min_seconds: 15, clip_max_seconds: 60 },
  'Clip Context': { duration: 30, max_hashtags: 3, recent_titles: ['Old title'], attribution_required: true, attribution_text: 'Credit: Creator X', ...extra }, 'Parse LLM JSON': { provider: 'ollama', data: { hook_strength: 0.8, hook_text: 'h', per_platform: per } } } })[0];
const good = { youtube: { title: 'New title', description: 'd', hashtags: ['a', 'b', 'c', 'd', 'e'] }, instagram: { title: 'IG', description: 'd', hashtags: ['x'] } };
t('qa: hashtags capped, attribution appended, per-platform variants kept', () => { const r = pk(good); eq(r.per.youtube.hashtags.length, 3); if (!/Credit: Creator X/.test(r.per.instagram.description)) throw new Error('no attribution'); eq(r.qa.metadata_valid, true); });
t('qa: banned phrase / guarantee language fails metadata', () => { eq(pk({ ...good, youtube: { ...good.youtube, title: 'Giveaway now' } }).qa.metadata_valid, false); eq(pk({ ...good, youtube: { ...good.youtube, description: 'guaranteed views' } }).qa.metadata_valid, false); });
t('qa: duplicate title + missing platform lower score; visual_checked stays false', () => { const r = pk({ youtube: { title: 'old title', description: 'd', hashtags: [] } }); eq(r.qa.unique_title, false); eq(r.qa.metadata_valid, false); eq(r.qa.visual_checked, false); if (r.score >= 0.7) throw new Error('score too high'); });
t('qa: out-of-range duration flagged', () => eq(pk(good, { duration: 200 }).qa.duration_ok, false));

// --- publishing guards ---
const pg = o => run('10_publishing.json', 'Guard Media And Adapter', { input: { platform: 'youtube', verified: 'true', yt_privacy: 'private', meta: { title: 't' }, video_url: 'http://localhost:8000/clips/a.mp4', os_base: 'http://localhost:8000', ...o } })[0];
t('publish guard: ok on engine host', () => eq(pg({}).platform, 'youtube'));
t('publish guard: unverified adapter => UNSUPPORTED (fails closed)', () => throws(() => pg({ platform: 'instagram', verified: 'false' }), /^UNSUPPORTED:/));
t('publish guard: foreign media host rejected', () => throws(() => pg({ video_url: 'http://evil.example/a.mp4' }), /clip engine host/));
t('publish guard: missing metadata rejected', () => throws(() => pg({ meta: null }), /^VALIDATION:/));

// --- API validators ---
t('approval API: bad uuid/action rejected; edit sanitised to allowed platforms', () => { const f = b => run('08_approval.json', 'Validate API Input', { input: { body: b } })[0];
  throws(() => f({ approval_id: 'x', action: 'approve' }), /UUID/); throws(() => f({ approval_id: '00000000-0000-0000-0000-000000000001', action: 'drop table' }), /action/);
  const r = f({ approval_id: '00000000-0000-0000-0000-000000000001', action: 'edit', per_platform: { youtube: { title: 'x'.repeat(500), hashtags: ['a'] }, tiktok: { title: 'no' } } }); eq(Object.keys(r.per_platform), ['youtube']); eq(r.per_platform.youtube.title.length, 150); });
t('reschedule API: requires ISO date & allowed platform', () => { const f = b => run('09_scheduler.json', 'Validate API Input', { input: { body: b } })[0]; throws(() => f({ content_id: '00000000-0000-0000-0000-000000000001', platform: 'tiktok', scheduled_at: '2026-10-02T20:00:00+05:30' }), /platform/);
  throws(() => f({ content_id: '00000000-0000-0000-0000-000000000001', platform: 'youtube', scheduled_at: 'soon' }), /ISO/); eq(f({ content_id: '00000000-0000-0000-0000-000000000001', platform: 'youtube', scheduled_at: '2026-10-02T20:00:00+05:30' }).scheduled_at, '2026-10-02T14:30:00.000Z'); });
t('earnings API: estimated vs confirmed enforced', () => throws(() => run('11_analytics.json', 'Validate API Input', { input: { body: { platform: 'youtube', currency: 'USD', gross_amount: 1, confirmation: 'sure' } } }), /confirmation/));
t('resource API: range-checked', () => throws(() => run('12_supervisor.json', 'Validate Snapshot', { input: { body: { cpu_percent: 500, ram_percent: 1, disk_free_gb: 1 } } }), /range/));

// --- notifications redaction ---
t('email: secrets redacted before Gmail', () => { const r = run('14_notifications.json', 'Format And Redact', { input: [{ id: '1', email: 'a@b.co', level: 'CRITICAL', subject: 'x', body: 'token=ya29.ABCDEFGHIJKLMNOP1234 failed' }] })[0]; if (/ya29/.test(r.body)) throw new Error('leaked'); eq(/^\[CRITICAL\]/.test(r.subject), true); });
t('error handler: normalizes + classifies + redacts', () => { const r = run('13_error_handler.json', 'Normalize Error', { input: { workflow: { name: 'CA 10 Publishing' }, execution: { id: '9', lastNodeExecuted: 'YouTube Upload', error: { message: 'Request failed 401 unauthorized api_key=AAAABBBBCCCCDDDD' } } } })[0]; eq(r.category, 'AUTH'); eq(r.severity, 'critical'); if (/AAAABBBB/.test(r.message)) throw new Error('leaked'); });
// --- HTTP API status mapping (input errors => 400, not generic 500) ---
const fmtV = e => run('08_approval.json', 'API Validation Error (Approval Action)', { input: e })[0];
const fmtOk = r => run('08_approval.json', 'API Format Result (Approval Action)', { input: r })[0];
const fmtDb = e => run('08_approval.json', 'API DB Error (Approval Action)', { input: e })[0];
t('http: validation error => 400 structured JSON, prefix/line suffix stripped', () => { const r = fmtV({ error: '"VALIDATION: approval_id must be a UUID [line 2]"' }); eq(r.status, 400); eq(r.body.error, 'VALIDATION'); eq(r.body.message, 'approval_id must be a UUID'); eq(r.body.ok, false); });
t('http: domain outcomes map to 404/409, success to 200', () => { eq(fmtOk({ result: { ok: false, error: 'stale_version', current_version: 2 } }).status, 409); eq(fmtOk({ result: { ok: false, error: 'not_found' } }).status, 404); eq(fmtOk({ result: { ok: false, error: 'blocked_assessment_cannot_be_approved' } }).status, 409); const s = fmtOk({ result: { ok: true, version: 3 } }); eq(s.status, 200); eq(s.body.version, 3); });
t('http: DB errors never leak internals (VALIDATION=>400, constraint=>422, other=>500 generic)', () => { eq(fmtDb({ error: 'VALIDATION: unknown publication id x' }).status, 400); eq(fmtDb({ error: 'duplicate key value violates unique constraint "foo_key" DETAIL: secret-ish' }).status, 422); const r = fmtDb({ error: 'connection to server at 10.0.0.5 password authentication failed' }); eq(r.status, 500); if (/10\.0\.0\.5|password/.test(JSON.stringify(r))) throw new Error('leaked'); });
for (const [f, nm] of [['04_rights_verification.json', 'Source Review'], ['05_monetization_policy.json', 'Policy Review'], ['09_scheduler.json', 'Reschedule'], ['09_scheduler.json', 'Publication Reconcile'], ['11_analytics.json', 'Record Earning']]) t('http: ' + nm + ' API has validation->400 formatter', () => eq(run(f, 'API Validation Error (' + nm + ')', { input: { error: 'VALIDATION: x' } })[0].status, 400));
t('reconcile API validation: outcome/post_id/reason enforced', () => { const f = b => run('09_scheduler.json', 'Validate Reconcile Input', { input: { body: b } })[0]; const id = '00000000-0000-0000-0000-000000000001'; throws(() => f({ publication_id: id, outcome: 'maybe', reason: 'r' }), /outcome/); throws(() => f({ publication_id: id, outcome: 'published', reason: 'r' }), /post_id/); throws(() => f({ publication_id: id, outcome: 'not_published' }), /reason/); eq(f({ publication_id: id, outcome: 'published', post_id: 'abc', reason: 'seen on channel' }).post_id, 'abc'); });
// --- publishing: upload-node transient errors are AMBIGUOUS (never auto-retried), definite rejections are not ---
const pc = (err, prev) => run('10_publishing.json', 'Publish Classify Error', { input: err, prev, nodes: { 'Begin Publication': { r: { publication_id: 'P1' } } } })[0];
t('publish classify: timeout/5xx from YouTube Upload => AMBIGUOUS', () => { eq(pc({ error: 'ETIMEDOUT socket hang up' }, 'YouTube Upload').category, 'AMBIGUOUS'); eq(pc({ error: '503 Service Unavailable' }, 'IG Publish').category, 'AMBIGUOUS'); });
t('publish classify: 401/429/400 from upload are definite (AUTH/RATE_LIMIT/VALIDATION), pre-upload errors retry-able', () => { eq(pc({ error: '401 unauthorized' }, 'YouTube Upload').category, 'AUTH'); eq(pc({ error: '429 quota' }, 'YouTube Upload').category, 'RATE_LIMIT'); eq(pc({ error: '400 bad request' }, 'YouTube Upload').category, 'VALIDATION'); eq(pc({ error: 'ETIMEDOUT' }, 'Download Clip (local engine)').category, 'TRANSIENT'); });
t('publish guard: youtube privacy must be public|private|unlisted; title <=100', () => { const g = o => run('10_publishing.json', 'Guard Media And Adapter', { input: { platform: 'youtube', verified: 'true', yt_privacy: 'private', meta: { title: 't' }, video_url: 'http://localhost:8000/clips/a.mp4', os_base: 'http://localhost:8000', ...o } })[0]; eq(g({}).yt_privacy, 'private'); throws(() => g({ yt_privacy: 'everyone' }), /privacy/); throws(() => g({ meta: { title: 'x'.repeat(101) } }), /100/); });
t('publish: youtube node privacy comes from config (no hard-coded public)', () => { const w = load('10_publishing.json'); const y = w.nodes.find(n => n.name === 'YouTube Upload'); if (!/yt_privacy/.test(JSON.stringify(y.parameters)) || /"privacyStatus": "public"/.test(JSON.stringify(y.parameters))) throw new Error('privacy not configurable'); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

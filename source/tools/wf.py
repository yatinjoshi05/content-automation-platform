"""Tiny builder for n8n workflow JSON (schema verified against n8n-nodes-base 2.15.1). Run build_all.py to regenerate."""
import json, uuid
NS = uuid.UUID('6f1c9c6e-0000-4000-8000-00000000ca01')
V = dict(webhook=2, schedule=1.2, postgres=2.5, code=2, iff=2.2, http=4.2, gmail=2.1, errtrig=1, wait=1.1, youtube=1, noop=1, respond=1.5)
T = dict(webhook='n8n-nodes-base.webhook', schedule='n8n-nodes-base.scheduleTrigger', postgres='n8n-nodes-base.postgres',
         code='n8n-nodes-base.code', iff='n8n-nodes-base.if', http='n8n-nodes-base.httpRequest', gmail='n8n-nodes-base.gmail',
         errtrig='n8n-nodes-base.errorTrigger', respond='n8n-nodes-base.respondToWebhook', wait='n8n-nodes-base.wait', youtube='n8n-nodes-base.youTube', noop='n8n-nodes-base.noOp')
NOTE = "Credentials are NOT embedded. After import, open each node showing a credential warning and select your own credential (see SETUP.md)."

class WF:
    def __init__(s, name, file):
        s.name, s.file, s.nodes, s.conns = name, file, [], {}
    def add(s, name, kind, params, x, y, **extra):
        assert all(n['name'] != name for n in s.nodes), 'dup node ' + name
        n = {"parameters": params, "id": str(uuid.uuid5(NS, s.file + name)), "name": name, "type": T[kind],
             "typeVersion": extra.pop('ver', V[kind]), "position": [x * 260, y * 180]}
        if kind == 'webhook': n['webhookId'] = str(uuid.uuid5(NS, 'wh' + s.file + name))
        n.update(extra); s.nodes.append(n); return name
    def link(s, a, b, out=0):
        m = s.conns.setdefault(a, {"main": []})['main']
        while len(m) <= out: m.append([])
        m[out].append({"node": b, "type": "main", "index": 0})
    def chain(s, *names):
        for a, b in zip(names, names[1:]): s.link(a, b)
    # ---- node helpers ----
    def webhook(s, name, path, x, y, auth=True, respond='onReceived'):
        p = {"httpMethod": "POST", "path": path, "responseMode": respond, "options": {}}
        if auth: p["authentication"] = "headerAuth"
        return s.add(name, 'webhook', p, x, y)
    def sched(s, name, x, y, **iv):
        return s.add(name, 'schedule', {"rule": {"interval": [iv]}}, x, y)
    def pg(s, name, q, params, x, y, once=False, cont=False, always=False):
        o = {"queryReplacement": "={{ " + params + " }}"} if params else {}
        e = {}
        if once: e['executeOnce'] = True
        if always: e['alwaysOutputData'] = True
        if cont: e['onError'] = 'continueRegularOutput'
        return s.add(name, 'postgres', {"operation": "executeQuery", "query": q, "options": o}, x, y, **e)
    def code(s, name, js, x, y, each=False):
        p = {"jsCode": js}
        if each: p["mode"] = "runOnceForEachItem"
        return s.add(name, 'code', p, x, y)
    def iff(s, name, expr, x, y):
        cond = {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                "conditions": [{"id": str(uuid.uuid5(NS, s.file + name + 'c')), "leftValue": "={{ " + expr + " }}", "rightValue": "",
                                "operator": {"type": "boolean", "operation": "true", "singleValue": True}}], "combinator": "and"}
        return s.add(name, 'iff', {"conditions": cond, "options": {}}, x, y)
    def http(s, name, method, url, x, y, body=None, auth=None, qs=None, headers=None, cont=True, timeout=30000, fmt=None):
        p = {"method": method, "url": url, "options": {"timeout": timeout}}
        if fmt: p["options"]["response"] = {"response": {"responseFormat": fmt}}
        if auth: p.update({"authentication": "genericCredentialType", "genericAuthType": auth})
        if qs: p.update({"sendQuery": True, "specifyQuery": "json", "jsonQuery": qs})
        if headers: p.update({"sendHeaders": True, "specifyHeaders": "json", "jsonHeaders": headers})
        if body: p.update({"sendBody": True, "specifyBody": "json", "jsonBody": body})
        return s.add(name, 'http', p, x, y, **({"onError": "continueErrorOutput"} if cont else {}))
    def export(s):
        d = {"id": ("cawf" + s.file + "0000000000000000")[:16], "name": s.name, "nodes": s.nodes, "connections": s.conns, "active": False,
             "settings": {"executionOrder": "v1", "timezone": "Asia/Kolkata", "saveManualExecutions": True},
             "pinData": {}, "tags": [], "meta": {"templateCredsSetupCompleted": False, "note": NOTE}}
        return d
    def sticky(s, text, x=0, y=-2):
        s.nodes.append({"parameters": {"content": text, "height": 140, "width": 640}, "id": str(uuid.uuid5(NS, s.file + 'sticky')),
                        "name": "Read me", "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [x * 260, y * 180]})

# ---- shared snippets ----
LOAD_JOB = ("SELECT j.job_id, j.job_type, j.entity_id, j.correlation_id, j.payload, j.attempt, ch.id AS channel_id, ch.name AS channel_name, ch.platforms, "
            "ch.clip_min_seconds, ch.clip_max_seconds, ch.rules, ch.timezone, ch.quality_threshold, n.name AS niche_name, n.keywords "
            "FROM jobs j LEFT JOIN channels ch ON ch.id = NULLIF(j.payload->>'channel_id','')::uuid LEFT JOIN niches n ON n.id = ch.niche_id "
            "WHERE j.job_id = $1::uuid AND j.status = 'running'")
LOAD_PARAM = "[$('Webhook').first().json.body.job_id]"

CLASSIFY_JS = r"""// Normalize an error output into {job_id, category, message}. Secrets are redacted before anything is persisted.
const j = $input.first().json;
const jobId = $('Load Job').first().json.job_id;
const raw = JSON.stringify(j.error ?? j).slice(0, 700);
const m = raw.match(/\b([45]\d\d)\b/); const code = m ? +m[1] : 0;
let cat = 'UNKNOWN';
if (/VALIDATION:/.test(raw)) cat = 'VALIDATION';
else if (/RIGHTS:/.test(raw)) cat = 'RIGHTS';
else if (code === 401 || code === 403 || /unauthori|invalid_grant|token (has )?expired|permission|credentials/i.test(raw)) cat = 'AUTH';
else if (code === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(raw)) cat = 'RATE_LIMIT';
else if (code >= 500 || /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang|timed? ?out/i.test(raw)) cat = 'TRANSIENT';
else if (code >= 400) cat = 'VALIDATION';
const msg = raw.replace(/(api[_-]?key|key|token|secret|authorization|bearer)["'=: ]+[A-Za-z0-9._\-]{8,}/gi, '$1=[redacted]');
return [{ json: { job_id: jobId, category: cat, message: msg } }];"""

FAIL_SQL = "SELECT ca_job_fail($1::uuid, $2, $3)"
FAIL_PARAM = "[$json.job_id, $json.category, $json.message]"

def fail_path(w, prefix, src, x, y, src_out=1):
    """error output of `src` -> classify -> ca_job_fail (bounded retry ladder / dead letter / human)"""
    c = w.code(prefix + ' Classify Error', CLASSIFY_JS, x, y)
    f = w.pg(prefix + ' Fail Job', FAIL_SQL, FAIL_PARAM, x + 1, y)
    w.link(src, c, src_out); w.link(c, f)
    return c

def load_job(w, x, y):
    wh = w.webhook('Webhook', w.path, x, y)
    lj = w.pg('Load Job', LOAD_JOB, LOAD_PARAM, x + 1, y)
    w.link(wh, lj); return lj

def llm_block(w, x, y, prompt_node, caps, after):
    """Model router: DB picks provider (free-first, quota/circuit aware, fallback flag) -> provider-specific HTTP node -> normalized JSON.
    Emits one item {data: <parsed JSON object>, provider, model}. Connect result to `after`."""
    pick = w.pg('Pick Model', "SELECT * FROM ca_pick_model($1::text[], $2::boolean)", "[" + json.dumps(caps) + ", !!$('Load Job').first().json.payload.use_fallback_provider]", x, y, always=True)
    ok = w.iff('Model Available?', "!!$json.provider", x + 1, y)
    nomodel = w.pg('No Model - Fail Job', FAIL_SQL, "[$('Load Job').first().json.job_id, 'RESOURCE', 'no enabled model provider is available (quota/circuit/config)']", x + 2, y + 1)
    build = w.code('Build LLM Request', r"""const m = $json; const p = $('%s').first().json;
const body = { system: p.system, prompt: p.prompt };
return [{ json: { provider: m.provider, model: m.model, kind: m.kind, base_url: (m.base_url || '').replace(/\/+$/, ''), body } }];""" % prompt_node, x + 2, y)
    isg = w.iff('Is Gemini?', "$json.kind === 'gemini'", x + 3, y)
    isq = w.iff('Is OpenAI-compatible?', "$json.kind === 'openai_compat'", x + 4, y + 1)
    g = w.http('Gemini', 'POST', "={{ $json.base_url }}/v1beta/models/{{ $json.model }}:generateContent", x + 4, y - 1, auth='httpHeaderAuth',
               body="={{ JSON.stringify({ systemInstruction: { parts: [{ text: $json.body.system }] }, contents: [{ role: 'user', parts: [{ text: $json.body.prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }) }}", timeout=120000)
    q = w.http('OpenAI-compatible (Groq etc.)', 'POST', "={{ $json.base_url }}/chat/completions", x + 5, y + 1, auth='httpBearerAuth',
               body="={{ JSON.stringify({ model: $json.model, temperature: 0.4, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: $json.body.system }, { role: 'user', content: $json.body.prompt }] }) }}", timeout=120000)
    o = w.http('Ollama (local)', 'POST', "={{ $json.base_url }}/api/chat", x + 5, y + 2,
               body="={{ JSON.stringify({ model: $json.model, stream: false, format: 'json', options: { temperature: 0.4, num_ctx: 8192 }, messages: [{ role: 'system', content: $json.body.system }, { role: 'user', content: $json.body.prompt }] }) }}", timeout=600000)
    parse = w.code('Parse LLM JSON', r"""const meta = $('Build LLM Request').first().json; const r = $input.first().json;
let text = '';
if (meta.kind === 'gemini') text = r.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
else if (meta.kind === 'openai_compat') text = r.choices?.[0]?.message?.content ?? '';
else text = r.message?.content ?? '';
text = String(text).replace(/^```json|```$/gim, '').trim();
let data; try { data = JSON.parse(text); } catch (e) { throw new Error('VALIDATION: model returned non-JSON output'); }
return [{ json: { data, provider: meta.provider, model: meta.model } }];""", x + 6, y)
    okrec = w.pg('Record Model Success', "SELECT ca_model_result($1, true)", "[$json.provider]", x + 7, y)
    failrec = w.pg('Record Model Failure', "SELECT ca_model_result($1, false, $2) AS state, $2::text AS err", "[$('Build LLM Request').first().json.provider, JSON.stringify($json.error ?? $json).slice(0, 300)]", x + 6, y + 3)
    w.chain(pick, ok); w.link(ok, build, 0); w.link(ok, nomodel, 1); w.link(build, isg)
    w.link(isg, g, 0); w.link(isg, isq, 1); w.link(isq, q, 0); w.link(isq, o, 1)
    for n in (g, q, o):
        w.link(n, parse, 0); w.link(n, failrec, 1)
    w.link(parse, okrec)
    # model failure -> fail job (retry ladder flips use_fallback_provider; quota errors open the provider circuit)
    c = w.code('Model Failure Classify', CLASSIFY_JS, x + 7, y + 3)
    f = w.pg('Model Failure Fail Job', FAIL_SQL, FAIL_PARAM, x + 8, y + 3)
    w.link(failrec, c); w.link(c, f)
    w.link(okrec, after)
    return pick, okrec

def auto_fail_code(w):
    """Every Code node in a job worker gets an error output that fails the job (never leave a job 'running' after a thrown error)."""
    if not any(n['name'] == 'Load Job' for n in w.nodes): return
    skip = lambda n: ('Classify' in n['name'] or 'Review Input' in n['name'] or 'Validate API' in n['name'] or 'Reconcile Input' in n['name'] or 'Validate Snapshot' in n['name'] or n['name'].startswith('API '))
    targets = [n for n in w.nodes if n['type'].endswith('.code') and not skip(n)]
    if not targets: return
    x = max(n['position'][0] for n in w.nodes) // 260 + 1
    c = w.code('Code Error Classify Error', CLASSIFY_JS, x, 6)
    f = w.pg('Code Error Fail Job', FAIL_SQL, FAIL_PARAM, x + 1, 6)
    w.link(c, f)
    for n in targets:
        n['onError'] = 'continueErrorOutput'
        w.link(n['name'], c, 1)


STATUS_JS = r"""// Maps a database/validation outcome to an HTTP status + structured JSON. No stack traces / internals are ever returned.
const clean = m => String(m || '').replace(/^"+|"+$/g, '').replace(/^(?:Error: )?(?:VALIDATION: )?/, '').replace(/ \[line \d+\]$/, '').slice(0, 300);
"""
FMT_OK = STATUS_JS + r"""const j = $input.first().json; const r = (j.result !== undefined && j.result !== null) ? j.result : j;
if (r && r.ok === false) {
  const code = String(r.error || 'CONFLICT'); const map = { not_found: 404, NOT_FOUND: 404, stale_version: 409, CONFLICT: 409, blocked_assessment_cannot_be_approved: 409, not_awaiting: 409, no_schedule: 404, not_editable: 409, conflict_min_gap: 409, in_the_past: 422, already_published: 409, no_active_assessment: 404 };
  const status = map[code] || 400; const kind = status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 422 ? 'UNPROCESSABLE' : 'VALIDATION';
  return [{ json: { status, body: { ok: false, error: kind, code, message: clean(r.message || code.replace(/_/g, ' ')), details: r } } }];
}
return [{ json: { status: 200, body: { ok: true, ...(typeof r === 'object' ? r : { result: r }) } } }];"""
FMT_VALIDATION = STATUS_JS + r"""const e = $input.first().json; return [{ json: { status: 400, body: { ok: false, error: 'VALIDATION', message: clean(e.error?.message ?? e.error ?? e.message) } } }];"""
FMT_DBERR = STATUS_JS + r"""const e = $input.first().json; const raw = String(e.error?.message ?? e.error ?? e.message ?? '');
if (/VALIDATION:/.test(raw)) return [{ json: { status: 400, body: { ok: false, error: 'VALIDATION', message: clean(raw) } } }];
if (/invalid input syntax|violates (check|foreign|unique|not-null)|duplicate key/i.test(raw)) return [{ json: { status: 422, body: { ok: false, error: 'UNPROCESSABLE', message: 'request conflicts with stored data or has an invalid value' } } }];
return [{ json: { status: 500, body: { ok: false, error: 'INTERNAL', message: 'internal error; see error log' } } }];"""

def finish_api(w, webhook, validate, db, x=6, y=8):
    """Turns an existing Webhook -> Validate -> DB chain into a proper HTTP API: 400 for bad input (structured JSON), 404/409/422 for domain outcomes, 500 only for internal errors."""
    byname = {n['name']: n for n in w.nodes}
    byname[webhook]['parameters']['responseMode'] = 'responseNode'
    byname[validate]['onError'] = 'continueErrorOutput'; byname[db]['onError'] = 'continueErrorOutput'
    pre = db.replace(' ', '')[:6]
    e1 = w.code(f'API Validation Error ({webhook[4:]})', FMT_VALIDATION, x, y)
    f = w.code(f'API Format Result ({webhook[4:]})', FMT_OK, x, y + 1)
    e2 = w.code(f'API DB Error ({webhook[4:]})', FMT_DBERR, x, y + 2)
    r = w.add(f'API Respond ({webhook[4:]})', 'respond', {"respondWith": "json", "responseBody": "={{ JSON.stringify($json.body) }}", "options": {"responseCode": "={{ $json.status }}"}}, x + 1, y + 1)
    w.link(validate, e1, 1); w.link(db, f, 0); w.link(db, e2, 1)
    for n in (e1, f, e2): w.link(n, r)

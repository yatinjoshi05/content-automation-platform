// Mock of YouTube Data API, Ollama /api/chat, OpenShorts. Test-only. Modes via POST /__mode.
const http = require('http'), crypto = require('crypto'), fs = require('fs');
const S = { openshorts: 'ok', yt: 'ok', llm: 'ok', policyVersion: 1, whDelay: 800, clipDelay: 0, jobs: {}, log: [] };
const log = (...a) => { S.log.push([Date.now(), ...a]); fs.appendFileSync('/tmp/mock/mock.log', a.join(' ') + '\n'); };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });
async function fireWebhook(url, secret, payload, mode) {
  const b = JSON.stringify(payload); const sig = 'sha256=' + crypto.createHmac('sha256', mode === 'badsig' ? 'wrong' : secret).update(b).digest('hex');
  const n = mode === 'dupe' ? 2 : 1;
  for (let i = 0; i < n; i++) { try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenShorts-Signature': sig }, body: b }); log('webhook->n8n', r.status, payload.event); } catch (e) { log('webhook->n8n FAILED (n8n down?)', String(e.cause && e.cause.code || e.message)); } }
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname; log(req.method, p, u.search.slice(0, 80));
  if (p === '/__mode') { Object.assign(S, JSON.parse(await body(req))); return send(res, 200, S); }
  if (p === '/__log') return send(res, 200, S.log.slice(-50));
  if (p.startsWith('/youtube/v3/')) {
    if (S.yt === '500') return send(res, 500, { error: { message: 'backend error' } });
    if (S.yt === '401') return send(res, 401, { error: { message: 'API key not valid' } });
    if (p.endsWith('/search')) { const ch = u.searchParams.get('channelId'); return send(res, 200, { items: ch ? [{ id: { videoId: 'abcdefghij1' } }, { id: { videoId: 'abcdefghij2' } }] : [{ id: { videoId: 'trendvid001' } }, { id: { videoId: 'trendvid002' } }] }); }
    if (p.endsWith('/videos')) { const part = u.searchParams.get('part'); const ids = u.searchParams.get('id').split(',');
      return send(res, 200, { items: ids.map((id, i) => ({ id, snippet: { title: id.startsWith('trend') ? `Funny cat fails compilation ${i}` : `Funny cat fails full episode ${i}`, channelTitle: 'Creator A', publishedAt: new Date(Date.now() - 36e5 * (10 + i)).toISOString() },
        statistics: { viewCount: String(100000 * (2 - i)), likeCount: '5000', commentCount: '300' }, contentDetails: { duration: 'PT42M10S' }, status: { privacyStatus: 'public' } })) }); }
  }
  if (p === '/api/chat') { const b = JSON.parse(await body(req)); const sys = b.messages[0].content, prompt = b.messages[1].content;
    if (S.llm === '429') return send(res, 429, { error: 'RESOURCE_EXHAUSTED quota exceeded' });
    if (S.llm === '500') return send(res, 500, { error: 'boom' });
    let out;
    if (/trend analyst/.test(sys)) { const ids = [...prompt.matchAll(/- \[(\w+)\]/g)].map(m => m[1]); out = { trends: [{ niche: 'funny', topic: 'funny cat fails', llm_score: 0.7, confidence: 0.6, evidence_ids: ids.slice(0, 2), recommended_content_format: 'compilation clips 30-45s', recommended_posting_frequency: '2/day', recommended_posting_windows: ['evening'], recommended_channel: 'Funny Shorts', new_channel_opportunity: false }, { niche: 'interviews', topic: 'interview highlights', llm_score: 0.9, confidence: 0.5, evidence_ids: ids.slice(0, 1), new_channel_opportunity: true }] }; }
    else if (/policy analyst/.test(sys)) { const plats = (prompt.match(/Platforms: ([\w, ]+)/) || [, 'youtube'])[1].split(', '); out = { assessments: plats.map(pl => ({ platform: pl, monetization_status: S.policy || 'pass', policy_risk: 'medium', reasons: ['reused content risk', (m => m ? 'assessed against fetched policy v' + m[1] : 'no fetched policy text in prompt')(prompt.match(/POLICY_VERSION (\d+)/) || (/fetched policy v(\d+)/.exec(prompt) && ['', /fetched policy v(\d+)/.exec(prompt)[1]]))], required_actions: [], evidence: [{ url: 'https://localhost:9443/policy/youtube', note: 'mock' }] })) }; }
    else { const plats = (prompt.match(/Platforms: ([\w, ]+)\./) || [, 'youtube'])[1].split(', '); out = { hook_text: 'wait for the ending', hook_strength: 0.8, per_platform: Object.fromEntries(plats.map(pl => [pl, { title: `Cat vs phone (${pl})`, description: 'Funny cat moment', hashtags: ['cats', 'funny', 'shorts'] }])) }; }
    return send(res, 200, { message: { content: JSON.stringify(out) } }); }
  if (p === '/api/process' && req.method === 'POST') { const b = JSON.parse(await body(req)); log('openshorts.submit', JSON.stringify({ ack: b.acknowledged, url: b.url, hasSecret: !!b.webhook_secret }));
    if (S.openshorts === '500') return send(res, 500, { error: 'internal' });
    if (S.openshorts === 'hang') { setTimeout(() => { try { send(res, 200, { job_id: 'hung-' + Date.now() }); } catch (e) {} }, 120000); return; }
    if (b.acknowledged !== true) return send(res, 400, { error: 'ack required' });
    const job_id = 'os-' + crypto.randomUUID().slice(0, 8); S.jobs[job_id] = { url: b.webhook_url, secret: b.webhook_secret };
    if (S.openshorts !== 'silent') setTimeout(() => fireWebhook(b.webhook_url, b.webhook_secret, S.openshorts === 'fail' ? { event: 'job.failed', job_id, status: 'failed', error: 'render crashed' } : { event: 'job.completed', job_id, status: 'completed', clips: [{ index: 0, title: 'Cat vs phone', video_url: `http://localhost:9000/clips/${job_id}-0.mp4`, download_url: `http://localhost:9000/clips/${job_id}-0.mp4`, start: 10, end: 40 }, { index: 1, title: 'Second moment', video_url: `http://localhost:9000/clips/${job_id}-1.mp4`, start: 60, end: 95 }] }, S.openshorts), S.whDelay);
    return send(res, 200, { job_id }); }
  if (p === '/__resend') { const b = JSON.parse(await body(req)); const j = S.jobs[b.job_id]; if (!j) return send(res, 404, { error: 'unknown job' }); await fireWebhook(j.url, j.secret, { event: 'job.completed', job_id: b.job_id, status: 'completed', clips: [{ index: 0, title: 'Cat vs phone', video_url: `http://localhost:9000/clips/${b.job_id}-0.mp4`, start: 10, end: 40 }] }, 'ok'); return send(res, 200, { resent: b.job_id }); }
  if (p === '/big') { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(999 * 1048576) }); return res.end('x'); }
  if (p === '/bigstream') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); const iv = setInterval(() => { try { res.write(Buffer.alloc(300000)); } catch (e) { clearInterval(iv); } }, 5); res.on('close', () => clearInterval(iv)); return; }
  if (p === '/partial') { res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': '5000000' }); res.write(Buffer.alloc(100000)); return setTimeout(() => res.destroy(), 200); }
  if (p === '/redirect') { res.writeHead(302, { Location: 'http://localhost:9000/clips/good.mp4' }); return res.end(); }
  if (p.startsWith('/clips/')) { if (S.clipDelay) await new Promise(r => setTimeout(r, S.clipDelay)); const n = p.split('/').pop(); const f = /^bad_\w+\.mp4$/.test(n) ? '/tmp/mock/' + n : '/tmp/mock/good.mp4'; res.writeHead(200, { 'Content-Type': 'video/mp4' }); return fs.createReadStream(f).pipe(res); }
  send(res, 404, { error: 'not found ' + p });
}).listen(9000, () => console.log('mock on 9000'));
require('https').createServer({ key: fs.readFileSync('/tmp/mock/key.pem'), cert: fs.readFileSync('/tmp/mock/cert.pem') }, (req, res) => {
  log('POLICY_FETCH', req.url, 'v' + S.policyVersion);
  if (req.url === '/policy/youtube') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html><body><h1>Official platform policy (TEST PAGE)</h1><p>Reused content must be transformed. POLICY_VERSION ' + S.policyVersion + '</p></body></html>'); }
  res.writeHead(404); res.end('no');
}).listen(9443, () => console.log('mock https on 9443'));

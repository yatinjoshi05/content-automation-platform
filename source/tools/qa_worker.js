#!/usr/bin/env node
// Host-side TECHNICAL media QA + thumbnail service (ffmpeg/ffprobe; no AI, no paid dependencies). Runs next to OpenShorts on the user's PC.
//   QA_API_KEY=<same value as the n8n "CA Internal Key" credential> QA_ALLOWED_HOSTS=localhost:8000 node tools/qa_worker.js
// Env: QA_PORT(9100) QA_API_KEY(required unless QA_ALLOW_NO_KEY=1) QA_ALLOWED_HOSTS QA_WORK_DIR(./qa_work) QA_MAX_MB(300) QA_CONCURRENCY(1) QA_QUEUE_MAX(4)
//      QA_DOWNLOAD_TIMEOUT_S(120) QA_FFMPEG_TIMEOUT_S(120) QA_MAX_VIDEO_SECONDS(900) QA_ORPHAN_MAX_AGE_MIN(60) QA_PUBLIC_HOST
// POST /qa {video_url,min_seconds,max_seconds,thumb_name} -> {visual_pass,failures[],checks{},thumbnail{},assessed[],not_assessed[]}
// Safety: allow-listed host only, http/https only, redirects refused, size-capped streaming download, unique temp file removed in `finally` (also on
// partial downloads/timeouts), orphan sweep at start + every 10 min, ONE heavy job at a time by default (others queue; queue full => 429).
// Honest scope: playable/duration/resolution/aspect/audio presence+level/black+frozen frames/thumbnail. NOT assessed: speaker framing, subtitles, semantic quality.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFile } = require('child_process');
const env = (k, d) => process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d;
const PORT = +env('QA_PORT', 9100), WORK = path.resolve(env('QA_WORK_DIR', './qa_work')), KEY = env('QA_API_KEY', ''), ALLOW_NO_KEY = env('QA_ALLOW_NO_KEY', '') === '1';
const ALLOWED = env('QA_ALLOWED_HOSTS', 'localhost:8000').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const MAX_BYTES = +env('QA_MAX_MB', 300) * 1048576, CONC = Math.max(1, +env('QA_CONCURRENCY', 1)), QUEUE_MAX = +env('QA_QUEUE_MAX', 4);
const DL_MS = +env('QA_DOWNLOAD_TIMEOUT_S', 120) * 1000, FF_MS = +env('QA_FFMPEG_TIMEOUT_S', 120) * 1000, MAX_VIDEO_S = +env('QA_MAX_VIDEO_SECONDS', 900), ORPHAN_MS = +env('QA_ORPHAN_MAX_AGE_MIN', 60) * 60000;
if (!KEY && !ALLOW_NO_KEY) { console.error('QA_API_KEY is required (set QA_ALLOW_NO_KEY=1 only for local tests)'); process.exit(2); }
const THUMBS = path.join(WORK, 'thumbs'), TMP = path.join(WORK, 'tmp'); fs.mkdirSync(THUMBS, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const run = (cmd, args, ms = FF_MS) => new Promise((res, rej) => execFile(cmd, args, { timeout: ms, killSignal: 'SIGKILL', maxBuffer: 20 << 20 }, (e, so, se) => e ? rej(Object.assign(e, { se })) : res({ so, se })));
const send = (r, c, o) => { r.writeHead(c, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
const readBody = req => new Promise((res, rej) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) { rej(new Error('body too large')); req.destroy(); } }); req.on('end', () => res(d)); });
const sweep = () => { const now = Date.now(); for (const f of fs.readdirSync(TMP)) { try { const p = path.join(TMP, f); if (now - fs.statSync(p).mtimeMs > ORPHAN_MS) fs.rmSync(p, { force: true }); } catch (e) {} } };
sweep(); setInterval(sweep, 600000).unref();
// ---- bounded concurrency (semaphore + bounded queue) ----
let active = 0; const waiters = [];
const acquire = () => new Promise((res, rej) => { if (active < CONC) { active++; return res(); } if (waiters.length >= QUEUE_MAX) return rej(Object.assign(new Error('QA worker busy'), { code: 429 })); waiters.push(res); });
const release = () => { const n = waiters.shift(); if (n) n(); else active--; };
async function download(u, dest) {
  const url = new URL(u); if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('bad scheme'), { code: 400 });
  if (!ALLOWED.includes(url.host.toLowerCase())) throw Object.assign(new Error('host not allowed: ' + url.host), { code: 400 });
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), DL_MS);
  try {
    const r = await fetch(u, { redirect: 'error', signal: ac.signal }); if (!r.ok) throw Object.assign(new Error('download http ' + r.status), { code: 502 });
    const len = +r.headers.get('content-length') || 0; if (len > MAX_BYTES) throw Object.assign(new Error('file too large'), { code: 413 });
    let n = 0; const out = fs.createWriteStream(dest); let err = null; out.on('error', e => { err = e; });
    for await (const chunk of r.body) { n += chunk.length; if (n > MAX_BYTES) { out.destroy(); throw Object.assign(new Error('file too large'), { code: 413 }); } if (!out.write(chunk)) await new Promise(rs => out.once('drain', rs)); }
    await new Promise(rs => out.end(rs)); if (err) throw err;
    if (len && n < len) throw Object.assign(new Error('incomplete download'), { code: 502 });         // partial file => reject
    return n;
  } catch (e) { if (e.code) throw e; throw Object.assign(new Error(e.name === 'AbortError' ? 'download timeout' : 'download failed: ' + (e.cause && e.cause.code || e.message)), { code: 502 }); }
  finally { clearTimeout(timer); }
}
async function analyze(file, opts) {
  const f = [], checks = {}; const fail = m => f.push(m);
  let probe; try { probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file])).so); } catch (e) { return { visual_pass: false, failures: ['not a playable media file'], checks: { playable: false }, assessed: ['playable'], not_assessed: [] }; }
  const v = (probe.streams || []).find(s => s.codec_type === 'video'), a = (probe.streams || []).find(s => s.codec_type === 'audio');
  checks.playable = !!v; if (!v) { fail('no video stream'); return { visual_pass: false, failures: f, checks, assessed: ['playable'], not_assessed: [] }; }
  const dur = +probe.format.duration || +v.duration || 0; checks.duration_s = +dur.toFixed(2); checks.codec = v.codec_name; checks.fps = v.avg_frame_rate;
  if (!(dur > 0)) fail('duration unknown'); if (dur > MAX_VIDEO_S) { fail(`duration ${dur.toFixed(0)}s exceeds hard cap ${MAX_VIDEO_S}s`); return { visual_pass: false, failures: f, checks, assessed: ['playable', 'duration'], not_assessed: [] }; }
  if (opts.min_seconds && dur < opts.min_seconds) fail(`duration ${dur.toFixed(1)}s below ${opts.min_seconds}s`); if (opts.max_seconds && dur > opts.max_seconds) fail(`duration ${dur.toFixed(1)}s above ${opts.max_seconds}s`);
  checks.resolution = `${v.width}x${v.height}`; const ar = v.width / v.height; checks.aspect = +ar.toFixed(3);
  if (Math.abs(ar - 9 / 16) > 0.02) fail(`aspect ratio ${checks.aspect} is not 9:16`); if (v.height < 1280) fail(`resolution ${checks.resolution} below 720x1280`);
  checks.has_audio = !!a; if (!a) fail('no audio stream');
  if (a) { try { const { se } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-']); const m = /mean_volume: (-?[\d.]+|-inf) dB/.exec(se), x = /max_volume: (-?[\d.]+|-inf) dB/.exec(se);
      checks.mean_volume_db = m ? +m[1] : null; checks.max_volume_db = x ? +x[1] : null; if (!m || m[1] === '-inf' || +m[1] < -50) fail(`audio is silent or near-silent (mean ${m ? m[1] : '?'} dB)`); if (x && +x[1] >= -0.05 && +m[1] > -8) fail('audio is saturated/clipping'); } catch (e) { fail('audio analysis failed'); } }
  try { const { se } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', 'blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=2', '-f', 'null', '-']);
    const black = [...se.matchAll(/black_duration:([\d.]+)/g)].reduce((s, m) => s + +m[1], 0);
    const starts = [...se.matchAll(/freeze_start: ([\d.]+)/g)].map(m => +m[1]), durs = [...se.matchAll(/freeze_duration: ([\d.]+)/g)].map(m => +m[1]);
    let frozen = durs.reduce((s, x) => s + x, 0); if (starts.length > durs.length) frozen += Math.max(0, dur - starts[starts.length - 1]);   // a freeze that lasts until EOF has no end marker
    checks.black_ratio = dur ? +(black / dur).toFixed(2) : 0; checks.frozen_ratio = dur ? +(frozen / dur).toFixed(2) : 0;
    if (checks.black_ratio > 0.3) fail(`${Math.round(checks.black_ratio * 100)}% of the video is black`); if (checks.frozen_ratio > 0.5) fail(`${Math.round(checks.frozen_ratio * 100)}% of the video is frozen`); } catch (e) { fail('video analysis failed'); }
  return { f, checks, dur };
}
async function thumbnail(file, dur, name) {
  const out = path.join(THUMBS, name + '.jpg'); try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0.5, dur * 0.25)), '-i', file, '-vf', 'thumbnail=60,scale=720:-2', '-frames:v', '1', '-q:v', '3', out]);
    const size = fs.statSync(out).size; const { se } = await run('ffmpeg', ['-hide_banner', '-i', out, '-vf', 'signalstats,metadata=print', '-f', 'null', '-']);
    const y = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(se); const yavg = y ? +y[1] : null; const ok = size > 4096 && yavg !== null && yavg > 20 && yavg < 240;
    if (!ok) fs.rmSync(out, { force: true });
    return { ok, url: `http://${env('QA_PUBLIC_HOST', 'localhost:' + PORT)}/thumbs/${name}.jpg`, path: ok ? out : null, bytes: size, yavg, reason: ok ? null : 'thumbnail too small or too dark/bright' };
  } catch (e) { fs.rmSync(out, { force: true }); return { ok: false, reason: 'thumbnail generation failed' }; }
}
http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET' && u.pathname === '/health') return send(res, 200, { ok: true, active, queued: waiters.length, concurrency: CONC });
    if (req.method === 'GET' && u.pathname.startsWith('/thumbs/')) { const n = path.basename(u.pathname); if (!/^[\w-]+\.jpg$/.test(n) || !fs.existsSync(path.join(THUMBS, n))) return send(res, 404, { error: 'no thumbnail' }); res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return fs.createReadStream(path.join(THUMBS, n)).pipe(res); }
    if (req.method === 'POST' && u.pathname === '/qa') {
      if (!ALLOW_NO_KEY && req.headers['x-ca-key'] !== KEY) return send(res, 401, { error: 'unauthorized' });
      let b; try { b = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'invalid json' }); }
      if (typeof b.video_url !== 'string') return send(res, 400, { error: 'video_url required' });
      try { await acquire(); } catch (e) { return send(res, 429, { error: e.message }); }
      const file = path.join(TMP, crypto.randomUUID() + '.mp4');                         // unique temp path per request
      try {
        try { await download(b.video_url, file); } catch (e) { return send(res, e.code || 502, { error: e.message }); }
        const r = await analyze(file, { min_seconds: +b.min_seconds || 0, max_seconds: +b.max_seconds || 0 }); if (r.visual_pass === false) return send(res, 200, r);
        const th = await thumbnail(file, r.dur, /^[\w-]{6,64}$/.test(b.thumb_name || '') ? b.thumb_name : crypto.createHash('sha256').update(b.video_url).digest('hex').slice(0, 24));
        return send(res, 200, { visual_pass: r.f.length === 0, failures: r.f, checks: r.checks, thumbnail: th,
          assessed: ['playable', 'duration', 'resolution', 'aspect_9_16', 'audio_present', 'audio_level', 'black_frames', 'frozen_frames', 'thumbnail'],
          not_assessed: ['framing/crop of speaker', 'subtitle presence/readability/timing', 'content quality'] });
      } catch (e) { return send(res, 500, { error: 'qa failed' }); }
      finally { fs.rm(file, { force: true }, () => {}); release(); }                    // ALWAYS: partial/failed/successful - temp file removed, slot released
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 500, { error: 'internal error' }); }
}).listen(PORT, '127.0.0.1', () => console.log('qa_worker listening on 127.0.0.1:' + PORT + ` (concurrency ${CONC}, max ${MAX_BYTES / 1048576} MB)`));

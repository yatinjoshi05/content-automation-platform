#!/usr/bin/env node
'use strict';

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, 'config', '.env');

// Parse environment configuration
const E = {
  ...Object.fromEntries(
    (fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '')
      .split(/\r?\n/)
      .filter(l => /^\s*[A-Z_][A-Z0-9_]*=/.test(l))
      .map(l => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  ),
  ...process.env
};

const get = (k, d) => (E[k] !== undefined && E[k] !== '' ? E[k] : d);

const PORT = parseInt(get('FRONTEND_PORT', get('PORT', '3001')), 10);
const PSQL_CMD = get('PSQL_CMD', 'D:\\tools\\pgsql\\bin\\psql.exe');
const DB_HOST = get('DB_HOST', 'localhost');
const DB_PORT = get('DB_PORT', '5432');
const DB_USER = get('DB_USER', 'postgres');
const DB_NAME = get('DB_NAME', 'content_automation');
const DB_PASSWORD = get('DB_PASSWORD', 'ca_local_dev_password');
const N8N_URL = get('N8N_URL', 'http://localhost:5678');
const CA_INTERNAL_KEY = get('CA_INTERNAL_KEY', '');
const QA_WORKER_URL = get('QA_WORKER_URL', 'http://localhost:9100');
const OPENSHORTS_URL = get('OPENSHORTS_URL', 'http://localhost:8000');

// Helper to query PostgreSQL returning JSON
function queryJson(sql) {
  const wrapper = `SELECT coalesce(json_agg(t), '[]'::json) FROM (${sql}) t;`;
  const res = spawnSync(PSQL_CMD, [
    '-h', DB_HOST,
    '-p', DB_PORT,
    '-U', DB_USER,
    '-d', DB_NAME,
    '-X', '-q', '-t', '-A',
    '-v', 'ON_ERROR_STOP=1',
    '-c', wrapper
  ], {
    env: { ...process.env, PGPASSWORD: DB_PASSWORD },
    encoding: 'utf8',
    timeout: 15000
  });

  if (res.status !== 0) {
    throw new Error(res.stderr || `PSQL query failed with code ${res.status}`);
  }
  try {
    return JSON.parse(res.stdout.trim() || '[]');
  } catch (e) {
    throw new Error(`Failed to parse PSQL JSON output: ${res.stdout.slice(0, 200)}`);
  }
}

// Helper to execute non-query SQL (INSERT, UPDATE, DELETE)
function execSql(sql) {
  const res = spawnSync(PSQL_CMD, [
    '-h', DB_HOST,
    '-p', DB_PORT,
    '-U', DB_USER,
    '-d', DB_NAME,
    '-X', '-q', '-t', '-A',
    '-v', 'ON_ERROR_STOP=1',
    '-c', sql
  ], {
    env: { ...process.env, PGPASSWORD: DB_PASSWORD },
    encoding: 'utf8',
    timeout: 15000
  });

  if (res.status !== 0) {
    throw new Error(res.stderr || `PSQL exec failed with code ${res.status}`);
  }
  return res.stdout.trim();
}

// Helper to make HTTP request (for n8n webhooks and health endpoints)
function httpReq(method, targetUrl, headers = {}, body = null) {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? require('https') : require('http');
      const req = client.request({
        method,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: 15000
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(d); } catch (_) {}
          resolve({ status: res.statusCode, body: d, data: parsed });
        });
      });

      req.on('error', (err) => resolve({ status: 0, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 0, error: 'Request timed out' });
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    } catch (e) {
      resolve({ status: 0, error: e.message });
    }
  });
}

// Router and Handler implementation
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CA-Key, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Helper response functions
  const json = (data, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const err = (msg, code = 500, detail = null) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: msg, detail }));
  };

  // Helper to read request body
  const readBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve(null);
      }
    });
  });

  // --- EXTERNAL ACCESS CONFINEMENT ---
  // When accessed via an external tunnel (e.g. Cloudflare Tunnel, reverse proxy, or remote Host),
  // strictly confine external access to media delivery (/media/*).
  // Block external callers from accessing internal management APIs, database mutation, or frontend administrative routes.
  const host = (req.headers['host'] || '').toLowerCase();
  const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
  const isCfTunnel = Boolean(req.headers['cf-connecting-ip'] || req.headers['cf-ray']);
  if ((!isLocalHost || isCfTunnel) && !pathname.startsWith('/media/')) {
    return err('Forbidden: External access is restricted to /media/ endpoints only', 403);
  }

  try {
    // --- 1. SYSTEM STATUS & HEALTH ---
    if (pathname === '/api/status' && req.method === 'GET') {
      const n8nCheck = await httpReq('GET', `${N8N_URL}/healthz`);
      let dbCheck = false;
      let dbErr = null;
      try {
        execSql('SELECT 1;');
        dbCheck = true;
      } catch (e) {
        dbErr = e.message;
      }

      const qaCheck = await httpReq('GET', `${QA_WORKER_URL}/health`);
      const osCheck = await httpReq('GET', `${OPENSHORTS_URL}/`);

      let latestTelemetry = null;
      try {
        const rows = queryJson('SELECT cpu_percent, ram_percent, disk_free_gb, captured_at, source FROM resource_snapshots ORDER BY captured_at DESC LIMIT 1');
        latestTelemetry = rows[0] || null;
      } catch (_) {}

      return json({
        ok: true,
        services: {
          n8n: { online: n8nCheck.status === 200, status: n8nCheck.status, url: N8N_URL },
          postgresql: { online: dbCheck, error: dbErr, host: DB_HOST, port: DB_PORT, database: DB_NAME },
          qa_worker: { online: qaCheck.status === 200, status: qaCheck.status, url: QA_WORKER_URL },
          openshorts: { online: osCheck.status > 0, status: osCheck.status, url: OPENSHORTS_URL }
        },
        telemetry: latestTelemetry,
        timestamp: new Date().toISOString()
      });
    }

    // --- 2. OVERVIEW METRICS ---
    if (pathname === '/api/overview' && req.method === 'GET') {
      const jobCounts = queryJson(`
        SELECT status, count(*)::int as count 
        FROM jobs 
        GROUP BY status
      `);

      const approvalCounts = queryJson(`
        SELECT status, count(*)::int as count 
        FROM approvals 
        GROUP BY status
      `);

      const channelCounts = queryJson(`
        SELECT count(*)::int as count 
        FROM channels 
        WHERE status = 'active'
      `);

      const recentJobs = queryJson(`
        SELECT job_id, job_type, status, attempt, error_message, created_at, finished_at
        FROM jobs
        ORDER BY created_at DESC
        LIMIT 10
      `);

      const recentErrors = queryJson(`
        SELECT id, category, severity, message, workflow, created_at
        FROM errors
        ORDER BY created_at DESC
        LIMIT 10
      `);

      const telemetryHistory = queryJson(`
        SELECT cpu_percent, ram_percent, disk_free_gb, captured_at
        FROM resource_snapshots
        ORDER BY captured_at DESC
        LIMIT 20
      `);

      const jobsMap = Object.fromEntries(jobCounts.map(r => [r.status, r.count]));
      const approvalsMap = Object.fromEntries(approvalCounts.map(r => [r.status, r.count]));

      return json({
        ok: true,
        stats: {
          jobs: {
            queued: jobsMap.queued || 0,
            running: jobsMap.running || 0,
            completed: jobsMap.completed || 0,
            failed: jobsMap.failed || 0,
            total: (jobsMap.queued || 0) + (jobsMap.running || 0) + (jobsMap.completed || 0) + (jobsMap.failed || 0)
          },
          approvals: {
            awaiting: approvalsMap.awaiting_approval || 0,
            approved: approvalsMap.approved || 0,
            rejected: approvalsMap.rejected || 0
          },
          active_channels: channelCounts[0]?.count || 0
        },
        recent_jobs: recentJobs,
        recent_errors: recentErrors,
        telemetry_history: telemetryHistory
      });
    }

    // --- 3. CONTENT PIPELINE & JOBS ---
    if (pathname === '/api/jobs' && req.method === 'GET') {
      const filterStatus = parsedUrl.query.status;
      const filterType = parsedUrl.query.type;
      const limit = Math.min(parseInt(parsedUrl.query.limit || '50', 10), 200);

      let whereClauses = [];
      if (filterStatus) whereClauses.push(`status = '${filterStatus.replace(/[^\w]/g, '')}'`);
      if (filterType) whereClauses.push(`job_type = '${filterType.replace(/[^\w]/g, '')}'`);
      const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const jobs = queryJson(`
        SELECT job_id, job_type, entity_id, correlation_id, status, attempt, max_attempts, 
               priority, started_at, finished_at, error_code, error_message, next_retry_at, created_at
        FROM jobs
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);

      return json({ ok: true, jobs });
    }

    // Retrying a failed job (bounded, idempotent)
    const retryMatch = pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})\/retry$/i);
    if (retryMatch && req.method === 'POST') {
      const jobId = retryMatch[1];
      const check = queryJson(`SELECT job_id, status, attempt, max_attempts FROM jobs WHERE job_id = '${jobId}'`);
      if (!check.length) return err('Job not found', 404);
      const j = check[0];
      if (j.status !== 'failed') return err(`Cannot retry job in '${j.status}' state`, 400);
      if (j.attempt >= j.max_attempts) return err('Max retry attempts reached for this job', 400);

      execSql(`
        UPDATE jobs 
        SET status = 'queued',
            error_message = NULL,
            error_code = NULL,
            next_retry_at = now(),
            updated_at = now()
        WHERE job_id = '${jobId}'
      `);

      return json({ ok: true, message: 'Job re-queued successfully', job_id: jobId });
    }

    // Content items list
    if (pathname === '/api/content' && req.method === 'GET') {
      const limit = Math.min(parseInt(parsedUrl.query.limit || '50', 10), 100);
      const items = queryJson(`
        SELECT c.content_id, c.status, c.current_version, c.approved_version, c.created_at, c.updated_at,
               ch.name as channel_name, ch.platforms,
               cv.hook_text, cv.quality_score, cv.thumbnail_url, cv.per_platform,
               s.title as source_title, s.normalized_url as source_url
        FROM content c
        LEFT JOIN channels ch ON ch.id = c.channel_id
        LEFT JOIN content_versions cv ON cv.content_id = c.content_id AND cv.version = c.current_version
        LEFT JOIN sources s ON s.source_id = c.source_id
        ORDER BY c.created_at DESC
        LIMIT ${limit}
      `);
      return json({ ok: true, content: items });
    }

    // --- 4. APPROVAL QUEUE ---
    if (pathname === '/api/approvals' && req.method === 'GET') {
      const statusFilter = parsedUrl.query.status || 'awaiting_approval';
      const items = queryJson(`
        SELECT a.approval_id, a.content_id, a.kind, a.status, a.decision, a.comments, a.version,
               a.metadata_snapshot, a.requested_at, a.approved_at, a.approved_by,
               c.status as content_status,
               ch.name as channel_name, ch.platforms as channel_platforms, ch.quality_threshold,
               cv.hook_text, cv.quality_score, cv.thumbnail_url, cv.per_platform, cv.qa,
               cl.video_url, cl.video_path, cl.thumbnail_url as clip_thumbnail, cl.duration,
               pa.rights_status, pa.monetization_status, pa.policy_risk, pa.reasons as policy_reasons
        FROM approvals a
        JOIN content c ON c.content_id = a.content_id
        LEFT JOIN channels ch ON ch.id = c.channel_id
        LEFT JOIN content_versions cv ON cv.content_id = a.content_id AND cv.version = a.version
        LEFT JOIN clips cl ON cl.content_id = a.content_id
        LEFT JOIN policy_assessments pa ON pa.content_id = a.content_id
        WHERE a.status = '${statusFilter.replace(/[^\w]/g, '')}'
        ORDER BY a.requested_at DESC
      `);
      return json({ ok: true, approvals: items });
    }

    // Approval action decision -> routes to n8n ca-api-approval webhook
    const approvalDecisionMatch = pathname.match(/^\/api\/approvals\/([0-9a-f-]{36})\/decision$/i);
    if (approvalDecisionMatch && req.method === 'POST') {
      const approvalId = approvalDecisionMatch[1];
      const body = await readBody();
      if (!body) return err('Invalid JSON body', 400);

      const action = body.action;
      if (!['approve', 'reject', 'edit', 'regenerate'].includes(action)) {
        return err('Action must be approve, reject, edit, or regenerate', 400);
      }

      // Forward to n8n webhook with header auth
      const n8nPayload = {
        approval_id: approvalId,
        action,
        by: body.by || 'dashboard_operator',
        comments: body.comments || null,
        per_platform: body.per_platform || undefined,
        version: body.version !== undefined ? Number(body.version) : undefined
      };

      const webhookRes = await httpReq(
        'POST',
        `${N8N_URL}/webhook/ca-api-approval`,
        { 'X-CA-Key': CA_INTERNAL_KEY },
        n8nPayload
      );

      if (webhookRes.status === 200) {
        return json({ ok: true, result: webhookRes.data || webhookRes.body });
      } else {
        return err(`Approval action failed: HTTP ${webhookRes.status}`, 400, webhookRes.data || webhookRes.body);
      }
    }

    // --- 5. CALENDAR & READY QUEUE ---
    if (pathname === '/api/schedules' && req.method === 'GET') {
      const scheduled = queryJson(`
        SELECT s.schedule_id, s.content_id, s.platform, s.scheduled_at, s.timezone, s.status,
               s.publication_attempts, s.last_error, s.published_at,
               ch.name as channel_name,
               cv.hook_text, cv.thumbnail_url, cv.per_platform
        FROM schedules s
        LEFT JOIN channels ch ON ch.id = s.channel_id
        LEFT JOIN content c ON c.content_id = s.content_id
        LEFT JOIN content_versions cv ON cv.content_id = s.content_id AND cv.version = c.approved_version
        ORDER BY s.scheduled_at ASC
      `);

      const publications = queryJson(`
        SELECT p.id, p.content_id, p.platform, p.status, p.published_at, p.error,
               p.platform_post_id, ch.name as channel_name
        FROM publications p
        LEFT JOIN channels ch ON ch.id = p.channel_id
        ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
        LIMIT 50
      `);

      return json({ ok: true, schedules: scheduled, publications });
    }

    // Reschedule endpoint -> routes to n8n ca-api-reschedule webhook
    if (pathname === '/api/schedules/reschedule' && req.method === 'POST') {
      const body = await readBody();
      if (!body) return err('Invalid JSON body', 400);

      const { content_id, platform, scheduled_at } = body;
      if (!content_id || !platform || !scheduled_at) {
        return err('Missing content_id, platform, or scheduled_at', 400);
      }

      const webhookRes = await httpReq(
        'POST',
        `${N8N_URL}/webhook/ca-api-reschedule`,
        { 'X-CA-Key': CA_INTERNAL_KEY },
        { content_id, platform, scheduled_at }
      );

      if (webhookRes.status === 200) {
        return json({ ok: true, result: webhookRes.data || webhookRes.body });
      } else {
        return err(`Reschedule failed: HTTP ${webhookRes.status}`, 400, webhookRes.data || webhookRes.body);
      }
    }

    // --- 6. WORKFLOW MONITOR ---
    if (pathname === '/api/workflows' && req.method === 'GET') {
      const dir = path.join(ROOT, 'workflows');
      const files = fs.readdirSync(dir).filter(f => /^\d\d_.*\.json$/.test(f)).sort();

      const workflowsList = files.map(f => {
        try {
          const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          const triggers = w.nodes.filter(n => n.type && (n.type.includes('webhook') || n.type.includes('trigger') || n.type.includes('cron') || n.type.includes('Schedule')));
          const webhooks = w.nodes.filter(n => n.type && n.type.endsWith('.webhook')).map(n => n.parameters?.path);
          return {
            file: f,
            id: w.id,
            name: w.name,
            node_count: w.nodes.length,
            triggers: triggers.map(t => ({ name: t.name, type: t.type })),
            webhook_paths: webhooks.filter(Boolean),
            status: 'active'
          };
        } catch (e) {
          return { file: f, error: e.message };
        }
      });

      return json({ ok: true, workflows: workflowsList, n8n_ui_url: N8N_URL });
    }

    // --- 7. ANALYTICS & EARNINGS ---
    if (pathname === '/api/analytics' && req.method === 'GET') {
      const snapshots = queryJson(`
        SELECT a.id, a.platform, a.captured_at, a.views, a.likes, a.comments, a.shares,
               a.watch_time_seconds, a.avg_view_duration_seconds, a.retention, a.impressions,
               ch.name as channel_name
        FROM analytics_snapshots a
        LEFT JOIN channels ch ON ch.id = a.channel_id
        ORDER BY a.captured_at DESC
        LIMIT 100
      `);

      const earnings = queryJson(`
        SELECT e.id, e.platform, e.period_start, e.period_end, e.gross_amount, e.usd_amount,
               e.rpm, e.confirmation, e.payout_status, e.recorded_at,
               ch.name as channel_name
        FROM earnings e
        LEFT JOIN channels ch ON ch.id = e.channel_id
        ORDER BY e.recorded_at DESC
      `);

      return json({ ok: true, snapshots, earnings });
    }

    // --- 8. SETTINGS & CHANNELS ---
    if (pathname === '/api/settings' && req.method === 'GET') {
      const settingsRows = queryJson('SELECT key, value, description FROM settings ORDER BY key');
      const jobConfigs = queryJson('SELECT job_type, worker_type, heavy, enabled, max_attempts FROM job_type_config ORDER BY job_type');
      return json({ ok: true, settings: settingsRows, job_type_config: jobConfigs });
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await readBody();
      if (!body || !body.key || body.value === undefined) {
        return err('Invalid key/value payload', 400);
      }

      // Restrict updatable keys
      const allowedKeys = [
        'timezone', 'max_concurrent_video_jobs', 'min_free_disk_gb',
        'notify_email', 'enable_cloud_models', 'n8n_webhook_base',
        'openshorts_base_url', 'qa_worker_url'
      ];

      if (!allowedKeys.includes(body.key)) {
        return err(`Modifying setting '${body.key}' is restricted or unsupported`, 403);
      }

      const valEscaped = JSON.stringify(body.value).replace(/'/g, "''");
      execSql(`
        UPDATE settings 
        SET value = '${valEscaped}'::jsonb,
            updated_at = now()
        WHERE key = '${body.key}'
      `);

      return json({ ok: true, message: `Setting '${body.key}' updated` });
    }

    if (pathname === '/api/channels' && req.method === 'GET') {
      const channels = queryJson(`
        SELECT c.id, c.name, c.platforms, c.autonomy_mode, c.posts_per_day, c.quality_threshold,
               c.preferred_windows, c.clip_min_seconds, c.clip_max_seconds, c.status, c.created_at,
               n.name as niche_name
        FROM channels c
        LEFT JOIN niches n ON n.id = c.niche_id
        ORDER BY c.created_at DESC
      `);
      return json({ ok: true, channels });
    }

    if (pathname === '/api/channels' && req.method === 'POST') {
      const body = await readBody();
      if (!body || !body.name) return err('Channel name is required', 400);

      const name = body.name.replace(/'/g, "''");
      const platforms = Array.isArray(body.platforms) && body.platforms.length ? body.platforms : ['youtube'];
      const platformsSql = `'{${platforms.map(p => `"${p.replace(/"/g, '')}"`).join(',')}}'`;
      const autonomyMode = body.autonomy_mode === 'automatic' ? 'automatic' : 'manual';
      const postsPerDay = parseInt(body.posts_per_day || '2', 10);
      const qualityThreshold = parseFloat(body.quality_threshold || '7.5');
      const windows = JSON.stringify(body.preferred_windows || [{ start: '12:30' }, { start: '20:00' }]).replace(/'/g, "''");

      execSql(`
        INSERT INTO channels(name, platforms, autonomy_mode, posts_per_day, quality_threshold, preferred_windows, rules)
        VALUES ('${name}', ${platformsSql}, '${autonomyMode}', ${postsPerDay}, ${qualityThreshold}, '${windows}'::jsonb, '{"banned_phrases":[],"auto_windows":false}'::jsonb)
        ON CONFLICT DO NOTHING;
      `);

      return json({ ok: true, message: 'Channel created or updated' });
    }

    // --- 8.5. LOCAL MEDIA SERVING (D:\qa_work\media, D:\qa_work\test_assets, D:\qa_work\thumbs) ---
    if (pathname.startsWith('/media/')) {
      let mediaSub = pathname.slice('/media/'.length);
      try { mediaSub = decodeURIComponent(mediaSub); } catch (_) {}
      const mediaBase = path.resolve(get('QA_WORK_DIR', 'D:\\qa_work'));
      let fullPath = path.resolve(path.join(mediaBase, 'media', mediaSub));
      if (!fullPath.startsWith(mediaBase + path.sep) || mediaSub.includes('..')) {
        return err('Access denied: Path traversal detected', 403);
      }
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        fullPath = path.resolve(path.join(mediaBase, mediaSub));
      }
      if (!fullPath.startsWith(mediaBase + path.sep) || mediaSub.includes('..')) {
        return err('Access denied: Path traversal detected', 403);
      }

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const mimes = {
          '.mp4': 'video/mp4',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.json': 'application/json'
        };
        const stat = fs.statSync(fullPath);
        res.writeHead(200, {
          'Content-Type': mimes[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(fullPath).pipe(res);
        return;
      } else {
        return err('Media not found', 404);
      }
    }

    // --- 9. STATIC FILE SERVING FOR PRODUCTION BUILD ---
    const distDir = path.join(ROOT, 'frontend', 'dist');
    if (fs.existsSync(distDir)) {
      let filePath = path.join(distDir, pathname === '/' ? 'index.html' : pathname);
      if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.js')) {
        filePath = filePath + '.js';
      } else if (!fs.existsSync(filePath) && fs.existsSync(path.join(filePath, 'index.js'))) {
        filePath = path.join(filePath, 'index.js');
      } else if (!fs.existsSync(filePath)) {
        filePath = path.join(distDir, 'index.html');
      }

      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.png': 'image/png',
        '.ico': 'image/x-icon'
      };

      try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(content);
        return;
      } catch (e) {
        // Fall through to 404
      }
    }

    // Default 404
    json({ ok: false, error: 'Endpoint not found', path: pathname }, 404);
  } catch (e) {
    console.error('API Error:', e);
    err(e.message || 'Internal server error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`BFF API Server running at http://127.0.0.1:${PORT}`);
});

module.exports = { server };

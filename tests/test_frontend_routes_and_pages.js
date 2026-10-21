/**
 * FRONTEND ROUTING, MODULE RESOLUTION & VERIFICATION TEST SUITE
 * 
 * Verifies:
 * 1. SPA Route Fallbacks (/, /dashboard, /create, /library, /content/:id, /publishing, /jobs, /analytics, /models, /integrations, /logs, /settings)
 * 2. Static Asset Resolution (CSS tokens, JS bundles)
 * 3. Native ES Module Extension-less Resolution (/App, /components/Sidebar, /pages/*)
 * 4. Local Media Serving & Path Traversal Confinement
 * 5. TypeScript Compilation & Build Pipeline
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PORT = 3001;
const BASE = `http://127.0.0.1:${PORT}`;

function req(urlPath) {
  return new Promise((resolve) => {
    http.get(`${BASE}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data
        });
      });
    }).on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });
  });
}

async function run() {
  console.log('=== STARTING FRONTEND ROUTE & MODULE INTEGRATION SUITE ===\n');
  let passed = 0;
  let total = 0;

  function assert(name, condition, detail) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] Test F-${String(total).padStart(2, '0')}: ${name} - ${detail}`);
    } else {
      console.error(`[FAIL] Test F-${String(total).padStart(2, '0')}: ${name} - ${detail}`);
    }
  }

  // 1. Build Verification
  const buildRes = spawnSync('node', ['build.js'], {
    cwd: path.resolve(__dirname, '..', 'frontend'),
    encoding: 'utf8'
  });
  assert('Frontend TypeScript compilation succeeds with exit code 0',
    buildRes.status === 0, `exitCode=${buildRes.status}`);

  // 2. SPA Route Fallbacks
  const routes = [
    '/',
    '/dashboard',
    '/create',
    '/library',
    '/content/c0000000-0000-0000-0000-000000000001',
    '/publishing',
    '/jobs',
    '/analytics',
    '/models',
    '/integrations',
    '/logs',
    '/settings'
  ];

  for (const r of routes) {
    const res = await req(r);
    assert(`Route ${r} returns HTTP 200 text/html`,
      res.status === 200 && res.headers['content-type'].includes('text/html'),
      `status=${res.status}, type=${res.headers['content-type']}`);
  }

  // 3. Static CSS & JS Bundles
  const cssRes = await req('/styles/index.css');
  assert('Static CSS token bundle served with text/css',
    cssRes.status === 200 && cssRes.headers['content-type'].includes('text/css') && cssRes.data.includes('--accent-primary: #FF003C'),
    `status=${cssRes.status}`);

  const mainRes = await req('/main.js');
  assert('Main entry script served with text/javascript',
    mainRes.status === 200 && mainRes.headers['content-type'].includes('text/javascript'),
    `status=${mainRes.status}`);

  // 4. Native ES Module Extension-less Resolution
  const modules = [
    '/App',
    '/components/Sidebar',
    '/components/Header',
    '/components/AppShell',
    '/pages/HomePage',
    '/pages/DashboardPage',
    '/pages/CreateContentPage',
    '/pages/ContentLibraryPage',
    '/pages/ContentDetailPage',
    '/pages/PublishingPage',
    '/pages/JobsPage',
    '/pages/AnalyticsPage',
    '/pages/ModelsPage',
    '/pages/IntegrationsPage',
    '/pages/LogsPage',
    '/pages/SettingsPage'
  ];

  for (const m of modules) {
    const res = await req(m);
    assert(`ES Module import ${m} auto-resolves with text/javascript`,
      res.status === 200 && res.headers['content-type'].includes('text/javascript'),
      `status=${res.status}, type=${res.headers['content-type']}`);
  }

  // 5. Media Serving & Security
  const mediaRes = await req('/media/orig_28745b9e-549a-40bc-91e3-73c761aa78fa.mp4');
  assert('Test video media streamed with video/mp4 and Content-Length > 1MB',
    mediaRes.status === 200 && mediaRes.headers['content-type'] === 'video/mp4' && Number(mediaRes.headers['content-length']) > 1000000,
    `status=${mediaRes.status}, length=${mediaRes.headers['content-length']}`);

  const traversalRes = await req('/media/..%2f..%2fsecret.txt');
  assert('Media route strictly blocks directory traversal with HTTP 403',
    traversalRes.status === 403, `status=${traversalRes.status}`);

  console.log(`\n=== FRONTEND VERIFICATION SUMMARY ===`);
  console.log(`Passed: ${passed}/${total} (${Math.round((passed / total) * 100)}%)\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});

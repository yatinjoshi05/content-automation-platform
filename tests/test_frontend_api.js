const http = require('http');

function req(path, options = {}) {
  return new Promise((resolve) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 3001,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: 10000
    };

    const r = http.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });

    r.on('error', (err) => resolve({ status: 0, error: err.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (options.body) {
      r.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    r.end();
  });
}

async function runTests() {
  console.log('=== FRONTEND & BFF END-TO-END VERIFICATION SUITE ===\n');
  let passed = 0;
  let failed = 0;

  function assert(title, condition, detail = '') {
    if (condition) {
      console.log(`PASS: ${title} ${detail ? '(' + detail + ')' : ''}`);
      passed++;
    } else {
      console.error(`FAIL: ${title} ${detail ? '(' + detail + ')' : ''}`);
      failed++;
    }
  }

  // 1. Static Files
  const rootRes = await req('/');
  assert('Root serves index.html', rootRes.status === 200 && rootRes.body.includes('Content Automation'), `HTTP ${rootRes.status}`);

  const cssRes = await req('/styles/index.css');
  assert('CSS bundle served', cssRes.status === 200 && cssRes.body.includes('--bg-base'), `HTTP ${cssRes.status}`);

  const reactRes = await req('/vendor/react.production.min.js');
  assert('React vendor bundle served', reactRes.status === 200 && reactRes.body.length > 5000, `HTTP ${reactRes.status}`);

  const mainRes = await req('/main.js');
  assert('Main JS module served', mainRes.status === 200 && mainRes.body.includes('createRoot'), `HTTP ${mainRes.status}`);

  // 2. Core API Endpoints
  const statusRes = await req('/api/status');
  assert('GET /api/status returns services & telemetry',
    statusRes.status === 200 && statusRes.json?.ok && statusRes.json.services.postgresql.online && statusRes.json.services.n8n.online,
    `n8n online=${statusRes.json?.services?.n8n?.online}, postgres online=${statusRes.json?.services?.postgresql?.online}`
  );

  const overviewRes = await req('/api/overview');
  assert('GET /api/overview returns stats & counts',
    overviewRes.status === 200 && overviewRes.json?.ok && typeof overviewRes.json.stats.jobs.queued === 'number',
    `Jobs total=${overviewRes.json?.stats?.jobs?.total}, Approvals awaiting=${overviewRes.json?.stats?.approvals?.awaiting}`
  );

  const jobsRes = await req('/api/jobs');
  assert('GET /api/jobs returns array of jobs',
    jobsRes.status === 200 && Array.isArray(jobsRes.json?.jobs),
    `Count: ${jobsRes.json?.jobs?.length}`
  );

  const contentRes = await req('/api/content');
  assert('GET /api/content returns array of content items',
    contentRes.status === 200 && Array.isArray(contentRes.json?.content),
    `Count: ${contentRes.json?.content?.length}`
  );

  const approvalsRes = await req('/api/approvals');
  assert('GET /api/approvals returns approval queue',
    approvalsRes.status === 200 && Array.isArray(approvalsRes.json?.approvals),
    `Count: ${approvalsRes.json?.approvals?.length}`
  );

  const schedulesRes = await req('/api/schedules');
  assert('GET /api/schedules returns scheduled and publications',
    schedulesRes.status === 200 && Array.isArray(schedulesRes.json?.schedules) && Array.isArray(schedulesRes.json?.publications),
    `Schedules: ${schedulesRes.json?.schedules?.length}, Pubs: ${schedulesRes.json?.publications?.length}`
  );

  const workflowsRes = await req('/api/workflows');
  assert('GET /api/workflows returns modular workflows (>= 15)',
    workflowsRes.status === 200 && workflowsRes.json?.workflows?.length >= 15,
    `Found: ${workflowsRes.json?.workflows?.length} workflows`
  );

  const analyticsRes = await req('/api/analytics');
  assert('GET /api/analytics returns snapshots and earnings arrays',
    analyticsRes.status === 200 && Array.isArray(analyticsRes.json?.snapshots) && Array.isArray(analyticsRes.json?.earnings),
    `Snapshots: ${analyticsRes.json?.snapshots?.length}, Earnings: ${analyticsRes.json?.earnings?.length}`
  );

  const settingsRes = await req('/api/settings');
  assert('GET /api/settings returns settings and job configs',
    settingsRes.status === 200 && Array.isArray(settingsRes.json?.settings) && Array.isArray(settingsRes.json?.job_type_config),
    `Settings: ${settingsRes.json?.settings?.length}, JobConfigs: ${settingsRes.json?.job_type_config?.length}`
  );

  // 3. Supported Mutations
  const updateSettingRes = await req('/api/settings', {
    method: 'POST',
    body: { key: 'timezone', value: 'Asia/Kolkata' }
  });
  assert('POST /api/settings updates allowed setting', updateSettingRes.status === 200 && updateSettingRes.json?.ok, updateSettingRes.json?.message);

  const restrictedSettingRes = await req('/api/settings', {
    method: 'POST',
    body: { key: 'malicious_key_not_allowed', value: 'bad' }
  });
  assert('POST /api/settings rejects restricted keys (HTTP 403)', restrictedSettingRes.status === 403, `HTTP ${restrictedSettingRes.status}`);

  const createChannelRes = await req('/api/channels', {
    method: 'POST',
    body: {
      name: 'Funny Shorts Dev Channel',
      platforms: ['youtube'],
      autonomy_mode: 'manual',
      posts_per_day: 2,
      quality_threshold: 7.5
    }
  });
  assert('POST /api/channels registers new channel', createChannelRes.status === 200 && createChannelRes.json?.ok, createChannelRes.json?.message);

  const channelsListRes = await req('/api/channels');
  assert('GET /api/channels retrieves registered channels',
    channelsListRes.status === 200 && channelsListRes.json?.channels?.some(c => c.name === 'Funny Shorts Dev Channel'),
    `Channels count: ${channelsListRes.json?.channels?.length}`
  );

  // 4. Input Validation & Error Handling
  const badApprovalRes = await req('/api/approvals/00000000-0000-0000-0000-000000000000/decision', {
    method: 'POST',
    body: { action: 'invalid_action' }
  });
  assert('Approval action rejects invalid action (HTTP 400)', badApprovalRes.status === 400, `HTTP ${badApprovalRes.status}`);

  const badRescheduleRes = await req('/api/schedules/reschedule', {
    method: 'POST',
    body: { content_id: 'bad-uuid' }
  });
  assert('Reschedule action rejects missing fields (HTTP 400)', badRescheduleRes.status === 400, `HTTP ${badRescheduleRes.status}`);

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests();

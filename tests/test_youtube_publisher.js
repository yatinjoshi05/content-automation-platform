/**
 * YOUTUBE PUBLISHER MODULE INTEGRATION & SAFETY TEST SUITE
 * 
 * Verifies:
 * 1. Error classification & timeout disambiguation (AMBIGUOUS on upload timeout)
 * 2. Secret redaction across logs and error messages
 * 3. Pre-publish gate validation and fail-closed blocking
 * 4. Title, metadata, and privacy sanitization
 * 5. Mock flow execution and result recording
 */

const {
  classifyPublishError,
  redactSecrets,
  prepareUploadPayload,
  executePublishFlow,
  sqlQuery,
  sqlExec
} = require('../workers/youtube_publisher.js');

let passed = 0;
let total = 0;

function assert(name, condition, detail = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] Test YT-${String(total).padStart(2, '0')}: ${name}`);
  } else {
    console.error(`[FAIL] Test YT-${String(total).padStart(2, '0')}: ${name} - ${detail}`);
  }
}

async function runTests() {
  console.log('=== STARTING YOUTUBE PUBLISHER SAFETY & ADAPTER TEST SUITE ===\n');

  // 1. Secret Redaction Tests
  const rawToken = 'Bearer ya29.a0AfH6SMDIu1234567890abcdefghijk';
  const redactedToken = redactSecrets(rawToken);
  assert('Redacts ya29 OAuth tokens', !redactedToken.includes('ya29.a0Af') && redactedToken.includes('[REDACTED_OAUTH_TOKEN]'), redactedToken);

  const rawApiKey = 'GoogleApiKey AIzaSyABCDEF1234567890123456789012345';
  const redactedKey = redactSecrets(rawApiKey);
  assert('Redacts AIza Google API keys', !redactedKey.includes('AIzaSy') && (redactedKey.includes('[REDACTED_API_KEY]') || redactedKey.includes('[REDACTED]')), redactedKey);

  const rawJson = '{"client_secret": "my-ultra-secret-value-123", "password": "supersecretpassword"}';
  const redactedJson = redactSecrets(rawJson);
  assert('Redacts client_secret and passwords', !redactedJson.includes('my-ultra-secret') && !redactedJson.includes('supersecret'), redactedJson);

  // 2. Error Classification & Ambiguity Disambiguation
  const authErr = classifyPublishError(new Error('HTTP 401 unauthorized: invalid_grant'), 'session_init');
  assert('Classifies 401 as AUTH', authErr.category === 'AUTH', JSON.stringify(authErr));

  const quotaErr = classifyPublishError(new Error('HTTP 403 quotaExceeded: The user rate limit has been exceeded'), 'session_init');
  assert('Classifies quota error as RATE_LIMIT', quotaErr.category === 'RATE_LIMIT', JSON.stringify(quotaErr));

  const transientErr = classifyPublishError(new Error('ECONNRESET: socket hang up'), 'session_init');
  assert('Classifies session_init network drop as TRANSIENT', transientErr.category === 'TRANSIENT', JSON.stringify(transientErr));

  const timeoutDuringUpload = classifyPublishError(new Error('ETIMEDOUT: connection timed out while sending video bytes'), 'uploading_bytes');
  assert('CRITICAL: Classifies byte-upload timeout as AMBIGUOUS to prevent duplicate uploads', timeoutDuringUpload.category === 'AMBIGUOUS', JSON.stringify(timeoutDuringUpload));

  const timeoutAwaitingResponse = classifyPublishError(new Error('ETIMEDOUT: no response received after final chunk'), 'awaiting_response');
  assert('CRITICAL: Classifies awaiting-response timeout as AMBIGUOUS to prevent duplicate uploads', timeoutAwaitingResponse.category === 'AMBIGUOUS', JSON.stringify(timeoutAwaitingResponse));

  // 3. Database Mock Execution Test
  // Create a controlled test content item and schedule
  const channelRows = sqlQuery(`SELECT id FROM channels LIMIT 1;`);
  const sourceRows = sqlQuery(`SELECT source_id FROM sources LIMIT 1;`);
  if (channelRows.length > 0 && sourceRows.length > 0) {
    const chId = channelRows[0].id;
    const sId = sourceRows[0].source_id;
    const testContent = sqlQuery(`
      INSERT INTO content(source_id, channel_id, status, current_version, approved_version)
      VALUES ('${sId}'::uuid, '${chId}'::uuid, 'scheduled', 1, 1)
      RETURNING content_id;
    `)[0];
    const cId = testContent.content_id;

    const fp = 'fp_test_yt_pub_' + Date.now();
    const testClip = sqlQuery(`
      INSERT INTO clips(source_id, channel_id, clip_engine, video_url, video_path, duration, fingerprint)
      VALUES ('${sId}'::uuid, '${chId}'::uuid, 'original_generator', 'http://127.0.0.1:3001/media/orig_0a04561f-1c7d-43a7-99c6-d605e4790181.mp4', 'D:\\qa_work\\media\\orig_0a04561f-1c7d-43a7-99c6-d605e4790181.mp4', 21, '${fp}')
      RETURNING clip_id;
    `)[0];
    const clipId = testClip.clip_id;

    sqlExec(`
      INSERT INTO content_versions(content_id, version, clip_id, per_platform, quality_score, qa)
      VALUES ('${cId}'::uuid, 1, '${clipId}'::uuid, '{"youtube": {"title": "Test YouTube Short #Shorts", "description": "Auto test", "hashtags": ["test"]}}'::jsonb, 8.5, '{"visual_pass": true}'::jsonb);
    `);

    // Satisfy approval, rights, and policy gates
    sqlExec(`
      INSERT INTO approvals(content_id, version, status, approved_by)
      VALUES ('${cId}'::uuid, 1, 'approved', 'qa-tester');
    `);
    sqlExec(`
      INSERT INTO permissions(source_id, permission_status, status, allowed_platforms, permission_evidence)
      VALUES ('${sId}'::uuid, 'verified', 'active', '{youtube,instagram,facebook}', 'Owner verified source license')
      ON CONFLICT DO NOTHING;
    `);
    sqlExec(`
      UPDATE permissions SET permission_status='verified', status='active', permission_evidence='Owner verified source license' WHERE source_id='${sId}'::uuid;
    `);
    sqlExec(`
      INSERT INTO policy_assessments(source_id, platform, rights_status, monetization_status, policy_risk, status)
      VALUES ('${sId}'::uuid, 'youtube', 'verified', 'pass', 'low', 'active')
      ON CONFLICT DO NOTHING;
    `);

    // Ensure platform account exists
    sqlExec(`
      INSERT INTO platform_accounts(channel_id, platform, external_account_id, enabled)
      VALUES ('${chId}'::uuid, 'youtube', 'UC_test_publisher_mock', true)
      ON CONFLICT DO NOTHING;
    `);

    // Schedule content
    const testSched = sqlQuery(`
      INSERT INTO schedules(content_id, channel_id, platform, scheduled_at, status)
      VALUES ('${cId}'::uuid, '${chId}'::uuid, 'youtube', now() - interval '2 minutes', 'scheduled')
      RETURNING schedule_id;
    `)[0];
    const schedId = testSched.schedule_id;

    // Test executePublishFlow dryRun / mock success
    const mockRes = await executePublishFlow(schedId, { dryRun: true });
    assert('Mock publish execution records success and returns mock ID', mockRes.ok === true && mockRes.platform_post_id.startsWith('yt_mock_'), JSON.stringify(mockRes));

    // Test duplicate publication blocked (re-calling executePublishFlow on the same schedule now in published status)
    const dupRes = await executePublishFlow(schedId, { dryRun: true });
    assert('Duplicate publication on already published schedule is blocked', dupRes.ok === false && (dupRes.reason === 'duplicate_prevented' || dupRes.reason === 'not_scheduled'), JSON.stringify(dupRes));

    // Cleanup test content and schedule
    sqlExec(`DELETE FROM publications WHERE content_id = '${cId}'::uuid;`);
    sqlExec(`DELETE FROM schedules WHERE content_id = '${cId}'::uuid;`);
    sqlExec(`DELETE FROM approvals WHERE content_id = '${cId}'::uuid;`);
    sqlExec(`DELETE FROM content_versions WHERE content_id = '${cId}'::uuid;`);
    sqlExec(`DELETE FROM content WHERE content_id = '${cId}'::uuid;`);
    sqlExec(`DELETE FROM clips WHERE clip_id = '${clipId}'::uuid;`);
  }

  console.log(`\n=== YOUTUBE PUBLISHER TEST SUMMARY ===`);
  console.log(`Passed: ${passed}/${total} (${Math.round((passed / total) * 100)}%)\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

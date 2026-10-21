/**
 * Comprehensive Test Suite Runner for Content Automation
 * Runs all unit, integration, and security verification suites.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const suites = [
  'tests/test_credential_watcher.js',
  'tests/test_disk_telemetry.js',
  'tests/test_frontend_api.js',
  'tests/test_frontend_routes_and_pages.js',
  'tests/test_oauth_lifecycle.js',
  'tests/test_youtube_publisher.js',
  'tests/test_meta_and_gmail_integrations.js'
];

console.log('====================================================');
console.log('CONTENT AUTOMATION: MASTER TEST EXECUTION SUITE');
console.log('====================================================\n');

let totalSuites = suites.length;
let passedSuites = 0;
let failedSuites = 0;

for (const suite of suites) {
  console.log(`>>> RUNNING: ${suite}`);
  const res = spawnSync(process.execPath, [path.join(rootDir, suite)], {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env
  });

  if (res.stdout) console.log(res.stdout.trim());
  if (res.stderr) console.error(res.stderr.trim());

  if (res.status === 0) {
    passedSuites++;
    console.log(`>>> [PASS] ${suite}\n`);
  } else {
    failedSuites++;
    console.error(`>>> [FAIL] ${suite} (Exit code ${res.status})\n`);
  }
}

console.log('====================================================');
console.log(`SUMMARY: ${passedSuites}/${totalSuites} SUITES PASSED (${failedSuites} FAILED)`);
console.log('====================================================');

if (failedSuites > 0) {
  process.exit(1);
}

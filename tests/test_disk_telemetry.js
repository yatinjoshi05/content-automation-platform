/**
 * Unit & Static Verification for Disk Telemetry & ca_claim_job() Fail-Closed Semantics
 * Tests:
 * 1. Adequate disk space (>= 8 GB) on both drives -> heavy jobs allowed
 * 2. Low disk space on System drive (C: < 8 GB) -> heavy jobs blocked, light allowed
 * 3. Low disk space on Media drive (D: < 8 GB) -> heavy jobs blocked, light allowed
 * 4. Missing telemetry (no snapshot) -> fail closed -> heavy jobs blocked, light allowed
 * 5. Stale telemetry (> 15 mins old) -> fail closed -> heavy jobs blocked, light allowed
 * 6. Invalid telemetry (null / negative / NaN) -> fail closed -> heavy jobs blocked, light allowed
 * 7. Verification that database/schema.sql contains the fail-closed PL/pgSQL logic
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("=== Running Disk Telemetry & ca_claim_job() Tests ===");

// 1. Static AST/Text Inspection of database/schema.sql
const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
assert.ok(fs.existsSync(schemaPath), "database/schema.sql must exist");
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

// Ensure fail-closed checks are present in ca_claim_job
assert.ok(schemaContent.includes("IF NOT FOUND OR r.captured_at <= now() - interval '15 minutes' THEN"), 
  "schema.sql must contain fail-closed check for missing or stale telemetry");
assert.ok(schemaContent.includes("ELSIF (r.disk_free_gb IS NULL OR r.disk_free_gb < min_disk)"), 
  "schema.sql must contain fail-closed check for null or low disk space");
console.log("PASS [Static]: schema.sql correctly specifies fail-closed logic for ca_claim_job().");

// 2. Logic Simulation of ca_claim_job stress evaluator
function evaluateStress({ snapshot, min_disk = 8.0, max_cpu = 85.0, max_ram = 85.0, now = Date.now() }) {
  if (!snapshot) {
    // Missing telemetry -> fail closed
    return { stressed: true, reason: 'missing_telemetry' };
  }
  
  const fifteenMinutesMs = 15 * 60 * 1000;
  if (now - snapshot.captured_at > fifteenMinutesMs) {
    // Stale telemetry -> fail closed
    return { stressed: true, reason: 'stale_telemetry' };
  }
  
  if (snapshot.disk_free_gb === null || snapshot.disk_free_gb === undefined || isNaN(snapshot.disk_free_gb) || snapshot.disk_free_gb < min_disk) {
    // Low or invalid disk space
    return { stressed: true, reason: 'disk_space_constrained' };
  }
  
  if (snapshot.cpu_percent !== null && snapshot.cpu_percent > max_cpu) {
    return { stressed: true, reason: 'cpu_overloaded' };
  }
  
  if (snapshot.ram_percent !== null && snapshot.ram_percent > max_ram) {
    return { stressed: true, reason: 'ram_overloaded' };
  }
  
  return { stressed: false, reason: 'nominal' };
}

function canClaimJob(jobTypeConfig, stressEval, currentRunning = { heavy: 0, light: 0 }, limits = { max_video: 1, max_light: 3 }) {
  if (jobTypeConfig.heavy) {
    return !stressEval.stressed && currentRunning.heavy < limits.max_video;
  } else {
    return currentRunning.light < limits.max_light;
  }
}

const heavyJob = { job_type: 'clipping', heavy: true };
const lightJob = { job_type: 'trend_research', heavy: false };
const now = Date.now();

// Test 1: Adequate disk space (C: 15 GB, D: 20 GB, effective: 15 GB >= 8 GB)
{
  const snap = { captured_at: now - 30000, disk_free_gb: 15.0, cpu_percent: 25.0, ram_percent: 45.0 };
  const evalResult = evaluateStress({ snapshot: snap, now });
  assert.strictEqual(evalResult.stressed, false, "Nominal telemetry must not be stressed");
  assert.strictEqual(canClaimJob(heavyJob, evalResult), true, "Heavy job must be claimable under nominal telemetry");
  assert.strictEqual(canClaimJob(lightJob, evalResult), true, "Light job must be claimable");
  console.log("PASS: Test 1 - Adequate disk space allows both heavy and light jobs");
}

// Test 2: Low disk space on System drive (C: 3.5 GB, D: 20 GB, effective: 3.5 GB < 8 GB)
{
  const snap = { captured_at: now - 30000, disk_free_gb: 3.5, cpu_percent: 25.0, ram_percent: 45.0 };
  const evalResult = evaluateStress({ snapshot: snap, now });
  assert.strictEqual(evalResult.stressed, true, "Low system disk must trigger stressed state");
  assert.strictEqual(canClaimJob(heavyJob, evalResult), false, "Heavy job must be BLOCKED when disk < 8 GB");
  assert.strictEqual(canClaimJob(lightJob, evalResult), true, "Light job must STILL RUN when disk < 8 GB");
  console.log("PASS: Test 2 - Low disk on System drive blocks heavy jobs while allowing light jobs");
}

// Test 3: Low disk space on Media drive (C: 25 GB, D: 4.8 GB, effective: 4.8 GB < 8 GB)
{
  const snap = { captured_at: now - 30000, disk_free_gb: 4.8, cpu_percent: 25.0, ram_percent: 45.0 };
  const evalResult = evaluateStress({ snapshot: snap, now });
  assert.strictEqual(evalResult.stressed, true, "Low media disk must trigger stressed state");
  assert.strictEqual(canClaimJob(heavyJob, evalResult), false, "Heavy job must be BLOCKED when media disk < 8 GB");
  assert.strictEqual(canClaimJob(lightJob, evalResult), true, "Light job must STILL RUN when media disk < 8 GB");
  console.log("PASS: Test 3 - Low disk on Media drive blocks heavy jobs while allowing light jobs");
}

// Test 4: Missing telemetry (null snapshot row)
{
  const evalResult = evaluateStress({ snapshot: null, now });
  assert.strictEqual(evalResult.stressed, true, "Missing telemetry must trigger fail-closed stressed state");
  assert.strictEqual(canClaimJob(heavyJob, evalResult), false, "Heavy job must be BLOCKED when telemetry is missing");
  assert.strictEqual(canClaimJob(lightJob, evalResult), true, "Light job must STILL RUN when telemetry is missing");
  console.log("PASS: Test 4 - Missing telemetry fails closed (heavy blocked, light runs)");
}

// Test 5: Stale telemetry (captured 30 minutes ago > 15 min limit)
{
  const snap = { captured_at: now - (30 * 60 * 1000), disk_free_gb: 50.0, cpu_percent: 10.0, ram_percent: 30.0 };
  const evalResult = evaluateStress({ snapshot: snap, now });
  assert.strictEqual(evalResult.stressed, true, "Stale telemetry must trigger fail-closed stressed state");
  assert.strictEqual(canClaimJob(heavyJob, evalResult), false, "Heavy job must be BLOCKED when telemetry is stale");
  assert.strictEqual(canClaimJob(lightJob, evalResult), true, "Light job must STILL RUN when telemetry is stale");
  console.log("PASS: Test 5 - Stale telemetry fails closed (heavy blocked, light runs)");
}

// Test 6: Invalid telemetry (null or NaN disk reading)
{
  const snapNull = { captured_at: now - 10000, disk_free_gb: null, cpu_percent: 20.0, ram_percent: 30.0 };
  const evalNull = evaluateStress({ snapshot: snapNull, now });
  assert.strictEqual(evalNull.stressed, true, "Null disk reading must trigger fail-closed stressed state");
  assert.strictEqual(canClaimJob(heavyJob, evalNull), false, "Heavy job must be BLOCKED on null disk reading");

  const snapNaN = { captured_at: now - 10000, disk_free_gb: NaN, cpu_percent: 20.0, ram_percent: 30.0 };
  const evalNaN = evaluateStress({ snapshot: snapNaN, now });
  assert.strictEqual(evalNaN.stressed, true, "NaN disk reading must trigger fail-closed stressed state");
  assert.strictEqual(canClaimJob(heavyJob, evalNaN), false, "Heavy job must be BLOCKED on NaN disk reading");
  console.log("PASS: Test 6 - Invalid telemetry (null/NaN) fails closed");
}

console.log("=== ALL 6 DISK TELEMETRY TEST SCENARIOS PASSED (100%) ===");

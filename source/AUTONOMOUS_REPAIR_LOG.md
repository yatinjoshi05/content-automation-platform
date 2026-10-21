# Autonomous repair log
Environment: n8n 2.41.4 (Node 24.21 via npm `node@24`), PostgreSQL 16, mock YouTube/LLM/OpenShorts server (`/tmp/mock/mock.js`, test-only), real ffmpeg-generated video. Status words: VERIFIED = executed in real n8n/DB; PARTIAL = executed against mocks only; UNVERIFIED = not executed.

## ISSUE-001 — Clipping blocked: "VALIDATION: bad source url"  (found by real n8n run)
* Component: 06_clipping `Guard (rights + allowlists)`; same defect latent in 10_publishing `Guard Media And Adapter`.
* Reproduction: queued a clipping job in real n8n; recorded execution data showed a valid input (`https://www.youtube.com/watch?v=abcdefghij1`, allowlist containing the host) yet the node threw.
* Root cause: the n8n Code-node sandbox has **no `URL` global** (probe workflow executed on 2.41.4: `typeof URL === 'undefined'`, also `URLSearchParams`, `fetch`; `Buffer` and `require('crypto')` exist). `new URL()` threw ReferenceError, which my `try/catch` relabelled as "bad source url" (symptom hid cause). My earlier JS tests ran in plain Node where `URL` exists, so they could not catch it.
* Fix: `parseUrl()` regex helper (http/https, host allowlist unchanged); test harness now executes Code nodes in a `vm` context **without** URL/fetch to mirror n8n.
* Tests: JS suite 38/38 (in URL-less sandbox); real n8n: both clipping jobs completed, OpenShorts submit carried `acknowledged:true` + secret, signed webhook accepted (HTTP 200), 4 clips created.
* Status: VERIFIED (real n8n + mock OpenShorts).

## ISSUE-002 — Every LLM-backed stage ran its final node twice  (found by real run: 2 content_versions per clip)
* Components: 02 Trend, 05 Policy, 07 Packaging.
* Root cause: `llm_block()` already connected `Record Model Success -> next`, and each workflow connected the same edge again. n8n runs a node once per edge ⇒ `ca_packaging_store` executed twice (versions 1 and 2, 8 approval jobs for 4 clips; trends/policy would duplicate too).
* Fix: removed the redundant links; `validate.py` now fails on duplicate edges (verified it flags the old files); **defence in depth**: stage functions (`ca_trend_store`, `ca_rights_stage`, `ca_policy_store`, `ca_packaging_store`, `ca_approval_request`, `ca_schedule_content`) now `SELECT … FOR UPDATE` the job and return `skipped: job_not_running` if called twice.
* Tests: new DB test "duplicate worker call is a no-op"; offline suite DB 69/69, JS 38/38, SQL 78/78, structure 0 errors. Real n8n re-run: see ISSUE-002 retest below.
* Status: fix VERIFIED offline; real-n8n retest pending in next cycle.

## ISSUE-003 — Environment notes (not code defects)
* n8n 2.41 refuses Node < 24 → SETUP.md must say Node 24. `WEBHOOK_URL` deprecated (use `N8N_WEBHOOK_URL`). n8n binds `::` by default; set `N8N_LISTEN_ADDRESS=0.0.0.0` if IPv6 unavailable. `update:workflow --all` removed; use `publish:workflow --id`. Full n8n install ≈ 2.7 GB.
* Status: documented; SETUP.md update pending.

## ISSUE-004 — Pre-publish gate reported "no schedule" for every channel without a platform_accounts row
* Component: `ca_publish_gate`. Reproduction: DB test T12e failed with `["no schedule"]`. Root cause: `IF NOT FOUND` after the `platform_accounts` lookup tested THAT lookup, not the schedule. Fix: test `s.schedule_id IS NULL`. Tests: DB suites. Status: VERIFIED (DB + later real n8n runs reached the gate and passed it for valid content).

## ISSUE-005 — Fresh cached policy research was ignored
* Component: 05 Policy (`Need Fetch?` with no URLs to fetch fell through to the "not configured" branch) and nothing wrote the cache. Fix: `Cache Covers Platforms?` branch; `ca_policy_store` writes `policy_knowledge`. Status: superseded by ISSUE-009 (verified in real n8n).

## ISSUE-006 — Publishing failure handling (found by real n8n publish run)
* Component: 10 Publishing. Failure: with 3 due schedules in one run, error nodes used `$('Begin Publication').first()` (wrong publication); a missing n8n credential was classified UNKNOWN; the failure write then threw and left the schedule in `publishing`. Fix: `ca_due_schedules(1)` (one schedule per execution), `credentials` => AUTH, `ca_publish_result` raises a clear error on unknown id, and the supervisor parks schedules stuck in `publishing` (`stuck_publish_minutes`) as failed + CRITICAL, never auto-retried (the upload may have succeeded). Tests: real n8n run (AUTH classified, critical non-retryable error row, schedule `failed`, auth circuit open, other schedules on the channel not picked); supervisor parking verified in real n8n using a forced `publishing` row (TEST DATA, not a real crash). Status: VERIFIED (real n8n; crash path only simulated).

## ISSUE-007 — Analytics success never reset the youtube_api circuit counter
* Found by real n8n analytics run (failures stayed at 2 after recovery). Fix: `Record API Success` node. Status: FIXED in source; **real-n8n re-test of the fix NOT yet done**.

## ISSUE-008 — Repeated reject emitted duplicate events; published approvals could be rejected
* Fix: `ca_approval_action` makes repeated reject a no-op, refuses reject of published. Tests: DB test + real n8n webhook calls. Status: VERIFIED.

## ISSUE-009 — Policy cache renewed itself on reuse (stale policy would never expire)
* Found by the real-n8n cache lifecycle test. Root cause: `ca_policy_store` rewrote the cache with a new expiry even when the assessment used only the cached summary. Fix: cache written/refreshed only when fresh text was fetched (`p_fetched`). Tests: DB tests + real n8n (empty cache -> workflow creates cache; fresh cache reused, no fetch, timestamp unchanged; v2 page ignored while fresh; refetch + refresh after expiry; empty cache + no URLs => review_required fail-safe). Status: VERIFIED (real n8n, mock LLM, local self-signed HTTPS mock).

## ISSUE-010 — Webhook input errors returned HTTP 500 {"message":"Error in workflow"}  — FIXED (final audit)
* Components: ca-api-approval, -policy-review, -reschedule, -source-review, -earning, new -publication-reconcile. Fix: webhooks use `responseNode`; Validate/DB nodes have error outputs → formatter → *Respond to Webhook*: 400 `{ok:false,error:"VALIDATION",message}`, 404/409/422 for domain outcomes, 500 only for internal faults with a generic message (no secrets/stack). Tests: 12 JS tests on the formatters + real n8n (`verify` smoke: invalid approval_id → HTTP 400 JSON). Status: VERIFIED (real n8n for approval endpoint; other endpoints share the same generated nodes, JS-tested only).

## ISSUE-011 — Publishing idempotency: ambiguous outcomes could be reset/retried or marked published  — FIXED (final audit)
* Root cause (code reading, then DB tests): `ca_publish_begin` marked a schedule `published` whenever a publication row was `published` OR `processing`, even without a platform post id; `started` rows were silently restarted (`ON CONFLICT … WHERE status IN ('failed','started')`); a success callback with an empty post id was accepted; the supervisor marked crashed publications `failed` (retryable).
* Fix: new status `ambiguous`; begin: published+post id ⇒ duplicate (and truthful reconcile of the schedule), started/processing/ambiguous/published-without-id ⇒ AMBIGUOUS (schedule `failed`, publication `ambiguous`, CRITICAL, never auto-retried), in-flight (recent `publishing`) ⇒ `in_progress` untouched, failed ⇒ bounded retry on the SAME row; result: success REQUIRES a post id, repeated/conflicting callbacks are harmless, upload-node timeouts/5xx classified AMBIGUOUS; `ca_publication_reconcile` + `ca-api-publication-reconcile` is the only way to confirm or re-queue. Tests: 33 DB tests (`tests_publish_safety.sql`) incl. started/processing/published duplicates, failed+retry same row, retry limit, success twice, success without id, crash before/after upload, human reconcile; JS classifier tests. Status: VERIFIED (DB); real-n8n kill test see report.

## ISSUE-012 — Platform accounts were not validated (schedules/publishing with no account or NULL external id)  — FIXED
* `ca_platform_account_problem()` (unsupported platform, not on channel, no account, disabled, missing external_account_id for instagram/facebook) used by `ca_schedule_content` (no schedule is created; notification + error) and `ca_publish_gate`. Tests: ACCT1-6, SCHED1. Status: VERIFIED (DB; real n8n E2E uses an account row).

## ISSUE-013 — Policy staleness was not enforced at publish time  — FIXED
* Gate now blocks on an expired active assessment (`block_on_stale_policy` default flipped to **true**) and enqueues a bounded `force_refresh` policy job (cache bypassed → official pages re-fetched); refresh success re-arms the blocked schedule and the gate re-checks everything; refresh failure leaves it blocked. Tests POL1-5. Status: VERIFIED (DB); forced refresh path of workflow 05 not executed in real n8n.

## ISSUE-014 — QA worker safety gaps  — FIXED
* Partial/failed downloads left temp files; fixed temp names; no concurrency limit; no download timeout; optional auth; frozen video at EOF not detected (found by test). Now: unique temp file removed in `finally`, orphan sweep, semaphore (default 1, queue 4 else 429), download timeout, size cap (header + streamed), redirects refused, host allow-list, API key REQUIRED (`X-CA-Key`), hard max duration, freeze-to-EOF detection. Tests (real worker, ffmpeg-made inputs): valid, corrupt, no audio, silent, black, frozen, wrong aspect, too short, too long, huge (header and stream), partial download, redirect, SSRF, file://, unauthorized host, missing/wrong key, bad JSON, 7 concurrent requests (5 served, 2 got 429), 0 temp files left. Status: VERIFIED (real worker; mock media server).

## ISSUE-015 — YouTube privacy was hard-coded `public`  — FIXED
* Now `channels.rules.youtube_privacy` → `settings.youtube_default_privacy` (default **private**), validated public|private|unlisted; title ≤100 enforced. Tests: JS. Status: VERIFIED (JS; upload itself blocked by OAuth).

## ISSUE-016 — SQL schema had 15 superseded duplicate function definitions  — FIXED
* `tools/consolidate_sql.py` keeps one definition per function (latest wins); `--check` guards it (43 unique functions). Status: VERIFIED.

## ISSUE-017 — Deployment required manual import of every workflow  — FIXED
* `deployment/deploy.js` (+ .ps1 wrappers): idempotent; stable workflow ids; creates missing credentials; imports/publishes 15 workflows; verify smoke tests. First bug found by real run: verify ran before n8n registered webhooks (added wait). Re-run produced identical workflow ids/counts, 2 credentials, 17 webhooks, no duplicates. Status: VERIFIED on Linux (Node deployer); PowerShell wrappers UNVERIFIED on Windows.

## ISSUE-018 — Documented limitation (carried): validation errors from the *internal* `ca-w-resource` hook still return a generic 500 (it is only called by the host reporter); `ca-openshorts-done` ignores bad signatures with HTTP 200 by design.

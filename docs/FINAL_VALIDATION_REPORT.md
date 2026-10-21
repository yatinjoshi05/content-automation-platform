# FINAL VALIDATION REPORT
Build: frozen source `/home/claude/n8n-workflows` → package `FINAL_REPAIRED_N8N_WORKFLOWS.zip`. Environment of all tests: Linux sandbox, **real n8n 2.41.4 (Node 24.21)**, PostgreSQL 16, ffmpeg, plus **mock** YouTube Data API / LLM (Ollama format) / OpenShorts (signed webhooks) / local self-signed HTTPS policy page. **No live YouTube, Gmail, OpenShorts, Meta, Google Drive or LLM provider was ever contacted.** This is NOT "production ready"; it is a tested backend that still needs your accounts and a first supervised run (docs/SETUP.md, Parts 7-9).

## 1. Architecture summary
15 modular n8n workflows (never merged) + PostgreSQL state machine + ffmpeg QA worker + ONE deployment entry point (`deployment/deploy.js`, wrappers `setup.ps1/update.ps1/verify.ps1/uninstall.ps1`). Hand-off between workflows is through the `jobs` table and a webhook allow-list, not workflow ids. See docs/ARCHITECTURE.md.

## 2. Workflow inventory / dependency map (stable ids `cawf01…cawf15`)
| # | Workflow | Trigger | Depends on |
|---|---|---|---|
| 01 | Master Orchestrator | schedule 15 s / 6 h | DB (`ca_claim_job`), calls 02-09,15 webhooks |
| 02 Trend · 03 Discovery · 04 Rights (+source-review API) · 05 Policy (+policy-review API) | webhook (job) | DB, YouTube API key, LLM |
| 06 Clipping (+`ca-openshorts-done`) | webhook | OpenShorts, HMAC secret |
| 07 Packaging · 08 Approval (+API) · 09 Scheduler (+reschedule, reconcile APIs) · 15 Visual QA | webhook | DB, LLM / QA worker |
| 10 Publishing | schedule 1 min | DB gate, YouTube OAuth |
| 11 Analytics & Earnings (+earning API) | schedule 6 h / weekly | YouTube API key |
| 12 Supervisor + resource hook · 13 Error handler · 14 Notifications | schedule / error trigger | DB, Gmail |
17 webhook paths, 246 nodes. Database: 34+ tables, 43 SQL functions (one authoritative definition each; `consolidate_sql.py --check`).

## 3. Tests executed — exact totals (final source, final run)
| Suite | Result |
|---|---|
| Duplicate SQL function check | none |
| Workflow structure vs n8n-nodes-base 2.15.1 (types, versions, params, connections, duplicate edges, secrets) | 15 files / 246 nodes / **0 errors** |
| Embedded SQL (PREPARE against real schema) | **86 statements, 0 failed** |
| Database tests | `tests` 34 + `tests_pipeline` 49 + `tests_publish_safety` 33 = **116 PASS, 0 FAIL** |
| Code-node tests (real node JS in a URL-less sandbox) | **52 passed, 0 failed** |
| QA worker matrix (real worker, ffmpeg media) | all cases below behaved as specified |
| Real-n8n runs | deployment ×2, automatic-mode E2E, kill test A, earlier cycles listed in the repair log |

## 4. VERIFIED — REAL N8N (against mocks)
* **One-command deployment** (`deploy.js setup --start-n8n`) on a clean n8n + clean database: prerequisites check, DB create + schema, credentials created, **15 workflows imported + published**, n8n started, verify. **Second run (`update`, n8n running): identical workflow id set, 15 active, 2 credentials (not duplicated), 17 webhook registrations, 0 duplicate names, schema re-applied a 3rd time cleanly.**
* **Automatic-mode E2E on the final build** (channel `automatic`, empty policy cache, no human approval call): trend → discovery → rights → policy (workflow fetched the HTTPS policy page and CREATED the cache) → OpenShorts (mock, signed webhook) → clips → packaging → technical QA + thumbnail → autonomy gate **auto-approved 4/4 (`auto:gates_passed`)** → scheduler placed them in the configured IST windows → forced due → **final pre-publish gate passed and the YouTube upload node was reached**; it failed with AUTH (no credential) → publication `failed`, schedule `failed`, critical non-retryable error row, CRITICAL notification, channel auth circuit open, the other 3 schedules NOT published.
* **Kill n8n (`kill -9`) during publishing:** schedule left `publishing`, publication `started`; after restart the real supervisor parked it: schedule `failed`, publication **`ambiguous`**, CRITICAL notification; 3 minutes later unchanged, **one publication row, no automatic retry**.
* HTTP validation: `verify` smoke on the live n8n — invalid approval input returns **HTTP 400 `{"ok":false,"error":"VALIDATION","message":"approval_id must be a UUID"}`**; missing key → 403.
* Earlier cycles (earlier builds; same mechanisms): policy-cache lifecycle (empty→created, fresh→reused without renewal, expiry→refresh, empty+no URLs→review_required), human policy review webhook (blocked cannot be approved, reviewer/reason/version stored, approval re-arms schedule), final gate blocking QA-failed content, OpenShorts bad-HMAC / duplicate webhook / failed job / retry ladder / circuit breaker / half-open recovery, low-disk and high-CPU heavy-job gating, approval webhook (stale version, repeated approve/reject), analytics snapshot (only available metrics, no duplicate, API-outage behaviour), earnings webhook (estimated vs confirmed).
* QA worker, real process: valid clip passes + thumbnail; corrupt, no-audio, silent, black, frozen (found and fixed a freeze-to-EOF detection bug), wrong aspect, too short, too long, huge file (header and streamed), partial download, redirect, SSRF (`169.254…`, `file://`), unauthorized host, missing/wrong API key, bad JSON all rejected correctly; 7 simultaneous requests → 5 served serially, 2 got HTTP 429; **0 temp files left**.

## 5. VERIFIED — OFFLINE / DATABASE ONLY
* Publication idempotency (started/processing/published duplicates, failed+retry on the same row, retry limit, success twice, success without post id, ambiguous result, crash before/after upload, human reconciliation, refusal to reconcile a published row) — 33 DB tests.
* Platform-account fail-closed validation (missing/disabled account, instagram without external id, unsupported platform, facebook adapter off, scheduler skips invalid platforms).
* Policy freshness: stale assessment blocks publishing and enqueues a forced refresh; refresh failure keeps it blocked; refresh success re-arms; review_required / blocked.
* Autonomy gate rules, retry ladder, circuit breaker, dead-letter, stuck-job recovery, model quota fallback, notification dedup, duplicate event/audit rows for duplicate publication (PUB4).
* Code-node logic: HMAC check, host allow-lists, classifiers (AMBIGUOUS for upload-node timeouts/5xx), validators, HTTP status mapping, YouTube privacy validation.

## 6. BLOCKED BY USER ACTION (nothing else blocks these)
YouTube OAuth upload · Gmail send · YouTube Data API key (live trend/analytics) · live OpenShorts instance · Meta token. Exact numbered steps: docs/SETUP.md Part 7-9.

## 7. UNVERIFIED (not executed — do not assume they work)
* Kill-n8n tests for **clipping while `waiting` (lost webhook)** and **while `running`**: scripted (`tools/real_n8n_test/kill_n8n_recovery.sh`) but the sandbox was reset mid-run, so they did not complete. Their recovery logic (stuck-job retry ladder, late webhook ignored) is DB-tested only.
* The `force_refresh` policy path of workflow 05 in real n8n (DB-tested); the new `ca-api-publication-reconcile` endpoint in real n8n (imported/registered, DB- and JS-tested, never called live); 400/404/409 mapping of the other four APIs live (generated by the same code as the approval API, JS-tested).
* **ISSUE-007 fix** (analytics success resets the API circuit counter) never re-run in real n8n after the fix.
* PowerShell wrappers `setup/update/verify/uninstall.ps1`, `host_reporter.ps1`, `retention.ps1` — authored on Linux, never run on Windows. The Node deployer they call WAS run.
* Instagram and Facebook publishing: Instagram flow written but gated OFF (`adapter_verified_instagram=false`, unverified); Facebook is a stub that throws UNSUPPORTED. **Neither works.**
* Manual-mode full E2E on the final build (verified on an earlier build); real LLM output quality; behaviour and performance on the target i5-8350U / Windows 11.

## 8. KNOWN LIMITATIONS
* **Technical QA only**: playable, duration, 9:16/resolution, audio present/level, black/frozen frames, thumbnail. **No speaker-framing, subtitle or semantic visual check.**
* Analytics = YouTube public statistics (views, likes, comments); watch time/retention/impressions/subscribers need the YouTube Analytics API (not implemented) → stored NULL. IG/FB insights not implemented. **Earnings are manual entry only** (estimated vs confirmed kept separate); no automatic revenue retrieval.
* Google Drive backup not implemented. No read API/frontend backend layer. Policy changes are picked up only after cache expiry (or forced refresh); the cache holds a model-derived summary of the fetched page.
* `ca-w-resource` (internal) still answers invalid input with a generic 500; `ca-openshorts-done` ignores bad signatures with HTTP 200 by design.
* Sandbox timing: the whole test environment (Postgres/n8n/mocks) was reset by the platform repeatedly; every reported result was observed before a reset.

## 9. Credentials / resources / security
Required: PostgreSQL password, `CA_INTERNAL_KEY`, `OPENSHORTS_WEBHOOK_SECRET` (all in `config/.env`, never in workflow JSON); for live use: YouTube API key, YouTube OAuth2, Gmail OAuth2. Optional: Gemini/Groq/Meta. Resources: Node 24, ~3 GB n8n install, ≥15 GB free disk, ffmpeg; defaults 1 heavy job, pause <8 GB free disk / >85 % CPU/RAM. Security: all worker/API webhooks need the header key (403 otherwise); OpenShorts webhook HMAC (timing-safe); clip/source hosts allow-listed (regex URL parser, no `URL` in the n8n sandbox); QA worker needs its key, refuses redirects/unknown hosts; errors returned to clients are generic; secrets redacted from persisted errors and e-mails; set `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` (the OpenShorts submit body contains the webhook secret).

## 10. Remaining risks
Real OpenShorts/YouTube/Gmail behaviour; an unaudited Google project may only allow private uploads; crash windows between an external side effect and its DB write are handled by *ambiguous → human reconcile* (proven for publish, DB-only for clipping); local LLMs are slow on this CPU.

## 11. Exact commands
Fresh install: `powershell -ExecutionPolicy Bypass -File deployment\setup.ps1` (= `node deployment\deploy.js setup --start-n8n`). Update: `deployment\update.ps1` (= `node deployment\deploy.js update --start-n8n`). Verify: `deployment\verify.ps1` (= `node deployment\deploy.js verify`). Offline suite: `source/tools/run_all_checks.sh`.
Final package: see the delivery message (path + sha256).

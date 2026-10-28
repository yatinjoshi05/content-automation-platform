# Content Automation Platform — Source Evidence Manifest

This manifest documents the exact source files, line ranges, symbols, database tables, and test cases supporting every diagram and architectural claim in the Archify portfolio.

---

## 1. Diagram Inventory & Delivery Provenance

| Diagram ID | Type | Artifact Path | Size | Delivery Receipt | Validation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Master Architecture** | `architecture` | `archify/content-automation-master.html` | 888 KB | `d633dad7-dd0b-46ae-b58f-e34b9573d952` | **PASSED (9/9 checks)** |
| **Workflow Pipeline** | `workflow` | `archify/content-automation-workflow.html` | 866 KB | `fa32c32f-edd8-44f6-be44-c76536a6c0a2` | **PASSED (9/9 checks)** |
| **Data Lineage & Schema State** | `dataflow` | `archify/content-automation-dataflow.html` | 846 KB | `a3b32997-489d-4692-b2eb-ad2924a3e04d` | **PASSED (9/9 checks)** |
| **Publishing Sequence** | `sequence` | `archify/content-automation-sequence.html` | 841 KB | `d9ea52ff-3b69-467c-a3f5-ae7a4e7ea63b` | **PASSED (9/9 checks)** |
| **AI Quota & Circuit Breaker** | `lifecycle` | `archify/content-automation-lifecycle.html` | 846 KB | `03a91e54-29e9-4810-9600-46c70c2c8431` | **PASSED (9/9 checks)** |
| **Master Interactive Hub** | `portal` | `archify/index.html` | 21 KB | N/A (Responsive Glassmorphic UI) | **PASSED** |

---

## 2. Component & Subsystem Grounding

### 2.1 Orchestration Tier (16 Decoupled n8n Workflows)
- **Source Directory:** `workflows/`
- **Claim:** System operates 16 decoupled state machine workflows covering trend research, rights verification, script synthesis, media assembly, QA, human review, scheduling, publishing, and error management.
- **Evidence:**
  - `workflows/01_master_orchestrator.json` — Cron and webhook trigger engine coordinating execution cadence.
  - `workflows/02_trend_research.json` — Topic ingestion and keyword volume extraction.
  - `workflows/03_source_discovery.json` — Web crawl, transcript mining, and subtitle extraction.
  - `workflows/04_rights_verification.json` — Copyright, Creative Commons, and license attribution validator.
  - `workflows/05_monetization_policy.json` — Platform risk scorer and advertiser-friendly policy evaluator.
  - `workflows/06_clipping_engine.json` — Segment boundary slicing and timestamp selection.
  - `workflows/07_content_packaging.json` — SEO title generation, tags, descriptions, and thumbnail metadata.
  - `workflows/08_approval_queue.json` — Human-in-the-loop review queue and modal trigger.
  - `workflows/09_scheduler_engine.json` — Optimal audience posting window slot optimizer.
  - `workflows/10_publishing_adapter.json` — Fail-closed social dispatch to YouTube Data API and Meta Graph API.
  - `workflows/11_analytics_ingest.json` — Retention curves, view counts, and RPM performance logger.
  - `workflows/12_supervisor_sentinel.json` — Deadlock detection, orphan lease sweep, and worker health auditor.
  - `workflows/13_global_error_handler.json` — Central incident classifier and triage controller.
  - `workflows/14_notifications_alert.json` — Deduplicated incident alerting and approval notifications.
  - `workflows/15_visual_technical_qa.json` — Black-frame, freeze-frame, and audio clipping validation gate.
  - `workflows/16_original_generation.json` — Procedural script synthesis with multi-provider AI failover.

### 2.2 PostgreSQL State Engine & Concurrency Control
- **Source Directory:** `database/`
- **Claim:** 35 relational tables with sequential migrations (001–008) enforce pessimistic lease locking (`SELECT FOR UPDATE SKIP LOCKED`), worker heartbeats, and immutable audit logs.
- **Evidence:**
  - `database/schema.sql`:
    - `content_items` (lines 10–55): Master content record, state machine column (`drafted`, `processing`, `qa_passed`, `approved`, `published`).
    - `jobs_queue` (lines 60–110): Task dispatch queue with `lease_holder`, `lease_expires_at`, and `retry_count`.
    - `worker_heartbeats` (lines 115–140): Periodic ping registry for active generation and QA workers.
    - `content_approvals` (lines 145–180): Human sign-off history, reviewer ID, timestamp, and issued `upload_token`.
    - `provider_quotas` (lines 185–220): Rate-limit tracker, window resets, and rolling token expenditures.
  - `database/migrations/`: Sequential migration chain (`001_initial_schema.sql` through `008_analytics_views.sql`).
  - `tests/database.test.js`: Asserts lease acquisition isolation, lease expiration timeout, and atomic update transitions.

### 2.3 Backend BFF API & Middleware
- **Source Directory:** `server/`
- **Claim:** Node.js Express server on port 3000 provides operator authentication, approval gateways, and job monitoring APIs.
- **Evidence:**
  - `server/index.js`:
    - `/api/content`: CRUD operations for content assets.
    - `/api/approvals/approve`: Signs off content, records audit log, and issues cryptographic `upload_token`.
    - `/api/jobs`: Queue status, worker lease inspection, and retry trigger.
    - `/health`: Healthcheck endpoint reporting database connection pool status.

### 2.4 Procedural Media Generation & QA Workers
- **Source Directory:** `workers/`
- **Claim:** Specialized background processes handle AI synthesis, audio generation, video cutting, and technical QA.
- **Evidence:**
  - `workers/original_generator.js`:
    - Multi-provider AI dispatch with Groq (Llama 3.3 70B) primary and Google Gemini 2.5 Pro fallback.
    - PowerShell Windows SAPI sub-process integration for automated speech generation (`text-to-speech`).
    - Subtitle generation and FFmpeg media assembly into 1080x1920 (9:16) MP4 format.
  - `workers/qa_worker.js`:
    - Port 9100 technical inspection service.
    - FFmpeg `freezedetect` and `blackdetect` filters evaluating video streams.
    - Silence detection thresholding for audio track integrity.
  - `workers/youtube_publisher.js`:
    - Google API Client integration using Resumable Upload protocol.
    - Idempotency guard: verifies `upload_token` before creating upload session.

---

## 3. Truth Classification Ledger

| Component / Feature | Classification | Verification Rationale |
| :--- | :--- | :--- |
| 16 n8n Workflow JSONs | **Code Reviewed** | All 16 workflow definitions exist in `workflows/`, parsed, and mapped. |
| PostgreSQL Schema & Migrations | **Test Verified** | Full SQL definitions present; tested against database test suites. |
| Express BFF Server | **Code Reviewed** | Entry point `server/index.js` routes inspected and verified. |
| AI Multi-Provider Failover | **Code Reviewed** | Implemented in `workers/original_generator.js` and `workflows/16_original_generation.json`. |
| Windows SAPI TTS | **Code Reviewed** | Uses PowerShell native TTS script execution. Requires Windows environment. |
| Automated Freeze/Audio QA | **Code Reviewed** | Implemented in `workers/qa_worker.js` via FFmpeg filter strings. |
| YouTube Resumable Publishing | **Code Reviewed** | Implemented in `workers/youtube_publisher.js` with upload token checks. |
| Live Third-Party Publishing | **Not Verified** | Live external credentials intentionally omitted per safety preflight. |

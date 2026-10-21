# CONTENT AUTOMATION PLATFORM — DEPLOYMENT HANDOFF & PRODUCTION GUIDE

> **Platform Version:** 1.0.0 (Production Verified Baseline)  
> **Target Environment:** Hybrid Self-Hosted / Cloud VPS (Linux or Windows Server)  
> **Generated:** October 2026 (Mission 35 Final Master Handoff)  
> **Status:** READY WITH DOCUMENTED LIMITATIONS (Local verification complete; external cloud hosting and Meta app authorization pending owner account configuration).

---

## 1. Executive Summary & Deployment Readiness

The Content Automation Platform has been brought to its highest safely achievable verification state. 
- **188/188 Automated Tests Passing (100%)**:
  - Master Integration Suite (`scripts/run_all_tests.js`): 106/106 tests PASS across 7 test suites.
  - PostgreSQL Pipeline State Machine Suite (`database/tests/tests_pipeline.sql`): 49/49 tests PASS.
  - PostgreSQL Publishing Safety & Gate Suite (`database/tests/tests_publish_safety.sql`): 33/33 tests PASS.
  - Deployment Verification (`node deployment/deploy.js verify`): 10/10 checks PASS.
- **Production Safety Safeguards Verified**:
  - **YouTube Upload**: Video ID `Ri22VZJPacA` verified permanently **PRIVATE**. Zero unauthorized uploads.
  - **Gmail Operational Alerts**: Active Send-Approval Gate (`email_send_approval = null`). Important-only allowlist, rate limiting, and zero real emails sent during verification.
  - **Meta (Instagram & Facebook)**: Kept strictly **FAIL-CLOSED** (`adapter_verified_instagram=false`, `adapter_verified_facebook=false`).
  - **Data Integrity**: Database verified with 36 base tables, 8 schema migrations, and full dump/restore verification.
  - **Frontend**: Full CoreUI dashboard and Express backend verified with zero design or layout changes.

---

## 2. Architecture & Service Dependency Map

```mermaid
graph TD
    User([Content Operator]) -->|Browser Port 3001| CoreUI[CoreUI Frontend & Express BFF Server]
    CoreUI -->|SQL Queries| Postgres[(PostgreSQL 16 Database)]
    CoreUI -->|Media Stream| WorkDir[QA Work Directory D:\qa_work]
    
    subgraph Orchestration Engine
        N8N[n8n Workflow Engine :5678]
        W01[CA 01 Master Scheduler & Dispatcher]
        W02to07[CA 02-07 Intake, Discovery, Rights, Clipping]
        W08to10[CA 08-10 Approval, Scheduler, Publishing]
        W11to15[CA 11-15 Analytics, Supervisor, Errors, Notifications, QA]
        N8N --> W01
        N8N --> W02to07
        N8N --> W08to10
        N8N --> W11to15
    end

    W01 -->|Polls ca_claim_job| Postgres
    W08to10 -->|ca_publish_gate| Postgres
    
    subgraph Microservices & Workers
        GenWorker[Original Video Generator :9200]
        QAWorker[Technical QA Worker :9100]
        TeleDaemon[Telemetry Host Reporter Daemon]
        CredWatcher[Credential Watcher Daemon]
    end

    W06 -->|POST /generate| GenWorker
    W15 -->|POST /qa| QAWorker
    TeleDaemon -->|POST /webhook/ca-w-resource| N8N
    CredWatcher -->|Polls and decrypts OAuth| N8N
    CredWatcher -->|Updates sync state| Postgres

    subgraph External Platforms
        YouTube[YouTube Data API v3 & Partner Upload]
        GmailAPI[Google Workspace / Gmail API]
        MetaGraph[Meta Graph API - Fail Closed]
    end

    W10 -.->|Private Upload Only| YouTube
    W14 -.->|Strict Send-Approval Gate| GmailAPI
    W10 -.x|Blocked until verified| MetaGraph
```

### Component Port & Service Matrix

| Service Name | Default Port | Internal / Public | Runtime | Process / Command |
|---|---|---|---|---|
| **PostgreSQL** | `5432` | Internal Only | PostgreSQL 16.8 | `postgres.exe` |
| **n8n Workflow Engine** | `5678` | Internal / Reverse Proxy | Node.js 24 LTS | `n8n start` |
| **CoreUI Frontend & BFF** | `3001` | Reverse Proxy / Operator | Node.js 24 LTS | `node server/index.js` |
| **QA Worker** | `9100` | Internal Only | Node.js 24 LTS | `node workers/qa_worker.js` |
| **Original Video Generator** | `9200` | Internal Only | Node.js 24 LTS | `node workers/original_generator.js` |
| **Telemetry Host Reporter** | N/A | Internal Loop (10s) | PowerShell / Node | `workers/host_reporter.ps1` |
| **Credential Watcher** | N/A | Internal Loop (10s) | Node.js 24 LTS | `node scripts/watch_and_probe_credentials.js` |

---

## 3. Clean Environment Variable Specification

Copy this template to `config/.env`. **Never commit or share the populated `.env` file.**

```bash
# ==============================================================================
# CONTENT AUTOMATION PLATFORM — ENVIRONMENT CONFIGURATION TEMPLATE
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. PostgreSQL Database Configuration
# ------------------------------------------------------------------------------
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=content_automation
DB_USER=postgres
DB_PASSWORD=<SECURE_DATABASE_PASSWORD>

# ------------------------------------------------------------------------------
# 2. n8n Workflow Engine Configuration
# ------------------------------------------------------------------------------
N8N_URL=http://localhost:5678
N8N_CMD=n8n
# Persistent user data folder for credentials and workflow executions
N8N_USER_FOLDER=D:\n8n_data
# Shared secret for authenticating internal n8n webhooks (X-CA-Key header)
CA_INTERNAL_KEY=<GENERATE_64_CHAR_HEX_KEY>
# Shared secret for verifying OpenShorts clipping callback signatures
OPENSHORTS_WEBHOOK_SECRET=<GENERATE_64_CHAR_HEX_KEY>

# ------------------------------------------------------------------------------
# 3. CoreUI Frontend & Express BFF Server
# ------------------------------------------------------------------------------
FRONTEND_PORT=3001

# ------------------------------------------------------------------------------
# 4. Microservices & Worker URLs
# ------------------------------------------------------------------------------
QA_WORKER_URL=http://localhost:9100
ORIGINAL_GENERATOR_PORT=9200
OPENSHORTS_URL=http://localhost:8000
# Scratch working directory for media QA, frame analysis, and temporary clips
QA_WORK_DIR=D:\qa_work

# ------------------------------------------------------------------------------
# 5. External Notifications
# ------------------------------------------------------------------------------
NOTIFY_EMAIL=owner@example.com


# ------------------------------------------------------------------------------
# 6. Binary Paths (System Overrides if not on default PATH)
# ------------------------------------------------------------------------------
PSQL_CMD=D:\tools\pgsql\bin\psql.exe
FFMPEG_CMD=D:\tools\ffmpeg\bin\ffmpeg.exe
FFPROBE_CMD=D:\tools\ffmpeg\bin\ffprobe.exe
```

---

## 4. Step-by-Step Setup, Service Startup & Health Checks

### Step 1: System Prerequisites
1. **Node.js**: Install Node.js v24.x LTS (required by n8n v2.x and ESM crypto).
2. **PostgreSQL**: Install PostgreSQL 16.x. Ensure `psql` is accessible.
3. **FFmpeg & FFprobe**: Install FFmpeg 6.x+ (ensure `ffmpeg` and `ffprobe` are on PATH).
4. **n8n CLI**: Install globally via `npm install -g n8n`.

### Step 2: Database Initialization & Migrations
1. Open PowerShell / Bash in project root:
   ```powershell
   # Apply core schema and all 8 migrations
   node deployment/deploy.js setup
   ```
2. Confirm the 36 tables and schema migrations are recorded:
   ```sql
   SELECT count(*) FROM schema_migrations; -- Must return 8
   ```

### Step 3: Synchronize Workflows & Credentials
1. Run automated credential and workflow deployment:
   ```powershell
   node deployment/deploy.js update
   ```
2. Verify all 16 `CA 01` through `CA 16` workflows appear in n8n and are active.

### Step 4: Start Background Services
Start services in the following order:
```powershell
# 1. Start Express BFF & CoreUI Server (Port 3001)
Start-Process -NoNewWindow node -ArgumentList "server/index.js"

# 2. Start Technical QA Worker (Port 9100)
Start-Process -NoNewWindow node -ArgumentList "workers/qa_worker.js"

# 3. Start Original Video Generator (Port 9200)
Start-Process -NoNewWindow node -ArgumentList "workers/original_generator.js"

# 4. Start Host Telemetry Reporter Daemon (Every 10s)
Start-Process -NoNewWindow powershell -ArgumentList "-File workers/host_reporter.ps1"

# 5. Start Credential Watcher Daemon
Start-Process -NoNewWindow node -ArgumentList "scripts/watch_and_probe_credentials.js"

# 6. Start n8n Workflow Engine (Port 5678)
n8n start
```

### Step 5: Service Health Verification
Run the consolidated health check:
```powershell
node deployment/deploy.js verify
```
Expected output:
```text
PASS  n8n health - HTTP 200
PASS  workflows present in n8n - 16 CA workflows (expected >= 15)
PASS  no duplicate workflow names
PASS  webhook rejects missing key (403) - HTTP 403
PASS  invalid input => HTTP 400 JSON (not 500) - HTTP 400
PASS  smoke: resource snapshot webhook -> DB - HTTP 200
PASS  database reachable + seeded - 41/12/506
PASS  no duplicate settings
PASS  QA worker - {"ok":true,"active":0,"queued":0,"concurrency":1}
```

---

## 5. Database Backup and Restore Runbook

### Creating a Full Database Backup
Run `pg_dump` targeting a custom compressed format:
```powershell
# Set password for session
$env:PGPASSWORD = "<DB_PASSWORD>"

# Create backup directory if missing
New-Item -ItemType Directory -Force -Path "D:\pgsql\backups"

# Execute binary pg_dump
D:\tools\pgsql\bin\pg_dump.exe -h 127.0.0.1 -p 5432 -U postgres -d content_automation -F c -b -v -f "D:\pgsql\backups\content_automation_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"
```

### Restoring a Database Backup
To restore to a fresh database or test instance:
```powershell
$env:PGPASSWORD = "<DB_PASSWORD>"

# 1. Terminate existing connections and drop target test database
D:\tools\pgsql\bin\psql.exe -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='content_automation_restore_target' AND pid <> pg_backend_pid(); DROP DATABASE IF EXISTS content_automation_restore_target; CREATE DATABASE content_automation_restore_target;"

# 2. Restore using pg_restore
D:\tools\pgsql\bin\pg_restore.exe -h 127.0.0.1 -p 5432 -U postgres -d content_automation_restore_target -v -1 "D:\pgsql\backups\<BACKUP_FILENAME>.dump"

# 3. Verify table counts
D:\tools\pgsql\bin\psql.exe -h 127.0.0.1 -p 5432 -U postgres -d content_automation_restore_target -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
# Expected: 36
```

---

## 6. Hosting & Cloud Deployment Blueprint

For production hosting outside local Windows, the recommended target-neutral topology is a **Hybrid or Single Cloud VPS (Linux / Ubuntu 24.04 or Debian 12)** with Docker Compose.

### Target Deployment Topology

| Tier | Component | Recommended Hosting Solution |
|---|---|---|
| **Database** | PostgreSQL 16+ | Managed DB (Supabase / Neon / AWS RDS) or VPS Docker container |
| **Orchestration** | n8n v2.x | VPS Docker container with persistent volume for `~/.n8n` |
| **Frontend & API** | Express BFF + Static Assets | Node.js container / PM2 or VPS reverse-proxied by Nginx / Caddy |
| **Worker Engine** | QA Worker & Generator | Node.js + FFmpeg on CPU-optimized VPS (minimum 4 vCPU, 8 GB RAM) |
| **Media Storage** | Local Scratch / Artifacts | High-IOPS NVMe volume or S3-compatible object storage (Cloudflare R2) |

### Docker Compose Quickstart (`deployment/docker-compose.yml`)

The repository includes a ready-to-run [deployment/docker-compose.yml](file:///c:/Users/H/Downloads/yt%20studio/FINAL_REPAIRED_N8N_WORKFLOWS/CONTENT_AUTOMATION/deployment/docker-compose.yml) and [deployment/Dockerfile](file:///c:/Users/H/Downloads/yt%20studio/FINAL_REPAIRED_N8N_WORKFLOWS/CONTENT_AUTOMATION/deployment/Dockerfile) configured for containerized deployment:

```bash
# 1. From repository root, copy and configure your secrets:
cp config/.env.example config/.env
# Edit config/.env with your secure DB_PASSWORD and CA_INTERNAL_KEY

# 2. Build and launch all services:
docker compose -f deployment/docker-compose.yml --env-file config/.env up -d --build

# 3. Check container status:
docker compose -f deployment/docker-compose.yml ps
```


---

## 7. Owner-Only Action Checklist (Pre-Deployment)

The following items strictly require owner credentials, accounts, or approvals:

1. **Gmail OAuth Token Secret Alignment**:
   - The stored refresh token in n8n was generated with the primary Web Client. To clear the background 401 refresh warning:
     1. Open n8n UI at `http://localhost:5678/home/credentials`.
     2. Open `Gmail OAuth2`.
     3. Click **Connect my account** to perform the Google OAuth consent flow.
     4. Save the credential.
2. **Gmail Send Approval (Per-Email Gate)**:
   - To approve any pending notification for dispatch:
     ```sql
     UPDATE notifications 
     SET email_send_approval = now() 
     WHERE id = '<NOTIFICATION_UUID>' AND email_send_approval IS NULL;
     ```
3. **YouTube Public Release (Optional)**:
   - Video `Ri22VZJPacA` is currently verified as **PRIVATE**.
   - If public release is desired, update channel rules:
     ```sql
     UPDATE channels SET rules = rules || '{"youtube_privacy":"public"}' WHERE name='Funny Shorts';
     ```
4. **Meta (Instagram & Facebook Reels) Enablement**:
   - Complete Meta App Review for Instagram Graph API and Facebook Pages API.
   - Enter `Page Access Token` and Instagram Business Account ID in `platform_accounts`.
   - Once verified, enable adapter flags:
     ```sql
     UPDATE settings SET value = 'true'::jsonb WHERE key = 'adapter_verified_instagram';
     UPDATE settings SET value = 'true'::jsonb WHERE key = 'adapter_verified_facebook';
     ```
5. **Reverse Proxy & TLS Certificates**:
   - Configure Caddy or Nginx with Let's Encrypt SSL certificates for public HTTPS endpoints.

---

## 8. Rollback Runbook

If any regression occurs in production:

1. **Emergency Publishing Freeze**:
   ```sql
   -- Instantly stop all automated intake and publishing
   UPDATE settings SET value = 'true'::jsonb WHERE key = 'system_paused';
   UPDATE settings SET value = 'true'::jsonb WHERE key = 'force_manual_approval';
   ```
2. **Revert Workflows to Stored Baseline**:
   ```powershell
   # Re-import canonical workflow definitions from workflows/
   node deployment/deploy.js update
   ```
3. **Database Point-in-Time Restore**:
   - Use the pre-change dump at `D:\pgsql\backups\content_automation_mission34_pre_change.dump`.
   - Execute restore via the commands detailed in Section 5.

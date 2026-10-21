# SETUP GUIDE — from zero to a running system (Windows 11)

Read this top to bottom once. Every command can be copy-pasted. Anything marked **YOU** needs your own account/login — nobody else can do it for you.
Status of what is and is not proven: `docs/FINAL_VALIDATION_REPORT.md`. Short version: the backend was tested end-to-end in a real n8n against *mock* YouTube/OpenShorts/LLM services. **YouTube upload, Gmail sending, real OpenShorts and real LLM providers are untested until YOU connect them (Part 7).** Start in *manual* mode with YouTube privacy *private*.

## Part 0 — What you are installing (plain English)
* **PostgreSQL** = the memory of the system (channels, content, jobs, approvals, schedules).
* **n8n** = the engine that runs 15 small workflows (trend research → rights → policy → clipping → QA → approval → schedule → publish → analytics).
* **OpenShorts** = the open-source tool that cuts long videos into 9:16 shorts (runs on your PC).
* **QA worker** = a tiny program (needs ffmpeg) that checks each clip technically and makes a thumbnail.
* **deploy.js / setup.ps1** = ONE command that installs the database, imports all 15 workflows into n8n, connects credentials and starts n8n. You never import workflows by hand.

## Part 1 — Install the prerequisites (Windows 11)
Open **PowerShell** (Start → type "PowerShell").
1. **Node.js (Node 24 LTS recommended)**:
   - n8n officially requires Node >= 24 (`engines: { node: '>=24.0.0' }`).
   - If using **NVM for Windows**, switch globally in an administrator PowerShell: `nvm use 24.18.0`.
   - The deployment wrappers (`deployment\setup.ps1`, `update.ps1`, `verify.ps1`) automatically detect and use an installed Node 24 binary if available in `$env:LOCALAPPDATA\nvm\v24*`.
   - To test or run `deploy.js` on Node 20, pass `--allow-node-20` or set `ALLOW_NODE_20=true` in `config\.env`.
2. **PostgreSQL 16 or 17**:
   - Install via winget: `winget install PostgreSQL.PostgreSQL.16` or download installer from https://www.postgresql.org/download/windows/.
   - Ensure the command line tools are installed and `psql` is on PATH (`C:\Program Files\PostgreSQL\16\bin`). Check: `psql --version`.
3. **FFmpeg & FFprobe**:
   - Install via winget: `winget install Gyan.FFmpeg`.
   - Open a new PowerShell and check: `ffmpeg -version` and `ffprobe -version`.
4. **n8n CLI / Server**:
   - Install globally under Node 24: `npm install -g n8n`.
   - Check: `n8n --version`.
5. **Docker Desktop** (only required to run OpenShorts clipping engine):
   - Install via winget: `winget install Docker.DockerDesktop` or https://www.docker.com/products/docker-desktop/.
6. **Free disk space safeguard**:
   - Keep **at least 8–15 GB free**.
   - Note: The system pauses heavy video jobs automatically if free disk space falls below `min_free_disk_gb` (default 8 GB). If your `C:` drive has limited space, consider configuring media directories on `D:\` and setting `QA_WORK_DIR` accordingly.

## Part 2 — Get the package and configure it
1. Unzip `FINAL_REPAIRED_N8N_WORKFLOWS.zip` to `C:\ContentAutomation` (so you have `C:\ContentAutomation\deployment\`, `workflows\`, …).
2. In PowerShell: `cd C:\ContentAutomation` then `copy config\.env.example config\.env` then `notepad config\.env`.
3. Fill in `config\.env`:
   * `DB_PASSWORD` = the PostgreSQL password from Part 1.
   * `CA_INTERNAL_KEY` = a random secret. Generate one: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` and paste the result.
   * `OPENSHORTS_WEBHOOK_SECRET` = another random secret (generate the same way).
   * Leave the URLs as they are unless you changed ports. `NOTIFY_EMAIL` = the address that should receive important alerts (optional now).
   * **Never share this file.** The `.gitignore`/zip never contains your real one.

## Part 3 — Start OpenShorts (the clipping engine)
1. Follow the OpenShorts README (https://github.com/mutonby/openshorts): clone it, then run its documented Docker start command. When it is up, its API answers at `http://localhost:8000` (the default used by this project; change `OPENSHORTS_URL` in `config\.env` if yours differs).
2. This project calls `POST /api/process` with `{url, acknowledged:true, webhook_url, webhook_secret}` and verifies the signed completion webhook, exactly like OpenShorts' own n8n example. **This was verified against OpenShorts' published example and a mock — never against your live OpenShorts. Test one real clip in Part 8.**

## Part 4 — Start the QA worker (keep this window open, or make it a scheduled task)
```
cd C:\ContentAutomation
$env:QA_API_KEY = "<the SAME value as CA_INTERNAL_KEY>"
$env:QA_ALLOWED_HOSTS = "localhost:8000"      # the OpenShorts host:port clips are served from
$env:QA_WORK_DIR = "C:\ContentAutomation\qa_work"
node workers\qa_worker.js
```
You should see `qa_worker listening on 127.0.0.1:9100`. It runs ONE ffmpeg job at a time (safe for your CPU), refuses unknown hosts/redirects, caps download size, and always deletes temporary videos.
What it checks: file playable, duration, 9:16, ≥720×1280, audio present and not silent, black/frozen video, thumbnail. **It does NOT check speaker framing or subtitle readability** — a human still reviews that in manual mode.

## Part 5 — ONE-COMMAND INSTALL
Make sure PostgreSQL is running and Docker/OpenShorts/QA worker are up (they can also be started later). Then:
```
cd C:\ContentAutomation
powershell -ExecutionPolicy Bypass -File deployment\setup.ps1
```
It will: check Node/psql/ffmpeg/n8n and your config → create the database `content_automation` and load the schema → create the n8n credentials **CA Postgres** and **CA Internal Key** → import and activate all 15 workflows (no duplicates, ever) → start n8n → run a health check and a smoke test. At the end you get a PASS/FAIL list and `deployment\last_report.json`.
* `TODO credential …` lines are normal: they are the logins only YOU can create (Part 7).
* Re-running the command is safe (it updates in place). After you change anything use `deployment\update.ps1`; to just re-check use `deployment\verify.ps1`.
* **Same thing without the wrapper** (what the wrapper runs): `node deployment\deploy.js setup --start-n8n`.
* Honesty note: `setup.ps1` itself could not be run on Windows by its author (written on Linux). The Node program it calls (`deploy.js`) was run twice on a clean n8n and produced no duplicates. If the .ps1 misbehaves, run the `node …` line directly.

## Part 6 — First look at n8n
Open http://localhost:5678 → create the owner account when asked → you will see 15 workflows named `CA 01 … CA 15`, all **active**. Do not rename or delete them (they are matched by stable ids).

## Part 7 — Connect YOUR accounts (the only manual part)
Create each credential in n8n (left menu **Credentials → Create credential**) with **exactly** the name below, then run `deployment\update.ps1` once so the workflows pick them up.

| Name (exact) | Type in n8n | What it needs | Needed for |
|---|---|---|---|
| `YouTube API Key` | *Query Auth* | Name = `key`, Value = your YouTube Data API v3 key | trend research, discovery, analytics |
| `YouTube OAuth2` | *YouTube OAuth2 API* | OAuth client from your Google Cloud project | **publishing** |
| `Gmail OAuth2` | *Gmail OAuth2 API* | OAuth client from your Google Cloud project | important e-mail alerts |
| `Gemini` / `Groq` | *Header Auth* / *Bearer Auth* | free-tier API keys | optional cloud models (local Ollama works without) |
| `Meta Graph token` | *Query Auth* (`access_token`) | Meta app token | optional Instagram (kept OFF) |

**A. YouTube API key (5 minutes):** https://console.cloud.google.com → create a project → *APIs & Services → Library* → enable **YouTube Data API v3** → *Credentials → Create credentials → API key* → copy it → paste into the n8n credential.
**B. Google OAuth for YouTube + Gmail (15 minutes):** same project → *OAuth consent screen* (External, add yourself as a *Test user*) → enable **Gmail API** → *Credentials → Create OAuth client ID → Web application* → add the redirect URL shown in the n8n credential screen (usually `http://localhost:5678/rest/oauth2-credential/callback`) → copy Client ID/Secret into n8n → click **Sign in with Google** and accept. Do this once for YouTube, once for Gmail. A brand-new Google project may only be allowed to upload **private** videos until Google audits it — that is why this system defaults to `private`.
**C. Local AI (optional, free):** install Ollama (https://ollama.com) → `ollama pull qwen2.5:3b` → then in psql: `UPDATE models SET model='qwen2.5:3b' WHERE provider='ollama';` (a 7B model is very slow on an i5-8350U). Cloud free tiers: create `Gemini`/`Groq` credentials, then `UPDATE settings SET value='true' WHERE key='enable_cloud_models'; UPDATE models SET enabled=true WHERE provider IN ('gemini','groq');`

## Part 8 — Teach it your channels (data, not code)
Use psql (`psql -U postgres -d content_automation`). Examples to adapt:
```sql
-- a niche and a channel (manual approval, 2 posts/day max, YOUR posting windows in IST)
INSERT INTO niches(slug,name,keywords) VALUES ('funny','Funny','{funny fails,comedy skits}');
INSERT INTO channels(name,niche_id,platforms,autonomy_mode,posts_per_day,preferred_windows,clip_min_seconds,clip_max_seconds)
  SELECT 'Funny Shorts',id,'{youtube}','manual',2,'[{"start":"12:30"},{"start":"20:00"}]',15,60 FROM niches WHERE slug='funny';
-- the platform account (REQUIRED, otherwise nothing is scheduled). YouTube needs no external id.
INSERT INTO platform_accounts(channel_id,platform,credential_ref) SELECT id,'youtube','YouTube OAuth2' FROM channels WHERE name='Funny Shorts';
-- creators you are AUTHORIZED to use (discovery searches ONLY these; keep real evidence)
INSERT INTO authorized_creators(creator,platform,external_channel_id,permission_status,permission_evidence,permission_source_url,allowed_platforms,niche_slugs,verification_timestamp)
  VALUES ('Creator Name','youtube','UCxxxxxxxxxxxxxxxxxxxxxx','verified','Licence e-mail dated 2026-10-01','https://link-to-proof','{youtube}','{funny}',now());
-- official policy pages the system must read (https only). Without them every assessment becomes review_required.
UPDATE settings SET value='{"youtube":["https://support.google.com/youtube/answer/<paste the official policy page id you want>"]}' WHERE key='policy_source_urls';
-- publishing: YouTube is enabled; privacy defaults to PRIVATE. To go public per channel (only after you trust it):
UPDATE channels SET rules = rules || '{"youtube_privacy":"public"}' WHERE name='Funny Shorts';
```
Everything is a setting: see `docs/CONFIGURATION.md`. A new channel never needs a workflow edit.

## Part 9 — First real test (safe)
1. Keep the channel in **manual** mode and privacy **private**.
2. Start research: `psql … -c "SELECT ca_enqueue('trend_research',(SELECT id FROM channels WHERE name='Funny Shorts'),NULL,jsonb_build_object('channel_id',(SELECT id FROM channels WHERE name='Funny Shorts')),5,'first-run-1');"` (it also runs automatically every 6 hours).
3. Watch progress: `psql … -c "SELECT job_type,status,left(error_message,80) FROM jobs ORDER BY created_at DESC LIMIT 15;"`
4. When content is ready: `psql … -c "SELECT approval_id,status FROM approvals WHERE status='awaiting_approval';"` then approve/reject/edit with PowerShell (see `docs/API.md`):
```
Invoke-RestMethod -Method Post -Uri http://localhost:5678/webhook/ca-api-approval -Headers @{"X-CA-Key"="<CA_INTERNAL_KEY>"} -ContentType "application/json" -Body '{"approval_id":"<id>","action":"approve","by":"me"}'
```
5. The item appears in `schedules` at the next posting window and the system publishes it then (to YouTube **private**). Check your YouTube Studio.
6. If anything is blocked, `SELECT * FROM errors ORDER BY created_at DESC LIMIT 10;` and `docs/TROUBLESHOOTING.md`.

## Part 10 — Switching to automatic mode (only after Part 9 works)
`UPDATE channels SET autonomy_mode='automatic' WHERE name='Funny Shorts';` Automatic mode still STOPS for: unverified rights, policy review_required/blocked/stale, quality below threshold, technical-QA failure, an open channel-auth failure, duplicate protection, unverified platform adapters. Global kill switches: `UPDATE settings SET value='true' WHERE key='force_manual_approval';` (everything needs a human) and `... key='system_paused'` (nothing new starts).

## Part 11 — Keep it healthy on a small PC
* **Every day start order:** PostgreSQL → Docker/OpenShorts → QA worker → n8n (`n8n start` with the env from `deployment\deploy.js`, or just `node deployment\deploy.js update --start-n8n`).
* **Resource protection:** create a Windows *Task Scheduler* task (every 1 minute) running `powershell -File C:\ContentAutomation\workers\host_reporter.ps1` with environment variable `CA_INTERNAL_KEY` set — without it the system cannot see CPU/RAM/disk (it is *UNTESTED on Windows*). Defaults: one heavy video job at a time, pause below 8 GB free disk, above 85 % CPU/RAM.
* **Disk cleanup:** `workers\retention.ps1` (dry-run by default, edit its allow-list, add `-Apply` to delete; *untested on Windows*).
* **Backups:** `pg_dump -U postgres content_automation > backup.sql` regularly. Google Drive backup is **not implemented**.
* **Updating:** replace the project files with a newer package, run `deployment\update.ps1`. **Uninstall** is manual: `deployment\uninstall.ps1` prints the steps.

## Part 12 — If something is wrong
`docs/TROUBLESHOOTING.md` has symptom → cause → fix. Most common: forgetting `platform_accounts`, missing `policy_source_urls`, QA worker not running, `CA_INTERNAL_KEY` ≠ `QA_API_KEY`, or OpenShorts not reachable.

## Part 13 — Running the Offline Test Suite
To verify workflow integrity, SQL consolidation, and Code-node logic without running live services or incurring costs:
1. **Code-node logic tests (52 assertions)**:
   ```powershell
   node source/tools/test_code_nodes.js
   ```
2. **Workflow structural & syntax validation**:
   ```powershell
   py source/tools/validate.py
   ```
3. **Duplicate SQL function check**:
   ```powershell
   py source/tools/consolidate_sql.py --check
   ```
4. **Embedded SQL syntax validation**:
   ```powershell
   py source/tools/check_sql.py
   ```
5. **Deployment smoke test (requires running n8n)**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File deployment\verify.ps1
   ```

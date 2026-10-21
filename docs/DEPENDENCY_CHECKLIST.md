# System Dependency Checklist & Verification Guide

This document records the exact, verified dependency state on this Windows host (Intel Core i5-8350U, Windows 11 Pro 64-bit, 16 GB RAM).

## 1. Storage Partitions & Disk Safety Reserves

| Partition | Role | Total Size | Current Free Space | Minimum Operational Reserve | Status |
|---|---|:---:|:---:|:---:|:---:|
| **Drive C:** | Windows OS, Core Node Runtimes, Global CLI binaries | 165.31 GB | ~5.8–6.39 GB | **4.00 GB** | **SAFE** (Above reserve) |
| **Drive D:** | Portable Tooling (FFmpeg, PostgreSQL), Data, Media, QA Cache | 71.96 GB | 10.48 GB | **5.00 GB** | **SAFE** (Above reserve) |

---

## 2. Core Dependencies Status

| Component | Minimum Version | Target / Installed Location | Host Status | Verification Command | Notes |
|---|:---:|---|:---:|---|---|
| **Node.js** | `>= 24.0.0` | `%LOCALAPPDATA%\nvm\v24.18.0\node.exe` (or PATH) | **VERIFIED** (v24.18.0) | `node -v` (via wrapper) | Auto-selected by `setup.ps1`/`verify.ps1`. Subprocess inheritance verified. |
| **npm CLI** | `>= 10.0.0` | `%LOCALAPPDATA%\nvm\v24.18.0\node_modules\npm\bin\npm-cli.js` | **VERIFIED** (11.16.0) | `& $nodeCmd $npmCli -v` | Installed with Node 24. Prefix: `%APPDATA%\npm`. |
| **Python** | `>= 3.10` | System PATH | **VERIFIED** (Python 3.14 / 3.12) | `py --version` | Python 3.14.6 / 3.12.8 available. Used for offline validation tools. |
| **FFmpeg** | `>= 6.0` | `D:\tools\ffmpeg\bin\ffmpeg.exe` | **VERIFIED** (v9.0.2-essentials) | `D:\tools\ffmpeg\bin\ffmpeg.exe -version` | Extracted on Drive D: to preserve Drive C: space. Added to User PATH. |
| **FFprobe** | `>= 6.0` | `D:\tools\ffmpeg\bin\ffprobe.exe` | **VERIFIED** (v9.0.2-essentials) | `D:\tools\ffmpeg\bin\ffprobe.exe -version` | Extracted on Drive D:. Used by `workers/qa_worker.js`. |
| **n8n CLI** | `>= 1.80.0` | `%APPDATA%\npm\n8n.cmd` (or PATH) | **INSTALLING / IN PROGRESS** | `n8n --version` | Installed globally via Node 24 npm. Execution data mapped to `D:\n8n_data`. |
| **PostgreSQL** | `16.x` | `D:\tools\pgsql` / Data: `D:\pgsql\data` | **PENDING CONFIGURATION** | `psql --version` | Clean portable instance on Drive D:. Port 5432 is verified free. |
| **Ollama** | `>= 0.3.0` | `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` | **INSTALLED** (v0.31.2) | `ollama --version` | Base app installed. Model downloads **DEFERRED** in Mission 04. |
| **Docker** | N/A | N/A | **DEFERRED** | N/A | Prohibited in Mission 04 to prevent multi-GB disk exhaustion on C:. |
| **OpenShorts** | N/A | `D:\openshorts` | **DEFERRED** | N/A | Live video clipping deferred until base platform is deployed. |

---

## 3. Worker & Media Paths Configuration

To protect Drive C: from video processing temp bloat, configure the following in `config/.env`:

```env
# Drive D: storage partitioning (protects C: reserve)
QA_WORK_DIR=D:\qa_work
N8N_USER_FOLDER=D:\n8n_data
FFMPEG_CMD=D:\tools\ffmpeg\bin\ffmpeg.exe
FFPROBE_CMD=D:\tools\ffmpeg\bin\ffprobe.exe
PSQL_CMD=D:\tools\pgsql\bin\psql.exe
```

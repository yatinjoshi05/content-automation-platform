# Content Automation (n8n + PostgreSQL) — modular backend with one-command deployment
Start with **docs/SETUP.md** (step-by-step, Windows 11). Quick path: install Node 24, PostgreSQL, ffmpeg, n8n → `copy config\.env.example config\.env` and fill it → start OpenShorts and `node workers\qa_worker.js` → `powershell -ExecutionPolicy Bypass -File deployment\setup.ps1`.
Truth about status: **docs/FINAL_VALIDATION_REPORT.md** (what was really executed, what is mock-only, what needs your OAuth). Not "production ready": YouTube upload, Gmail, real OpenShorts and real LLMs have never been run by the author.
Docs: SETUP · ARCHITECTURE · CONFIGURATION · API · TROUBLESHOOTING · AUTONOMOUS_REPAIR_LOG.

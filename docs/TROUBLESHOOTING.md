# Troubleshooting (symptom → cause → fix)
| Symptom | Cause | Fix |
|---|---|---|
| setup says `node >= 24 FAIL` | old Node | install Node 24+, open a new PowerShell |
| `n8n CLI FAIL` | n8n not installed/PATH | `npm i -g n8n`, new PowerShell |
| `webhook rejects missing key` FAIL right after start | n8n still registering webhooks | re-run `deployment\verify.ps1` after 30 s |
| Jobs stay `queued`, heavy ones only | resource limit/open circuit | `SELECT * FROM resource_snapshots ORDER BY id DESC LIMIT 1;` / `SELECT * FROM integration_health;` free disk; `UPDATE integration_health SET state='closed',consecutive_failures=0 WHERE name='openshorts';` |
| Nothing scheduled after approval | no `platform_accounts` row / no `preferred_windows` / adapter off | check `notifications` ("Not scheduled: platform account problem" / "No publishing window") |
| Schedule `blocked` | final pre-publish gate | `SELECT last_error FROM schedules WHERE status='blocked';` (rights, policy review, stale policy, QA, auth…). Stale policy refreshes automatically; unresolved review → `ca-api-policy-review` |
| Schedule `failed` + "ambiguous publication" | crash/timeout during upload | open the platform, find out if the video exists, then `ca-api-publication-reconcile` (never retry blind) |
| Publishing fails with AUTH | OAuth credential missing/expired | reconnect `YouTube OAuth2` in n8n, `UPDATE integration_health SET state='closed',consecutive_failures=0 WHERE name LIKE 'auth\_%';` |
| Clipping job `waiting` for hours | OpenShorts webhook lost | supervisor recovers after 4× `stuck_job_minutes`; check `n8n_webhook_base` is reachable from OpenShorts and secrets match |
| Visual QA job fails/retries | QA worker down or key mismatch | start `workers\qa_worker.js`; `QA_API_KEY` must equal `CA_INTERNAL_KEY`; `QA_ALLOWED_HOSTS` must contain the OpenShorts host:port |
| Every policy assessment is `review_required` | `policy_source_urls` empty | set official https URLs (see CONFIGURATION) |
| `dead_letter` jobs | retries exhausted | read `jobs.error_message`, fix, then `UPDATE jobs SET status='queued',attempt=0,next_retry_at=NULL WHERE job_id='…';` |
| Pause everything | — | `UPDATE settings SET value='true' WHERE key='system_paused';` |

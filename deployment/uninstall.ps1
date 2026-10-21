# Uninstall is intentionally MANUAL (destructive). This prints what to remove. Nothing is deleted automatically.
node "$PSScriptRoot\deploy.js" uninstall
Write-Host "1) n8n UI: deactivate + delete workflows named 'CA 01 ... CA 15'. 2) n8n UI: delete credentials 'CA Postgres', 'CA Internal Key'. 3) DROP DATABASE content_automation (psql). 4) Stop workers\qa_worker.js."

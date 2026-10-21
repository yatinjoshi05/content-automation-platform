# API (webhooks served by n8n) — all POST JSON, header `X-CA-Key: <CA_INTERNAL_KEY>`
Missing/wrong key → **403** (n8n). Invalid input → **400** `{"ok":false,"error":"VALIDATION","message":"…"}`. Domain conflicts → **404 NOT_FOUND / 409 CONFLICT / 422 UNPROCESSABLE**. Internal faults → **500** `{"ok":false,"error":"INTERNAL","message":"internal error; see error log"}` (no stack traces/secrets). Success → **200** `{"ok":true,…}`.
| Path | Body | Purpose |
|---|---|---|
| `/webhook/ca-api-approval` | `{approval_id, action: approve\|reject\|edit\|regenerate, version?, by?, comments?, per_platform?}` | human approval; `approve` of a stale version → 409; repeated reject is a no-op; edit creates a new version and blocks scheduled items until re-approved |
| `/webhook/ca-api-policy-review` | `{source_id, decision: approved\|rejected\|changes_requested, reviewer, reason, platform?, content_id?, content_version?, evidence?}` | human policy review; a `blocked` assessment can never be approved (409) |
| `/webhook/ca-api-reschedule` | `{content_id, platform, scheduled_at (ISO-8601 with offset)}` | move a future publication (min-gap and past-time checked) |
| `/webhook/ca-api-source-review` | `{source_id, action: verify\|reject, evidence, evidence_url?, allowed_platforms?, …}` | resolve rights for a source (evidence mandatory) |
| `/webhook/ca-api-publication-reconcile` | `{publication_id, outcome: published\|not_published, reason, post_id? (required for published), by?}` | resolve an AMBIGUOUS publication after checking the platform; the ONLY way to retry or confirm it |
| `/webhook/ca-api-earning` | `{platform, currency (ISO), gross_amount, confirmation: estimated\|confirmed, period_start?, period_end?, channel_id?, content_id?, usd_amount?, program?, rpm?, payout_status?}` | record earnings manually (no automatic revenue retrieval exists) |
| `/webhook/ca-w-resource` | `{cpu_percent, ram_percent, disk_free_gb}` | resource snapshot from `workers/host_reporter.ps1` |
| `/webhook/ca-openshorts-done` | OpenShorts completion payload + `X-OpenShorts-Signature: sha256=HMAC` | called by OpenShorts only; bad signature → ignored + audited |
Internal worker hooks `ca-w-*` are called only by the master dispatcher.
**Read APIs for a future frontend:** none exist as webhooks; the frontend should read PostgreSQL through a small backend (tables `channels, content, content_versions, approvals, schedules, publications, policy_assessments, policy_reviews, analytics_snapshots, earnings, jobs, errors, events, audit_logs, integration_health, notifications, settings`). That read layer is NOT built.

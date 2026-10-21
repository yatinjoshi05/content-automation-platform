`schema.sql` is the idempotent baseline (safe to re-run). Put future incremental changes here as `NNN_description.sql`; deploy.js applies each once, in order, and records it in `schema_migrations`.

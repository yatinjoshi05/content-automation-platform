-- Content Automation System — PostgreSQL schema (PostgreSQL 14+)
-- Idempotent: safe to re-run. AI decides / code verifies / DB remembers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION ca_touch() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

-- ---------- config ----------
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY, value jsonb NOT NULL, description text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE, display_name text,
  role text NOT NULL DEFAULT 'owner', status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS niches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Channel + niche + platforms + schedule + content rules = ONE configurable row. No channel logic in workflows.
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, niche_id uuid REFERENCES niches(id),
  platforms text[] NOT NULL DEFAULT '{youtube}',
  autonomy_mode text NOT NULL DEFAULT 'manual' CHECK (autonomy_mode IN ('manual','automatic')),
  rights_required boolean NOT NULL DEFAULT true,
  monetization_review_required boolean NOT NULL DEFAULT true,
  clip_engine text NOT NULL DEFAULT 'openshorts',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  posts_per_day int,                       -- NULL = AI/analytics recommended
  preferred_windows jsonb NOT NULL DEFAULT '[]', -- [{"start":"HH:MM","end":"HH:MM"}] configurable, never hard-coded
  min_gap_minutes int NOT NULL DEFAULT 120,
  clip_min_seconds int NOT NULL DEFAULT 15, clip_max_seconds int NOT NULL DEFAULT 60,
  quality_threshold numeric NOT NULL DEFAULT 0.70,
  rules jsonb NOT NULL DEFAULT '{}',       -- content rules: banned_phrases, max_hashtags, ...
  status text NOT NULL DEFAULT 'active', version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS platform_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  platform text NOT NULL, external_account_id text,        -- e.g. IG user id / FB page id (NOT a secret)
  credential_ref text,                                      -- NAME of the n8n credential; never a secret
  enabled boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, platform));

-- ---------- trends / sources / rights ----------
CREATE TABLE IF NOT EXISTS trends (
  trend_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), niche text, topic text NOT NULL, source text,
  trend_score numeric, confidence numeric, evidence jsonb NOT NULL DEFAULT '[]',
  detected_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
  recommended_channel text, recommended_content_format text, recommended_posting_frequency text,
  recommended_posting_windows jsonb, channel_id uuid REFERENCES channels(id),
  new_channel_opportunity boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Creators the user is authorized to use (rights registry). Discovery searches ONLY these when rights_required.
CREATE TABLE IF NOT EXISTS authorized_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator text NOT NULL, platform text NOT NULL DEFAULT 'youtube',
  external_channel_id text NOT NULL, permission_status text NOT NULL DEFAULT 'pending'
    CHECK (permission_status IN ('verified','pending','rejected','expired','needs_human_review')),
  permission_evidence text, permission_source_url text, allowed_platforms text[] NOT NULL DEFAULT '{}',
  allowed_usage text, commercial_use_allowed boolean, monetization_allowed boolean,
  attribution_required boolean NOT NULL DEFAULT false, attribution_text text, expiration_date date, notes text,
  niche_slugs text[] NOT NULL DEFAULT '{}', verification_timestamp timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_channel_id));

CREATE TABLE IF NOT EXISTS sources (
  source_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id text NOT NULL UNIQUE,          -- e.g. youtube:<videoId>  (deterministic dedup key)
  normalized_url text NOT NULL, source_platform text NOT NULL, platform_video_id text,
  creator text, authorized_creator_id uuid REFERENCES authorized_creators(id),
  title text, duration_seconds int, relevance_score numeric, content_hash text,
  trend_id uuid REFERENCES trends(trend_id), channel_id uuid REFERENCES channels(id),
  status text NOT NULL DEFAULT 'discovered', metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sources_hash_idx ON sources(content_hash) WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS permissions (       -- per-source rights snapshot
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES sources(source_id),
  creator text, source_url text, source_platform text,
  permission_status text NOT NULL CHECK (permission_status IN ('verified','pending','rejected','expired','needs_human_review')),
  permission_evidence text, permission_source_url text, allowed_platforms text[] NOT NULL DEFAULT '{}',
  allowed_usage text, commercial_use_allowed boolean, monetization_allowed boolean,
  attribution_required boolean, attribution_text text, expiration_date date, notes text,
  verification_timestamp timestamptz, status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS policy_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid REFERENCES sources(source_id),
  content_id uuid, platform text NOT NULL, rights_status text,
  monetization_status text CHECK (monetization_status IN ('pass','conditional','review_required','blocked')),
  policy_risk text CHECK (policy_risk IN ('low','medium','high','unknown')),
  reasons jsonb NOT NULL DEFAULT '[]', required_actions jsonb NOT NULL DEFAULT '[]', evidence jsonb NOT NULL DEFAULT '[]',
  checked_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS policy_knowledge (   -- cached, dated platform-policy summaries (refreshed periodically)
  platform text PRIMARY KEY, summary jsonb NOT NULL DEFAULT '{}', source_urls text[] NOT NULL DEFAULT '{}',
  fetched_at timestamptz, expires_at timestamptz, status text NOT NULL DEFAULT 'stale',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- ---------- content ----------
CREATE TABLE IF NOT EXISTS clip_engines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, kind text NOT NULL,
  base_url text, enabled boolean NOT NULL DEFAULT true, config jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS content (
  content_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES sources(source_id),
  channel_id uuid NOT NULL REFERENCES channels(id), correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  current_version int NOT NULL DEFAULT 0, approved_version int,        -- publishing always uses approved_version
  status text NOT NULL DEFAULT 'created', version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS clips (
  clip_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid REFERENCES content(content_id),
  source_id uuid NOT NULL REFERENCES sources(source_id), channel_id uuid REFERENCES channels(id),
  clip_engine text NOT NULL, clip_engine_job_id text, clip_index int,
  start_time numeric, end_time numeric, duration numeric, hook text, title text, topic text,
  quality_score numeric, video_url text, video_path text, thumbnail_url text, thumbnail_path text,
  caption text, description text, hashtags text[], fingerprint text NOT NULL UNIQUE,   -- dedup key
  status text NOT NULL DEFAULT 'created', metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES content(content_id),
  version int NOT NULL, clip_id uuid REFERENCES clips(clip_id),
  per_platform jsonb NOT NULL DEFAULT '{}',   -- {"youtube":{"title","description","hashtags"},"instagram":{...}}
  thumbnail_url text, hook_text text, qa jsonb NOT NULL DEFAULT '{}', quality_score numeric,
  created_by text NOT NULL DEFAULT 'ai', status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, version));

CREATE TABLE IF NOT EXISTS approvals (
  approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES content(content_id),
  kind text NOT NULL DEFAULT 'content' CHECK (kind IN ('content','rights_review','policy_review')),
  requested_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, approved_by text,
  decision text, comments text, version int NOT NULL, metadata_snapshot jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'awaiting_approval'
    CHECK (status IN ('awaiting_approval','approved','rejected','needs_edit','scheduled','published','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_open ON approvals(content_id, kind) WHERE status='awaiting_approval';

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES content(content_id),
  channel_id uuid NOT NULL REFERENCES channels(id), platform text NOT NULL,
  scheduled_at timestamptz NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','publishing','published','failed','cancelled','blocked')),
  publication_attempts int NOT NULL DEFAULT 0, last_error text, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, platform),                       -- no duplicate scheduling
  UNIQUE (channel_id, platform, scheduled_at));        -- no slot conflicts

CREATE TABLE IF NOT EXISTS publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_id uuid REFERENCES schedules(schedule_id),
  content_id uuid NOT NULL, channel_id uuid NOT NULL, platform text NOT NULL, version int NOT NULL,
  idempotency_key text NOT NULL UNIQUE,                -- content_id:platform:channel_id
  platform_post_id text, platform_container_id text, payload_hash text,
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','processing','published','failed','unsupported')),
  error text, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- ---------- state machine ----------
CREATE TABLE IF NOT EXISTS job_type_config (   -- allowlist of job types → worker webhook path
  job_type text PRIMARY KEY, worker_type text NOT NULL, webhook_path text NOT NULL,
  heavy boolean NOT NULL DEFAULT false, integration text, enabled boolean NOT NULL DEFAULT true,
  max_attempts int NOT NULL DEFAULT 5);

CREATE TABLE IF NOT EXISTS jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_type text NOT NULL REFERENCES job_type_config(job_type),
  entity_id uuid, correlation_id uuid NOT NULL DEFAULT gen_random_uuid(), worker_type text,
  idempotency_key text UNIQUE, payload jsonb NOT NULL DEFAULT '{}', result jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('created','queued','running','waiting','completed','failed','retrying','blocked','cancelled','dead_letter')),
  attempt int NOT NULL DEFAULT 0, max_attempts int NOT NULL DEFAULT 5, priority int NOT NULL DEFAULT 5,
  started_at timestamptz, finished_at timestamptz, error_code text, error_message text, next_retry_at timestamptz,
  external_job_id text, recovery_level int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS jobs_ext_idx ON jobs(external_job_id);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid REFERENCES jobs(job_id) ON DELETE CASCADE,
  name text NOT NULL, status text NOT NULL DEFAULT 'created', result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS agents (         -- worker pools (bounded, predefined)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_type text UNIQUE NOT NULL, max_concurrency int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'healthy', last_heartbeat timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS integration_health (   -- circuit breakers (providers + integrations)
  name text PRIMARY KEY, kind text NOT NULL DEFAULT 'integration',
  state text NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','open','half_open')),
  consecutive_failures int NOT NULL DEFAULT 0, failure_threshold int NOT NULL DEFAULT 5,
  cooldown_seconds int NOT NULL DEFAULT 600, opened_at timestamptz, last_success_at timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS resource_snapshots (
  id bigserial PRIMARY KEY, captured_at timestamptz NOT NULL DEFAULT now(),
  cpu_percent numeric, ram_percent numeric, disk_free_gb numeric, source text NOT NULL DEFAULT 'host-reporter');

-- ---------- models ----------
CREATE TABLE IF NOT EXISTS models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, kind text NOT NULL,  -- kind: ollama|gemini|openai_compat
  model text NOT NULL, base_url text, capabilities text[] NOT NULL DEFAULT '{text}',
  quality_tier int NOT NULL DEFAULT 1, priority int NOT NULL DEFAULT 10, is_local boolean NOT NULL DEFAULT false,
  cost_per_1k numeric NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (provider, model));
CREATE TABLE IF NOT EXISTS model_quotas (
  provider text NOT NULL, day date NOT NULL DEFAULT current_date, used int NOT NULL DEFAULT 0, daily_limit int,
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, day));

-- ---------- analytics / money ----------
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_id uuid REFERENCES publications(id), channel_id uuid, platform text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(), raw jsonb NOT NULL DEFAULT '{}',        -- raw API response
  views bigint, likes bigint, comments bigint, shares bigint, watch_time_seconds numeric, avg_view_duration_seconds numeric,
  retention numeric, impressions bigint, subscribers_delta bigint, metrics_available text[] NOT NULL DEFAULT '{}',  -- never invent metrics
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform text NOT NULL, channel_id uuid, content_id uuid,
  period_start date, period_end date, gross_amount numeric, currency text, usd_amount numeric, program text, rpm numeric,
  confirmation text NOT NULL DEFAULT 'estimated' CHECK (confirmation IN ('estimated','confirmed')),
  payout_status text, recorded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text NOT NULL, provider text, amount numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'INR',
  entity_id uuid, incurred_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, hypothesis text, variants jsonb NOT NULL DEFAULT '{}', result jsonb,
  status text NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- ---------- observability ----------
CREATE TABLE IF NOT EXISTS events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL, entity_id uuid, source text,
  payload jsonb NOT NULL DEFAULT '{}', correlation_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS events_corr_idx ON events(correlation_id, created_at);
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY, ts timestamptz NOT NULL DEFAULT now(), actor_type text NOT NULL, actor_id text, action text NOT NULL,
  entity_type text, entity_id uuid, old_state text, new_state text, metadata jsonb NOT NULL DEFAULT '{}', correlation_id uuid);
CREATE TABLE IF NOT EXISTS errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text NOT NULL
    CHECK (category IN ('TRANSIENT','RATE_LIMIT','AUTH','POLICY','RIGHTS','VALIDATION','RESOURCE','PROVIDER','UNKNOWN')),
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warning','error','critical')),
  retryable boolean NOT NULL DEFAULT false, workflow text, node text, job_id uuid, entity_id uuid,
  message text, details jsonb NOT NULL DEFAULT '{}', correlation_id uuid, status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), level text NOT NULL CHECK (level IN ('CRITICAL','IMPORTANT','INFO')),
  category text, subject text NOT NULL, body text, dedup_key text, entity_id uuid, correlation_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS notif_dedup ON notifications(dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('pending','sent');

DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='updated_at' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_touch_'||t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION ca_touch()', 'trg_touch_'||t, t);
  END LOOP; END $$;

-- ================= functions (deterministic logic lives in the DB) =================
CREATE OR REPLACE FUNCTION ca_setting(k text, d jsonb) RETURNS jsonb AS $$
  SELECT COALESCE((SELECT value FROM settings WHERE key=k), d) $$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION ca_emit(p_type text, p_entity uuid, p_corr uuid, p_payload jsonb, p_source text DEFAULT 'n8n')
RETURNS uuid AS $$ INSERT INTO events(event_type,entity_id,correlation_id,payload,source) VALUES (p_type,p_entity,p_corr,COALESCE(p_payload,'{}'),p_source) RETURNING event_id $$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION ca_audit(p_actor_type text, p_actor text, p_action text, p_etype text, p_eid uuid, p_old text, p_new text, p_meta jsonb, p_corr uuid DEFAULT NULL)
RETURNS void AS $$ INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,old_state,new_state,metadata,correlation_id)
  VALUES (p_actor_type,p_actor,p_action,p_etype,p_eid,p_old,p_new,COALESCE(p_meta,'{}'),p_corr) $$ LANGUAGE sql;

-- Idempotent enqueue: same key => returns the existing job, never a duplicate.
CREATE OR REPLACE FUNCTION ca_enqueue(p_type text, p_entity uuid, p_corr uuid, p_payload jsonb, p_priority int, p_key text)
RETURNS jobs AS $$
DECLARE j jobs; c job_type_config;
BEGIN
  SELECT * INTO c FROM job_type_config WHERE job_type=p_type AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'job type % is not in the allowlist', p_type; END IF;
  INSERT INTO jobs(job_type,entity_id,correlation_id,worker_type,payload,priority,idempotency_key,max_attempts)
  VALUES (p_type,p_entity,COALESCE(p_corr,gen_random_uuid()),c.worker_type,COALESCE(p_payload,'{}'),COALESCE(p_priority,5),p_key,c.max_attempts)
  ON CONFLICT (idempotency_key) DO NOTHING RETURNING * INTO j;
  IF j.job_id IS NULL THEN SELECT * INTO j FROM jobs WHERE idempotency_key=p_key; END IF;
  RETURN j;
END $$ LANGUAGE plpgsql;

-- Circuit breaker
CREATE OR REPLACE FUNCTION ca_circuit_allowed(p_name text) RETURNS boolean AS $$
DECLARE h integration_health;
BEGIN
  SELECT * INTO h FROM integration_health WHERE name=p_name;
  IF NOT FOUND OR h.state='closed' THEN RETURN true; END IF;
  IF h.state='open' AND now() >= h.opened_at + make_interval(secs => h.cooldown_seconds) THEN
    UPDATE integration_health SET state='half_open' WHERE name=p_name; RETURN true;  -- allow one trial
  END IF;
  RETURN h.state='half_open';
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ca_circuit_record(p_name text, p_ok boolean, p_err text DEFAULT NULL) RETURNS text AS $$
DECLARE h integration_health;
BEGIN
  INSERT INTO integration_health(name) VALUES (p_name) ON CONFLICT DO NOTHING;
  IF p_ok THEN
    UPDATE integration_health SET state='closed', consecutive_failures=0, last_success_at=now() WHERE name=p_name;
    RETURN 'closed';
  END IF;
  UPDATE integration_health SET consecutive_failures=consecutive_failures+1, last_error=left(p_err,500),
    state=CASE WHEN state='half_open' OR consecutive_failures+1>=failure_threshold THEN 'open' ELSE state END,
    opened_at=CASE WHEN state='half_open' OR consecutive_failures+1>=failure_threshold THEN now() ELSE opened_at END
  WHERE name=p_name RETURNING * INTO h;
  IF h.state='open' THEN PERFORM ca_emit('quota.warning', NULL, NULL, jsonb_build_object('circuit_open',p_name,'error',left(p_err,300)),'circuit_breaker'); END IF;
  RETURN h.state;
END $$ LANGUAGE plpgsql;

-- Bounded recovery ladder (levels 1..6). Never infinite: attempt >= max_attempts => dead_letter (level 6 => human).
CREATE OR REPLACE FUNCTION ca_job_fail(p_job uuid, p_category text, p_message text) RETURNS jobs AS $$
DECLARE j jobs; retryable boolean; lvl int; delay_s int; cfg job_type_config;
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO cfg FROM job_type_config WHERE job_type=j.job_type;
  retryable := p_category IN ('TRANSIENT','RATE_LIMIT','PROVIDER','RESOURCE','UNKNOWN');
  IF cfg.integration IS NOT NULL THEN PERFORM ca_circuit_record(cfg.integration,false,p_message); END IF;
  INSERT INTO errors(category,severity,retryable,workflow,job_id,entity_id,message,correlation_id)
  VALUES (p_category, CASE WHEN p_category IN ('AUTH','POLICY','RIGHTS') THEN 'critical' WHEN retryable THEN 'warning' ELSE 'error' END,
          retryable, j.job_type, j.job_id, j.entity_id, left(p_message,1000), j.correlation_id);
  IF NOT retryable THEN
    UPDATE jobs SET status='blocked', error_code=p_category, error_message=left(p_message,1000), finished_at=now(), recovery_level=6 WHERE job_id=p_job RETURNING * INTO j;
    PERFORM ca_emit('worker.failed', j.entity_id, j.correlation_id, jsonb_build_object('job_id',j.job_id,'category',p_category,'action','blocked_needs_human'));
    RETURN j;
  END IF;
  IF j.attempt >= j.max_attempts THEN
    UPDATE jobs SET status='dead_letter', error_code=p_category, error_message=left(p_message,1000), finished_at=now(), recovery_level=6 WHERE job_id=p_job RETURNING * INTO j;
    PERFORM ca_emit('worker.failed', j.entity_id, j.correlation_id, jsonb_build_object('job_id',j.job_id,'category',p_category,'action','dead_letter'));
    RETURN j;
  END IF;
  lvl := CASE WHEN j.attempt<=1 THEN 1 WHEN j.attempt<=3 THEN 2 WHEN j.attempt=4 THEN 3 ELSE 4 END;
  delay_s := CASE WHEN lvl=1 THEN 30 ELSE LEAST((2 ^ j.attempt)::int * 30, 3600) END;   -- exponential backoff, capped 1h
  UPDATE jobs SET status='retrying', error_code=p_category, error_message=left(p_message,1000), recovery_level=lvl,
    next_retry_at=now()+make_interval(secs=>delay_s), payload=payload||jsonb_build_object('use_fallback_provider', lvl>=3) WHERE job_id=p_job RETURNING * INTO j;
  RETURN j;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ca_job_done(p_job uuid, p_result jsonb) RETURNS jobs AS $$
DECLARE j jobs; cfg job_type_config;
BEGIN
  UPDATE jobs SET status='completed', result=p_result, finished_at=now(), error_code=NULL, error_message=NULL WHERE job_id=p_job RETURNING * INTO j;
  SELECT * INTO cfg FROM job_type_config WHERE job_type=j.job_type;
  IF cfg.integration IS NOT NULL THEN PERFORM ca_circuit_record(cfg.integration,true); END IF;
  RETURN j;
END $$ LANGUAGE plpgsql;

-- Master claim: one job per tick, honouring concurrency, resource stress, circuit breakers.
CREATE OR REPLACE FUNCTION ca_claim_job() RETURNS SETOF jobs AS $$
DECLARE
  max_video int := (ca_setting('max_concurrent_video_jobs','1'))#>>'{}';
  max_light int := (ca_setting('max_concurrent_light_jobs','3'))#>>'{}';
  min_disk numeric := (ca_setting('min_free_disk_gb','8'))#>>'{}';
  max_cpu numeric := (ca_setting('max_cpu_load','85'))#>>'{}';
  max_ram numeric := (ca_setting('max_ram_usage','85'))#>>'{}';
  r resource_snapshots; stressed boolean := false; heavy_run int; light_run int; picked uuid;
BEGIN
  IF (ca_setting('system_paused','false'))#>>'{}' = 'true' THEN RETURN; END IF;
  SELECT * INTO r FROM resource_snapshots ORDER BY id DESC LIMIT 1;
  IF NOT FOUND OR r.captured_at <= now() - interval '15 minutes' THEN
    -- Missing or stale telemetry: fail-closed for heavy video jobs
    stressed := true;
  ELSIF (r.disk_free_gb IS NULL OR r.disk_free_gb < min_disk)
     OR (r.cpu_percent IS NOT NULL AND r.cpu_percent > max_cpu)
     OR (r.ram_percent IS NOT NULL AND r.ram_percent > max_ram) THEN
    stressed := true;
  ELSE
    stressed := false;
  END IF;
  SELECT count(*) FILTER (WHERE c.heavy), count(*) FILTER (WHERE NOT c.heavy) INTO heavy_run, light_run
    FROM jobs j JOIN job_type_config c USING (job_type) WHERE j.status='running';
  SELECT j.job_id INTO picked FROM jobs j JOIN job_type_config c USING (job_type)
   WHERE j.status IN ('queued','retrying') AND (j.next_retry_at IS NULL OR j.next_retry_at<=now()) AND c.enabled
     AND (c.integration IS NULL OR ca_circuit_allowed(c.integration))
     AND ((c.heavy AND NOT stressed AND heavy_run<max_video) OR (NOT c.heavy AND light_run<max_light))
   ORDER BY j.priority DESC, j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1;
  IF picked IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE jobs SET status='running', started_at=now(), attempt=attempt+1 WHERE job_id=picked RETURNING *;
END $$ LANGUAGE plpgsql;

-- Stuck-job recovery for supervisor: running > N minutes without finishing => retry ladder.

-- ================= domain gates (deterministic) =================
-- Rights gate. Returns decision + reasons. Unresolved rights NEVER pass when channel.rights_required.
CREATE OR REPLACE FUNCTION ca_rights_gate(p_source uuid, p_channel uuid) RETURNS jsonb AS $$
DECLARE p permissions; ch channels; reasons jsonb := '[]'; decision text;
BEGIN
  SELECT * INTO ch FROM channels WHERE id=p_channel;
  SELECT * INTO p FROM permissions WHERE source_id=p_source AND status='active' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('decision', CASE WHEN ch.rights_required THEN 'blocked' ELSE 'verified' END,'reasons',jsonb_build_array('no permission record'));
  END IF;
  IF p.expiration_date IS NOT NULL AND p.expiration_date < current_date THEN
    RETURN jsonb_build_object('decision','blocked','reasons',jsonb_build_array('permission expired'),'status','expired'); END IF;
  IF p.permission_status='rejected' THEN RETURN jsonb_build_object('decision','blocked','reasons',jsonb_build_array('permission rejected'),'status','rejected'); END IF;
  IF p.permission_status IN ('pending','needs_human_review') THEN
    RETURN jsonb_build_object('decision', CASE WHEN ch.rights_required THEN 'human_review' ELSE 'verified' END,'reasons',jsonb_build_array('permission '||p.permission_status),'status',p.permission_status); END IF;
  IF p.permission_status='expired' THEN RETURN jsonb_build_object('decision','blocked','reasons',jsonb_build_array('permission expired'),'status','expired'); END IF;
  -- verified: check platform coverage
  IF cardinality(p.allowed_platforms)>0 AND NOT (ch.platforms <@ p.allowed_platforms) THEN
    reasons := reasons || to_jsonb('channel platforms not all covered by allowed_platforms'::text); decision := 'human_review'; END IF;
  IF p.permission_evidence IS NULL OR length(trim(p.permission_evidence))=0 THEN
    reasons := reasons || to_jsonb('verified permission has no evidence recorded'::text); decision := 'human_review'; END IF;
  RETURN jsonb_build_object('decision', COALESCE(decision,'verified'), 'reasons', reasons, 'status','verified',
    'attribution_required', p.attribution_required, 'attribution_text', p.attribution_text,
    'monetization_allowed', p.monetization_allowed, 'commercial_use_allowed', p.commercial_use_allowed);
END $$ LANGUAGE plpgsql;

-- Autonomy gate: may this content skip manual approval? Hard stops always win.

-- Slot picker: configurable windows, gap, per-day cap, conflict-free. Returns NULL if no window is configured.
CREATE OR REPLACE FUNCTION ca_pick_slot(p_channel uuid, p_platform text, p_after timestamptz DEFAULT now())
RETURNS timestamptz AS $$
DECLARE ch channels; d date; w jsonb; cand timestamptz; day_start timestamptz; per_day int; taken int; i int := 0; wi int;
BEGIN
  SELECT * INTO ch FROM channels WHERE id=p_channel;
  per_day := COALESCE(ch.posts_per_day, ((ca_setting('default_posts_per_day','2'))#>>'{}')::int);
  IF jsonb_array_length(ch.preferred_windows)=0 THEN RETURN NULL; END IF;   -- AI/analytics windows must be materialised into preferred_windows
  d := (p_after AT TIME ZONE ch.timezone)::date;
  WHILE i < 60 LOOP
    SELECT count(*) INTO taken FROM schedules WHERE channel_id=p_channel AND platform=p_platform AND status IN ('scheduled','publishing','published')
       AND (scheduled_at AT TIME ZONE ch.timezone)::date = d;
    IF taken < per_day THEN
      FOR wi IN 0..jsonb_array_length(ch.preferred_windows)-1 LOOP
        w := ch.preferred_windows->wi;
        cand := ((d::text||' '||(w->>'start'))::timestamp) AT TIME ZONE ch.timezone;
        IF cand > p_after AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.channel_id=p_channel AND s.platform=p_platform
             AND s.status IN ('scheduled','publishing','published')
             AND abs(extract(epoch FROM (s.scheduled_at-cand)))/60 < ch.min_gap_minutes) THEN
          RETURN cand;
        END IF;
      END LOOP;
    END IF;
    d := d+1; i := i+1;
  END LOOP;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

-- Edit a content item: new version, invalidates approval + scheduled payload; publishing uses approved_version only.
CREATE OR REPLACE FUNCTION ca_edit_content(p_content uuid, p_per_platform jsonb, p_by text) RETURNS int AS $$
DECLARE nv int; prev content_versions;
BEGIN
  UPDATE content SET current_version=current_version+1 WHERE content_id=p_content RETURNING current_version INTO nv;
  SELECT * INTO prev FROM content_versions WHERE content_id=p_content ORDER BY version DESC LIMIT 1;
  INSERT INTO content_versions(content_id,version,clip_id,per_platform,thumbnail_url,hook_text,qa,quality_score,created_by,status)
  VALUES (p_content,nv,prev.clip_id,COALESCE(p_per_platform,prev.per_platform),prev.thumbnail_url,prev.hook_text,prev.qa,prev.quality_score,p_by,'draft');
  UPDATE content SET approved_version=NULL, status='needs_approval' WHERE content_id=p_content;  -- old approval no longer valid
  UPDATE schedules SET status='blocked', last_error='content edited; awaiting re-approval' WHERE content_id=p_content AND status='scheduled';
  PERFORM ca_emit('content.created', p_content, NULL, jsonb_build_object('version',nv,'by',p_by));
  RETURN nv;
END $$ LANGUAGE plpgsql;

-- Approve a specific version (rejects stale versions). Re-arms blocked schedules for the newly approved version.
CREATE OR REPLACE FUNCTION ca_approve(p_approval uuid, p_by text, p_version int) RETURNS jsonb AS $$
DECLARE a approvals; c content;
BEGIN
  SELECT * INTO a FROM approvals WHERE approval_id=p_approval FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  SELECT * INTO c FROM content WHERE content_id=a.content_id FOR UPDATE;
  IF p_version <> c.current_version THEN RETURN jsonb_build_object('ok',false,'error','stale_version','current_version',c.current_version); END IF;
  IF a.status NOT IN ('awaiting_approval','needs_edit') THEN RETURN jsonb_build_object('ok',false,'error','not_awaiting','status',a.status); END IF;
  UPDATE approvals SET status='approved', decision='approve', approved_by=p_by, approved_at=now(), version=p_version WHERE approval_id=p_approval;
  UPDATE content SET approved_version=p_version, status='approved' WHERE content_id=c.content_id;
  UPDATE content_versions SET status='approved' WHERE content_id=c.content_id AND version=p_version;
  UPDATE schedules SET status='scheduled', last_error=NULL WHERE content_id=c.content_id AND status='blocked' AND published_at IS NULL;
  PERFORM ca_emit('approval.approved', c.content_id, c.correlation_id, jsonb_build_object('by',p_by,'version',p_version));
  PERFORM ca_audit('user',p_by,'approve','content',c.content_id,'awaiting_approval','approved',jsonb_build_object('version',p_version),c.correlation_id);
  RETURN jsonb_build_object('ok',true,'content_id',c.content_id,'version',p_version);
END $$ LANGUAGE plpgsql;

-- Publish guard: blocks duplicates + unapproved/stale content. Returns the publication row or ok=false.

-- ================= seed =================
INSERT INTO job_type_config(job_type,worker_type,webhook_path,heavy,integration,max_attempts) VALUES
 ('trend_research','trend_research','ca-w-trend-research',false,NULL,3),
 ('source_discovery','source_discovery','ca-w-source-discovery',false,'youtube_api',4),
 ('rights_verification','rights_verification','ca-w-rights',false,NULL,3),
 ('monetization_policy','monetization_policy','ca-w-policy',false,NULL,4),
 ('clipping','clipping','ca-w-clipping',true,'openshorts',5),
 ('content_packaging','metadata_generation','ca-w-packaging',false,NULL,4),
 ('approval_request','quality_assurance','ca-w-approval-request',false,NULL,3),
 ('scheduling','scheduling','ca-w-scheduling',false,NULL,3),
 ('analytics_collect','analytics','ca-w-analytics',false,NULL,3),
 ('notification','notification','ca-w-notify',false,'gmail',4)
ON CONFLICT (job_type) DO NOTHING;

INSERT INTO settings(key,value,description) VALUES
 ('timezone','"Asia/Kolkata"','default timezone'),
 ('max_concurrent_video_jobs','1','heavy jobs at once (conservative for i5-8350U/16GB)'),
 ('max_concurrent_light_jobs','3','light jobs at once'),
 ('max_cpu_load','85','pause heavy jobs above this CPU %'),
 ('max_ram_usage','85','pause heavy jobs above this RAM %'),
 ('min_free_disk_gb','8','pause heavy jobs below this free disk'),
 ('system_paused','false','global pause'),
 ('force_manual_approval','false','global override: require human approval everywhere'),
 ('default_posts_per_day','2','used only when channel.posts_per_day is NULL'),
 ('n8n_webhook_base','"http://localhost:5678"','base URL n8n uses to call its own webhooks'),
 ('openshorts_base_url','"http://localhost:8000"','self-hosted OpenShorts backend'),
 ('public_media_base_url','""','publicly reachable base URL for clip files (needed by Instagram Reels); empty = IG adapter stops cleanly'),
 ('meta_graph_version','"v21.0"','Graph API version — verify current version before enabling'),
 ('notify_email','""','recipient for Gmail notifications'),
 ('max_hashtags','5','metadata validation'),
 ('policy_source_urls','{}','{"youtube":["https://..."],...} official policy pages to research; empty = policy stage returns review_required'),
 ('policy_refresh_days','14','stale policy knowledge threshold'),
 ('retention_source_days','2','delete raw source files after N days'),
 ('retention_clip_days','30','delete published clips after N days'),
 ('stuck_job_minutes','90','supervisor recovers running jobs older than this'),
 ('unsupported_platform_action','"stop_and_notify"','what publishing does when an adapter op is unsupported')
ON CONFLICT (key) DO NOTHING;

INSERT INTO clip_engines(name,kind,base_url) VALUES ('openshorts','openshorts','http://localhost:8000') ON CONFLICT (name) DO NOTHING;
INSERT INTO integration_health(name,kind) VALUES ('openshorts','integration'),('youtube_api','integration'),('gmail','integration'),
 ('youtube_upload','integration'),('instagram','integration'),('facebook','integration') ON CONFLICT DO NOTHING;
INSERT INTO models(provider,kind,model,base_url,capabilities,quality_tier,priority,is_local) VALUES
 ('ollama','ollama','qwen2.5:7b','http://localhost:11434','{text,json}',1,20,true),
 ('gemini','gemini','gemini-2.0-flash','https://generativelanguage.googleapis.com','{text,json,vision}',2,10,false),
 ('groq','openai_compat','llama-3.3-70b-versatile','https://api.groq.com/openai/v1','{text,json}',2,15,false)
ON CONFLICT DO NOTHING;
UPDATE models SET enabled=false WHERE provider IN ('gemini','groq') AND NOT EXISTS (SELECT 1 FROM settings WHERE key='enable_cloud_models' AND value='true'::jsonb);
INSERT INTO settings(key,value,description) VALUES ('enable_cloud_models','false','set true after creating Gemini/Groq credentials') ON CONFLICT DO NOTHING;

-- ================= pipeline stage functions (thin n8n workflows call these) =================
INSERT INTO settings(key,value,description) VALUES
 ('allowed_source_domains','["youtube.com","www.youtube.com","m.youtube.com","youtu.be"]','allowlist: only these hosts may be sent to a clip engine'),
 ('adapter_verified_instagram','false','set true only after you verified the Instagram Reels Graph API flow against current Meta docs'),
 ('adapter_verified_facebook','false','set true only after you verified the Facebook Reels API flow against current Meta docs'),
 ('adapter_verified_youtube','true','YouTube Data API v3 videos.insert resumable upload'),
 ('quiet_hours','[]','optional [{"start":"23:00","end":"06:00"}] no IMPORTANT emails'),
 ('backlog_notify_minutes','120','notify only if queued heavy work is delayed longer than this')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION ca_notify(p_level text, p_cat text, p_subject text, p_body text, p_dedup text, p_entity uuid, p_corr uuid)
RETURNS uuid AS $$
DECLARE nid uuid;
BEGIN
  INSERT INTO notifications(level,category,subject,body,dedup_key,entity_id,correlation_id,status)
  VALUES (p_level,p_cat,left(p_subject,200),left(p_body,4000),p_dedup,p_entity,p_corr, CASE WHEN p_level='INFO' THEN 'skipped' ELSE 'pending' END)
  ON CONFLICT DO NOTHING RETURNING id INTO nid;
  RETURN nid;
END $$ LANGUAGE plpgsql;

-- Register a discovered source. Deterministic dedup on canonical_id (platform:videoId) AND content_hash.
CREATE OR REPLACE FUNCTION ca_register_source(p jsonb) RETURNS jsonb AS $$
DECLARE sid uuid; inserted boolean := false; ch uuid := (p->>'channel_id')::uuid; j jobs;
BEGIN
  IF p->>'content_hash' IS NOT NULL AND EXISTS (SELECT 1 FROM sources WHERE content_hash=p->>'content_hash') THEN
    RETURN jsonb_build_object('inserted',false,'reason','duplicate_hash'); END IF;
  INSERT INTO sources(canonical_id,normalized_url,source_platform,platform_video_id,creator,authorized_creator_id,title,duration_seconds,relevance_score,content_hash,trend_id,channel_id,metadata,status)
  VALUES (p->>'canonical_id',p->>'normalized_url',p->>'source_platform',p->>'platform_video_id',p->>'creator',(p->>'authorized_creator_id')::uuid,
          p->>'title',(p->>'duration_seconds')::int,(p->>'relevance_score')::numeric,p->>'content_hash',(p->>'trend_id')::uuid,ch,COALESCE(p->'metadata','{}'),'discovered')
  ON CONFLICT (canonical_id) DO NOTHING RETURNING source_id INTO sid;
  IF sid IS NULL THEN RETURN jsonb_build_object('inserted',false,'reason','duplicate_canonical_id'); END IF;
  SELECT * INTO j FROM ca_enqueue('rights_verification',sid,NULL,jsonb_build_object('channel_id',ch),6,'rights:'||sid);
  PERFORM ca_emit('source.discovered',sid,j.correlation_id,jsonb_build_object('canonical_id',p->>'canonical_id','channel_id',ch));
  PERFORM ca_audit('worker','source_discovery','register','source',sid,NULL,'discovered',p-'metadata',j.correlation_id);
  RETURN jsonb_build_object('inserted',true,'source_id',sid);
END $$ LANGUAGE plpgsql;

-- Rights stage: snapshot creator authorization -> permissions, run gate, route.
CREATE OR REPLACE FUNCTION ca_rights_stage(p_job uuid) RETURNS jsonb AS $$
DECLARE j jobs; s sources; ac authorized_creators; ch uuid; g jsonb; dec text; nj jobs;
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE; IF j.status <> 'running' THEN RETURN jsonb_build_object('skipped','job_not_running','status',j.status); END IF; ch := (j.payload->>'channel_id')::uuid;
  SELECT * INTO s FROM sources WHERE source_id=j.entity_id;
  IF s.authorized_creator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM permissions WHERE source_id=s.source_id AND status='active') THEN
    SELECT * INTO ac FROM authorized_creators WHERE id=s.authorized_creator_id;
    INSERT INTO permissions(source_id,creator,source_url,source_platform,permission_status,permission_evidence,permission_source_url,allowed_platforms,allowed_usage,
      commercial_use_allowed,monetization_allowed,attribution_required,attribution_text,expiration_date,notes,verification_timestamp)
    VALUES (s.source_id,ac.creator,s.normalized_url,s.source_platform,ac.permission_status,ac.permission_evidence,ac.permission_source_url,ac.allowed_platforms,ac.allowed_usage,
      ac.commercial_use_allowed,ac.monetization_allowed,ac.attribution_required,ac.attribution_text,ac.expiration_date,ac.notes,ac.verification_timestamp);
  END IF;
  g := ca_rights_gate(s.source_id,ch); dec := g->>'decision';
  IF dec='verified' THEN
    UPDATE sources SET status='rights_verified' WHERE source_id=s.source_id;
    PERFORM ca_emit('rights.verified',s.source_id,j.correlation_id,g);
    SELECT * INTO nj FROM ca_enqueue('monetization_policy',s.source_id,j.correlation_id,jsonb_build_object('channel_id',ch),6,'policy:'||s.source_id||':'||ch);
    PERFORM ca_job_done(p_job,g);
  ELSIF dec='human_review' THEN
    UPDATE sources SET status='needs_human_review' WHERE source_id=s.source_id;
    PERFORM ca_emit('rights.rejected',s.source_id,j.correlation_id,g||'{"note":"held for human review"}');
    PERFORM ca_notify('IMPORTANT','rights','Rights review needed: '||COALESCE(s.title,s.canonical_id),g::text,'rights-review:'||s.source_id,s.source_id,j.correlation_id);
    PERFORM ca_job_done(p_job,g);
  ELSE
    UPDATE sources SET status='rights_blocked' WHERE source_id=s.source_id;
    PERFORM ca_emit('rights.rejected',s.source_id,j.correlation_id,g);
    PERFORM ca_notify('CRITICAL','rights','Rights hard stop: '||COALESCE(s.title,s.canonical_id),g::text,'rights-block:'||s.source_id,s.source_id,j.correlation_id);
    INSERT INTO errors(category,severity,retryable,workflow,job_id,entity_id,message,correlation_id) VALUES ('RIGHTS','critical',false,'rights_verification',p_job,s.source_id,g::text,j.correlation_id);
    PERFORM ca_job_done(p_job,g);
  END IF;
  PERFORM ca_audit('worker','rights_verification','gate','source',s.source_id,NULL,dec,g,j.correlation_id);
  RETURN g;
END $$ LANGUAGE plpgsql;

-- Store policy assessment(s) (one per platform). Forbidden phrases are rejected in code. Then enqueue clipping unless blocked.

CREATE OR REPLACE FUNCTION ca_job_wait(p_job uuid, p_ext text) RETURNS void AS $$
  UPDATE jobs SET status='waiting', external_job_id=p_ext WHERE job_id=p_job AND status='running' $$ LANGUAGE sql;

-- Ingest clips from a clip-engine completion (idempotent per fingerprint).
CREATE OR REPLACE FUNCTION ca_ingest_clips(p_ext text, p_engine text, p_clips jsonb) RETURNS jsonb AS $$
DECLARE j jobs; c jsonb; ch uuid; cid uuid; clid uuid; fp text; n int := 0; nj jobs; idx int;
BEGIN
  SELECT * INTO j FROM jobs WHERE external_job_id=p_ext AND job_type='clipping' AND status IN ('waiting','running') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','no_matching_waiting_job'); END IF;
  ch := (j.payload->>'channel_id')::uuid;
  FOR c IN SELECT * FROM jsonb_array_elements(COALESCE(p_clips,'[]')) LOOP
    idx := COALESCE((c->>'index')::int, n);
    fp := md5(j.entity_id::text||':'||idx||':'||COALESCE(c->>'title','')||':'||p_engine);
    INSERT INTO clips(source_id,channel_id,clip_engine,clip_engine_job_id,clip_index,start_time,end_time,duration,hook,title,video_url,fingerprint,status,metadata)
    VALUES (j.entity_id,ch,p_engine,p_ext,idx,(c->>'start')::numeric,(c->>'end')::numeric,
            COALESCE((c->>'duration')::numeric, (c->>'end')::numeric-(c->>'start')::numeric), c->>'viral_hook_text', c->>'title',
            COALESCE(c->>'download_url',c->>'video_url'), fp, 'clipped', c)
    ON CONFLICT (fingerprint) DO NOTHING RETURNING clip_id INTO clid;
    IF clid IS NOT NULL THEN
      INSERT INTO content(source_id,channel_id,correlation_id,status) VALUES (j.entity_id,ch,j.correlation_id,'clipped') RETURNING content_id INTO cid;
      UPDATE clips SET content_id=cid WHERE clip_id=clid;
      SELECT * INTO nj FROM ca_enqueue('content_packaging',cid,j.correlation_id,jsonb_build_object('channel_id',ch,'clip_id',clid),5,'pkg:'||cid);
      PERFORM ca_emit('clip.completed',cid,j.correlation_id,jsonb_build_object('clip_id',clid));
      n := n+1;
    END IF;
  END LOOP;
  UPDATE sources SET status='clipped' WHERE source_id=j.entity_id;
  PERFORM ca_job_done(j.job_id, jsonb_build_object('clip_count',n));
  RETURN jsonb_build_object('ok',true,'job_id',j.job_id,'clip_count',n);
END $$ LANGUAGE plpgsql;

-- Packaging result -> new content version + QA -> approval-request job

-- Approval request: autonomy gate decides auto-approve vs wait for human.
CREATE OR REPLACE FUNCTION ca_approval_request(p_job uuid) RETURNS jsonb AS $$
DECLARE j jobs; c content; v int; g jsonb; aid uuid; nj jobs; cv content_versions;
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE; IF j.status <> 'running' THEN RETURN jsonb_build_object('skipped','job_not_running','status',j.status); END IF; v := (j.payload->>'version')::int;
  SELECT * INTO c FROM content WHERE content_id=j.entity_id;
  IF v <> c.current_version THEN PERFORM ca_job_done(p_job,'{"skipped":"superseded_version"}'); RETURN jsonb_build_object('skipped',true); END IF;
  SELECT * INTO cv FROM content_versions WHERE content_id=c.content_id AND version=v;
  g := ca_autonomy_gate(c.content_id,v);
  INSERT INTO approvals(content_id,version,metadata_snapshot) VALUES (c.content_id,v,jsonb_build_object('per_platform',cv.per_platform,'quality',cv.quality_score,'gate',g))
    ON CONFLICT (content_id,kind) WHERE status='awaiting_approval' DO UPDATE SET version=EXCLUDED.version, metadata_snapshot=EXCLUDED.metadata_snapshot
    RETURNING approval_id INTO aid;
  PERFORM ca_emit('approval.requested',c.content_id,j.correlation_id,jsonb_build_object('approval_id',aid,'version',v,'gate',g));
  IF (g->>'auto_approve')::boolean THEN
    PERFORM ca_approve(aid,'auto:gates_passed',v);
    SELECT * INTO nj FROM ca_enqueue('scheduling',c.content_id,j.correlation_id,jsonb_build_object('version',v),5,'sched:'||c.content_id||':'||v);
    PERFORM ca_audit('system','autonomy_gate','auto_approve','content',c.content_id,'awaiting_approval','approved',g,j.correlation_id);
  ELSE
    PERFORM ca_notify('IMPORTANT','approval','Content ready for approval','content '||c.content_id||' v'||v||'; reasons: '||(g->'reasons')::text,'approval:'||c.content_id||':'||v,c.content_id,j.correlation_id);
  END IF;
  PERFORM ca_job_done(p_job,g);
  RETURN g||jsonb_build_object('approval_id',aid);
END $$ LANGUAGE plpgsql;

-- Human decision endpoint (frontend/webhook).

-- Schedule the latest approved version on every enabled platform of the channel.

-- Publication results

-- Due schedules: skips channels whose auth circuit is open (auth failure => publication stopped).
CREATE OR REPLACE FUNCTION ca_due_schedules(p_limit int DEFAULT 5) RETURNS SETOF schedules AS $$
  SELECT s.* FROM schedules s
   WHERE s.status='scheduled' AND s.scheduled_at<=now()
     AND NOT EXISTS (SELECT 1 FROM integration_health h WHERE h.name='auth_'||s.channel_id::text AND h.state='open')
     AND ca_circuit_allowed(CASE s.platform WHEN 'youtube' THEN 'youtube_upload' ELSE s.platform END)
   ORDER BY s.scheduled_at LIMIT p_limit FOR UPDATE SKIP LOCKED $$ LANGUAGE sql;

-- Source-level human review (rights): resolve, then pipeline resumes.
CREATE OR REPLACE FUNCTION ca_source_review(p jsonb) RETURNS jsonb AS $$
DECLARE sid uuid := (p->>'source_id')::uuid; act text := p->>'action'; ch uuid; nj jobs;
BEGIN
  SELECT channel_id INTO ch FROM sources WHERE source_id=sid;
  IF act='verify' THEN
    IF COALESCE(p->>'evidence','')='' THEN RETURN jsonb_build_object('ok',false,'error','evidence_required'); END IF;
    UPDATE permissions SET status='superseded' WHERE source_id=sid AND status='active';
    INSERT INTO permissions(source_id,permission_status,permission_evidence,permission_source_url,allowed_platforms,commercial_use_allowed,monetization_allowed,attribution_required,attribution_text,verification_timestamp)
    VALUES (sid,'verified',p->>'evidence',p->>'evidence_url',COALESCE(ARRAY(SELECT jsonb_array_elements_text(p->'allowed_platforms')),'{}'),(p->>'commercial_use_allowed')::boolean,(p->>'monetization_allowed')::boolean,COALESCE((p->>'attribution_required')::boolean,false),p->>'attribution_text',now());
    UPDATE sources SET status='discovered' WHERE source_id=sid;
    SELECT * INTO nj FROM ca_enqueue('rights_verification',sid,NULL,jsonb_build_object('channel_id',ch),7,'rights:'||sid||':'||gen_random_uuid());
    PERFORM ca_audit('user',COALESCE(p->>'by','owner'),'rights_verify','source',sid,NULL,'verified',p-'evidence');
    RETURN jsonb_build_object('ok',true);
  ELSIF act='reject' THEN
    UPDATE sources SET status='rights_blocked' WHERE source_id=sid;
    RETURN jsonb_build_object('ok',true);
  END IF;
  RETURN jsonb_build_object('ok',false,'error','unknown_action');
END $$ LANGUAGE plpgsql;

INSERT INTO settings(key,value,description) VALUES ('max_publish_attempts','4','publication retries before CRITICAL alert') ON CONFLICT DO NOTHING;

-- Supervisor tick: bounded, deterministic maintenance. Returns what it did.

-- Seed research jobs for active channels (idempotent per 6h bucket)
CREATE OR REPLACE FUNCTION ca_seed_research() RETURNS int AS $$
DECLARE n int := 0; c record; j jobs;
BEGIN
  FOR c IN SELECT id FROM channels WHERE status='active' LOOP
    SELECT * INTO j FROM ca_enqueue('trend_research',c.id,NULL,jsonb_build_object('channel_id',c.id),3,'trend:'||c.id||':'||to_char(date_trunc('hour',now())-make_interval(hours=>(extract(hour FROM now())::int%6)),'YYYYMMDDHH24'));
    n := n+1;
  END LOOP; RETURN n;
END $$ LANGUAGE plpgsql;

-- Trend store + discovery enqueue
CREATE OR REPLACE FUNCTION ca_trend_store(p_job uuid, p_trends jsonb) RETURNS jsonb AS $$
DECLARE j jobs; t jsonb; tid uuid; n int := 0; nj jobs; ch uuid;
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE; IF j.status <> 'running' THEN RETURN jsonb_build_object('skipped','job_not_running','status',j.status); END IF; ch := (j.payload->>'channel_id')::uuid;
  FOR t IN SELECT * FROM jsonb_array_elements(COALESCE(p_trends,'[]')) LOOP
    INSERT INTO trends(niche,topic,source,trend_score,confidence,evidence,expires_at,recommended_channel,recommended_content_format,recommended_posting_frequency,recommended_posting_windows,channel_id,new_channel_opportunity)
    VALUES (t->>'niche',t->>'topic',t->>'source',(t->>'trend_score')::numeric,(t->>'confidence')::numeric,COALESCE(t->'evidence','[]'),now()+interval '7 days',
            t->>'recommended_channel',t->>'recommended_content_format',t->>'recommended_posting_frequency',t->'recommended_posting_windows',ch,COALESCE((t->>'new_channel_opportunity')::boolean,false))
    RETURNING trend_id INTO tid;
    PERFORM ca_emit('trend.detected',tid,j.correlation_id,t);
    IF COALESCE((t->>'new_channel_opportunity')::boolean,false) THEN
      PERFORM ca_notify('IMPORTANT','trend','Potential new channel/niche opportunity: '||(t->>'topic'),t::text,'newniche:'||lower(t->>'topic'),tid,j.correlation_id); END IF;
    IF (t->>'trend_score')::numeric >= COALESCE((ca_setting('min_trend_score','0.4'))#>>'{}','0.4')::numeric AND NOT COALESCE((t->>'new_channel_opportunity')::boolean,false) THEN
      SELECT * INTO nj FROM ca_enqueue('source_discovery',tid,j.correlation_id,jsonb_build_object('channel_id',ch,'topic',t->>'topic','trend_id',tid),4,'disc:'||ch||':'||lower(t->>'topic')||':'||to_char(now(),'YYYYMMDD'));
    END IF;
    n := n+1;
  END LOOP;
  PERFORM ca_job_done(p_job,jsonb_build_object('trends',n));
  RETURN jsonb_build_object('trends',n);
END $$ LANGUAGE plpgsql;
INSERT INTO settings(key,value,description) VALUES ('min_trend_score','0.4','trend_score (0..1) needed to trigger source discovery') ON CONFLICT DO NOTHING;

-- ================= model router (free-first, circuit-aware, quota-aware) =================
INSERT INTO settings(key,value,description) VALUES
 ('auto_requires_visual_qa','true','automatic mode is blocked unless visual/audio QA was performed (no built-in visual QA yet). Set false ONLY if you accept text/metadata-only QA.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION ca_pick_model(p_caps text[], p_fallback boolean DEFAULT false) RETURNS SETOF models AS $$
  SELECT m.* FROM models m
  LEFT JOIN model_quotas q ON q.provider=m.provider AND q.day=current_date
  WHERE m.enabled AND m.capabilities @> p_caps AND ca_circuit_allowed('model_'||m.provider)
    AND (q.daily_limit IS NULL OR COALESCE(q.used,0) < q.daily_limit)
  ORDER BY CASE WHEN p_fallback THEN -m.priority ELSE m.priority END, m.quality_tier DESC
  LIMIT 1 $$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION ca_model_result(p_provider text, p_ok boolean, p_err text DEFAULT NULL) RETURNS text AS $$
DECLARE st text;
BEGIN
  INSERT INTO integration_health(name,kind,failure_threshold) VALUES ('model_'||p_provider,'provider',3) ON CONFLICT DO NOTHING;
  INSERT INTO model_quotas(provider,day,used) VALUES (p_provider,current_date,1)
    ON CONFLICT (provider,day) DO UPDATE SET used=model_quotas.used+1;
  IF p_ok THEN RETURN ca_circuit_record('model_'||p_provider,true); END IF;
  IF p_err ~ '(429|RESOURCE_EXHAUSTED|quota|rate.?limit)' THEN   -- quota exceeded: open immediately, route elsewhere until cooldown
    UPDATE integration_health SET state='open',opened_at=now(),cooldown_seconds=3600,consecutive_failures=consecutive_failures+1,last_error=left(p_err,300) WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','circuit_open_quota'),'model_router');
    RETURN 'open';
  END IF;
  RETURN ca_circuit_record('model_'||p_provider,false,p_err);
END $$ LANGUAGE plpgsql;

-- Autonomy gate: also require visual QA unless the operator opted out.
CREATE OR REPLACE FUNCTION ca_autonomy_gate(p_content uuid, p_version int) RETURNS jsonb AS $$
DECLARE c content; ch channels; v content_versions; pol_bad int; rights jsonb; reasons jsonb := '[]';
BEGIN
  SELECT * INTO c FROM content WHERE content_id=p_content;
  SELECT * INTO ch FROM channels WHERE id=c.channel_id;
  SELECT * INTO v FROM content_versions WHERE content_id=p_content AND version=p_version;
  rights := ca_rights_gate(c.source_id, c.channel_id);
  IF rights->>'decision' <> 'verified' THEN reasons := reasons || to_jsonb('rights not verified'::text); END IF;
  SELECT count(*) INTO pol_bad FROM policy_assessments pa WHERE pa.source_id=c.source_id AND pa.status='active'
    AND (pa.monetization_status='blocked' OR (ch.monetization_review_required AND (pa.monetization_status='review_required' OR pa.policy_risk IN ('high','unknown'))
         AND NOT EXISTS (SELECT 1 FROM policy_reviews r WHERE r.assessment_id=pa.id AND r.decision='approved')));
  IF pol_bad>0 THEN reasons := reasons || to_jsonb('policy assessment needs human review or is blocked'::text); END IF;
  IF ch.monetization_review_required AND NOT EXISTS (SELECT 1 FROM policy_assessments WHERE source_id=c.source_id AND status='active') THEN
    reasons := reasons || to_jsonb('no policy assessment on record'::text); END IF;
  IF COALESCE(v.quality_score,0) < ch.quality_threshold THEN reasons := reasons || to_jsonb('quality below threshold'::text); END IF;
  IF (ca_setting('auto_requires_visual_qa','true'))#>>'{}'='true' AND COALESCE((v.qa->>'visual_pass')::boolean,false)=false THEN
    reasons := reasons || to_jsonb('visual/audio QA missing or failed (auto_requires_visual_qa=true)'::text); END IF;
  IF ch.autonomy_mode <> 'automatic' THEN reasons := reasons || to_jsonb('channel is in manual mode'::text); END IF;
  IF (ca_setting('force_manual_approval','false'))#>>'{}'='true' THEN reasons := reasons || to_jsonb('global manual override active'::text); END IF;
  IF EXISTS (SELECT 1 FROM integration_health WHERE name='auth_'||c.channel_id::text AND state='open') THEN reasons := reasons || to_jsonb('auth failure open for channel'::text); END IF;
  RETURN jsonb_build_object('auto_approve', jsonb_array_length(reasons)=0, 'reasons', reasons);
END $$ LANGUAGE plpgsql;

-- Data-driven posting-window suggestion (observation, not a guarantee). Needs >= min_samples snapshots.
CREATE OR REPLACE FUNCTION ca_suggest_windows(p_channel uuid, p_min_samples int DEFAULT 12) RETURNS jsonb AS $$
DECLARE tz text; n int; res jsonb;
BEGIN
  SELECT timezone INTO tz FROM channels WHERE id=p_channel;
  SELECT count(*) INTO n FROM publications p JOIN LATERAL (SELECT views FROM analytics_snapshots a WHERE a.publication_id=p.id AND a.views IS NOT NULL ORDER BY captured_at DESC LIMIT 1) s ON true WHERE p.channel_id=p_channel AND p.status='published';
  IF n < p_min_samples THEN RETURN jsonb_build_object('enough_data',false,'samples',n); END IF;
  SELECT jsonb_build_object('enough_data',true,'samples',n,'windows',COALESCE(jsonb_agg(jsonb_build_object('start',to_char(make_time(h,0,0),'HH24:MI'),'avg_views',round(v))),'[]')) INTO res
  FROM (SELECT extract(hour FROM p.published_at AT TIME ZONE tz)::int h, avg(s.views) v
        FROM publications p JOIN LATERAL (SELECT views FROM analytics_snapshots a WHERE a.publication_id=p.id AND a.views IS NOT NULL ORDER BY captured_at DESC LIMIT 1) s ON true
        WHERE p.channel_id=p_channel AND p.status='published' GROUP BY 1 ORDER BY v DESC LIMIT 3) t;
  RETURN res;
END $$ LANGUAGE plpgsql;

-- publish guard hardening: only a 'scheduled' item may begin (concurrent runs cannot double-start)

-- User/AI chooses an exact publication time (publishing calendar). Conflict + gap checked.
CREATE OR REPLACE FUNCTION ca_reschedule(p_content uuid, p_platform text, p_at timestamptz) RETURNS jsonb AS $$
DECLARE s schedules; ch channels;
BEGIN
  SELECT * INTO s FROM schedules WHERE content_id=p_content AND platform=p_platform FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','no_schedule'); END IF;
  IF s.status NOT IN ('scheduled','blocked','failed') THEN RETURN jsonb_build_object('ok',false,'error','not_editable','status',s.status); END IF;
  IF p_at < now() THEN RETURN jsonb_build_object('ok',false,'error','in_the_past'); END IF;
  SELECT * INTO ch FROM channels WHERE id=s.channel_id;
  IF EXISTS (SELECT 1 FROM schedules x WHERE x.channel_id=s.channel_id AND x.platform=p_platform AND x.schedule_id<>s.schedule_id
     AND x.status IN ('scheduled','publishing','published') AND abs(extract(epoch FROM (x.scheduled_at-p_at)))/60 < ch.min_gap_minutes) THEN
    RETURN jsonb_build_object('ok',false,'error','conflict_min_gap'); END IF;
  UPDATE schedules SET scheduled_at=p_at, status=CASE WHEN status='failed' THEN 'scheduled' ELSE status END WHERE schedule_id=s.schedule_id;
  PERFORM ca_audit('user','owner','reschedule','schedule',s.schedule_id,s.scheduled_at::text,p_at::text,'{}');
  RETURN jsonb_build_object('ok',true,'scheduled_at',p_at);
END $$ LANGUAGE plpgsql;

-- Weekly: suggest (or, if channels.rules.auto_windows=true, apply) data-driven posting windows.
CREATE OR REPLACE FUNCTION ca_apply_windows() RETURNS int AS $$
DECLARE c record; sug jsonb; n int := 0; w jsonb;
BEGIN
  FOR c IN SELECT id,name,rules FROM channels WHERE status='active' LOOP
    sug := ca_suggest_windows(c.id);
    CONTINUE WHEN NOT (sug->>'enough_data')::boolean;
    w := (SELECT jsonb_agg(jsonb_build_object('start',x->>'start')) FROM jsonb_array_elements(sug->'windows') x);
    IF COALESCE(c.rules->>'auto_windows','false')='true' THEN
      UPDATE channels SET preferred_windows=w WHERE id=c.id; n := n+1;
      PERFORM ca_audit('system','analytics','apply_windows','channel',c.id,NULL,NULL,sug);
    ELSE
      PERFORM ca_notify('INFO','schedule','Posting-window suggestion for '||c.name,sug::text,'win:'||c.id||':'||to_char(now(),'IYYY-IW'),c.id,NULL);
      UPDATE channels SET rules=rules||jsonb_build_object('suggested_windows',sug) WHERE id=c.id;
    END IF;
  END LOOP; RETURN n;
END $$ LANGUAGE plpgsql;

-- Recover jobs stuck 'waiting' for an engine webhook that never arrived (bounded by the same retry ladder).
CREATE OR REPLACE FUNCTION ca_recover_stuck(p_minutes int) RETURNS int AS $$
DECLARE n int := 0; r record;
BEGIN
  FOR r IN SELECT job_id FROM jobs WHERE (status='running' AND started_at < now()-make_interval(mins=>p_minutes))
        OR (status='waiting' AND updated_at < now()-make_interval(mins=>p_minutes*4)) LOOP
    PERFORM ca_job_fail(r.job_id,'TRANSIENT','stuck job recovered by supervisor'); n := n+1;
  END LOOP; RETURN n;
END $$ LANGUAGE plpgsql;

-- ================= REPAIR CYCLE 1 ADDITIONS =================
-- Human policy review (resolution path for monetization_status=review_required). 'blocked' can never be overridden.
CREATE TABLE IF NOT EXISTS policy_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assessment_id uuid NOT NULL REFERENCES policy_assessments(id),
  source_id uuid NOT NULL REFERENCES sources(source_id), content_id uuid, content_version int,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','changes_requested')),
  reviewer text NOT NULL, reason text NOT NULL, evidence jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
DROP TRIGGER IF EXISTS trg_touch_policy_reviews ON policy_reviews;
CREATE TRIGGER trg_touch_policy_reviews BEFORE UPDATE ON policy_reviews FOR EACH ROW EXECUTE FUNCTION ca_touch();

-- FINAL PRE-PUBLISH GATE: re-validates everything against CURRENT database state, immediately before publishing.

-- Visual QA stage (heavy job: ffmpeg). Packaging now enqueues visual_qa; visual_qa enqueues approval_request.
INSERT INTO job_type_config(job_type,worker_type,webhook_path,heavy,integration,max_attempts) VALUES ('visual_qa','quality_assurance','ca-w-visual-qa',true,'qa_worker',4) ON CONFLICT (job_type) DO NOTHING;
INSERT INTO integration_health(name,kind) VALUES ('qa_worker','integration') ON CONFLICT DO NOTHING;
INSERT INTO settings(key,value,description) VALUES
 ('qa_worker_url','"http://localhost:9100"','host-side ffmpeg QA service (tools/qa_worker.js)'),
 ('publish_requires_visual_qa','true','final pre-publish gate requires visual QA pass'),
 ('block_on_stale_policy','false','pre-publish gate refuses when the policy assessment is older than policy_refresh_days'),
 ('require_thumbnail','false','visual QA fails when no valid thumbnail could be produced') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION ca_packaging_store(p_job uuid, p_per_platform jsonb, p_hook text, p_qa jsonb, p_score numeric) RETURNS jsonb AS $$
DECLARE j jobs; nv int; clip uuid; nj jobs;
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE;
  IF j.status <> 'running' THEN RETURN jsonb_build_object('skipped','job_not_running','status',j.status); END IF;
  clip := (j.payload->>'clip_id')::uuid;
  UPDATE content SET current_version=current_version+1, status='needs_approval' WHERE content_id=j.entity_id RETURNING current_version INTO nv;
  INSERT INTO content_versions(content_id,version,clip_id,per_platform,hook_text,qa,quality_score,created_by,status)
  VALUES (j.entity_id,nv,clip,p_per_platform,p_hook,p_qa,p_score,'ai','draft');
  UPDATE clips SET quality_score=p_score, status='packaged' WHERE clip_id=clip;
  SELECT * INTO nj FROM ca_enqueue('visual_qa',j.entity_id,j.correlation_id,jsonb_build_object('version',nv,'clip_id',clip,'channel_id',j.payload->>'channel_id'),5,'vqa:'||j.entity_id||':'||nv);
  PERFORM ca_job_done(p_job,jsonb_build_object('version',nv));
  RETURN jsonb_build_object('version',nv);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ca_visual_qa_store(p_job uuid, p_result jsonb) RETURNS jsonb AS $$
DECLARE j jobs; v int; thumb jsonb := p_result->'thumbnail'; passed boolean; nj jobs; ch channels; fails jsonb := COALESCE(p_result->'failures','[]');
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE;
  IF j.status <> 'running' THEN RETURN jsonb_build_object('skipped','job_not_running','status',j.status); END IF;
  v := (j.payload->>'version')::int;
  SELECT * INTO ch FROM channels WHERE id=(j.payload->>'channel_id')::uuid;
  passed := COALESCE((p_result->>'visual_pass')::boolean,false);
  IF (ca_setting('require_thumbnail','false'))#>>'{}'='true' AND NOT COALESCE((thumb->>'ok')::boolean,false) THEN passed := false; fails := fails||to_jsonb('thumbnail missing/invalid'::text); END IF;
  UPDATE content_versions SET qa = qa || jsonb_build_object('visual_checked',true,'visual_pass',passed,'visual',p_result||jsonb_build_object('failures',fails),'visual_at',now()),
     thumbnail_url = CASE WHEN COALESCE((thumb->>'ok')::boolean,false) THEN thumb->>'url' ELSE thumbnail_url END
   WHERE content_id=j.entity_id AND version=v;
  UPDATE clips SET thumbnail_url=CASE WHEN COALESCE((thumb->>'ok')::boolean,false) THEN thumb->>'url' ELSE thumbnail_url END, thumbnail_path=thumb->>'path',
     status=CASE WHEN passed THEN 'qa_passed' ELSE 'qa_failed' END WHERE clip_id=(j.payload->>'clip_id')::uuid;
  PERFORM ca_emit('qa.completed',j.entity_id,j.correlation_id,jsonb_build_object('stage','visual','pass',passed,'failures',fails,'version',v));
  IF NOT passed THEN PERFORM ca_notify('IMPORTANT','qa','Visual QA failed for content '||j.entity_id,fails::text,'vqa-fail:'||j.entity_id||':'||v,j.entity_id,j.correlation_id); END IF;
  SELECT * INTO nj FROM ca_enqueue('approval_request',j.entity_id,j.correlation_id,jsonb_build_object('version',v),5,'apr:'||j.entity_id||':'||v);
  PERFORM ca_job_done(p_job,jsonb_build_object('visual_pass',passed));
  RETURN jsonb_build_object('visual_pass',passed,'version',v);
END $$ LANGUAGE plpgsql;

-- policy review approval re-arms schedules that the pre-publish gate blocked for an unresolved policy review (gate re-checks everything again at publish time)
CREATE OR REPLACE FUNCTION ca_policy_review(p jsonb) RETURNS jsonb AS $$
DECLARE sid uuid := (p->>'source_id')::uuid; dec text := p->>'decision'; n int := 0; a record; rearmed int := 0;
BEGIN
  IF dec NOT IN ('approved','rejected','changes_requested') THEN RETURN jsonb_build_object('ok',false,'error','invalid_decision'); END IF;
  IF COALESCE(trim(p->>'reason'),'')='' OR COALESCE(trim(p->>'reviewer'),'')='' THEN RETURN jsonb_build_object('ok',false,'error','reason_and_reviewer_required'); END IF;
  FOR a IN SELECT * FROM policy_assessments WHERE source_id=sid AND status='active' AND (p->>'platform' IS NULL OR platform=p->>'platform') LOOP
    IF a.monetization_status='blocked' AND dec='approved' THEN
      RETURN jsonb_build_object('ok',false,'error','blocked_assessment_cannot_be_approved','platform',a.platform); END IF;
  END LOOP;
  FOR a IN SELECT * FROM policy_assessments WHERE source_id=sid AND status='active' AND (p->>'platform' IS NULL OR platform=p->>'platform') LOOP
    INSERT INTO policy_reviews(assessment_id,source_id,content_id,content_version,decision,reviewer,reason,evidence)
    VALUES (a.id,sid,(p->>'content_id')::uuid,(p->>'content_version')::int,dec,p->>'reviewer',p->>'reason',COALESCE(p->'evidence','[]')); n := n+1;
  END LOOP;
  IF n=0 THEN RETURN jsonb_build_object('ok',false,'error','no_active_assessment'); END IF;
  IF dec='rejected' THEN
    UPDATE sources SET status='policy_blocked' WHERE source_id=sid;
    UPDATE schedules SET status='cancelled',last_error='policy review rejected' WHERE content_id IN (SELECT content_id FROM content WHERE source_id=sid) AND status IN ('scheduled','blocked');
    UPDATE content SET status='blocked',approved_version=NULL WHERE source_id=sid AND status NOT IN ('published');
  ELSIF dec='changes_requested' THEN
    UPDATE content SET status='needs_approval',approved_version=NULL WHERE source_id=sid AND status NOT IN ('published');
    UPDATE schedules SET status='blocked',last_error='policy review: changes requested' WHERE content_id IN (SELECT content_id FROM content WHERE source_id=sid) AND status='scheduled';
  ELSE
    UPDATE schedules SET status='scheduled',last_error=NULL WHERE status='blocked' AND last_error ILIKE '%policy review unresolved%' AND content_id IN (SELECT content_id FROM content WHERE source_id=sid);
    GET DIAGNOSTICS rearmed = ROW_COUNT;
  END IF;
  PERFORM ca_emit('policy.checked',sid,NULL,jsonb_build_object('human_review',dec,'reviewer',p->>'reviewer','reviews',n),'policy_review');
  PERFORM ca_audit('user',p->>'reviewer','policy_review','source',sid,NULL,dec,jsonb_build_object('reason',p->>'reason','platform',p->>'platform','content_version',p->>'content_version'));
  RETURN jsonb_build_object('ok',true,'decision',dec,'assessments_reviewed',n,'schedules_rearmed',rearmed);
END $$ LANGUAGE plpgsql;

-- policy research cache: remember (dated) model assessments that cite evidence so the next assessment within policy_refresh_days reuses them

-- crash-consistency: a schedule stuck in 'publishing' means n8n died (or the result write failed) mid-publish. The upload MAY have succeeded,
-- so it is NEVER auto-retried (would risk a duplicate). It is parked as failed + CRITICAL alert; a human verifies on the platform, then re-queues.
INSERT INTO settings(key,value,description) VALUES ('stuck_publish_minutes','15','schedules stuck in publishing longer than this are parked for human verification') ON CONFLICT DO NOTHING;

-- ISSUE-008: repeated reject is a no-op; published approvals cannot be rejected

CREATE OR REPLACE FUNCTION ca_approval_action(p jsonb) RETURNS jsonb AS $$
DECLARE a approvals; c content; act text := p->>'action'; actor text := COALESCE(p->>'by','owner'); nj jobs; nv int; r jsonb;
BEGIN
  SELECT * INTO a FROM approvals WHERE approval_id=(p->>'approval_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  SELECT * INTO c FROM content WHERE content_id=a.content_id;
  IF act='approve' THEN
    r := ca_approve(a.approval_id,actor,COALESCE((p->>'version')::int,c.current_version));
    IF (r->>'ok')::boolean THEN
      SELECT * INTO nj FROM ca_enqueue('scheduling',c.content_id,c.correlation_id,jsonb_build_object('version',(r->>'version')::int),5,'sched:'||c.content_id||':'||(r->>'version'));
    END IF; RETURN r;
  ELSIF act='reject' THEN
    IF a.status='rejected' THEN RETURN jsonb_build_object('ok',true,'noop','already_rejected'); END IF;
    IF a.status='published' THEN RETURN jsonb_build_object('ok',false,'error','already_published'); END IF;
    UPDATE approvals SET status='rejected',decision='reject',approved_by=actor,approved_at=now(),comments=p->>'comments' WHERE approval_id=a.approval_id;
    UPDATE content SET status='rejected',approved_version=NULL WHERE content_id=c.content_id;
    UPDATE schedules SET status='cancelled' WHERE content_id=c.content_id AND status IN ('scheduled','blocked');
    PERFORM ca_emit('approval.rejected',c.content_id,c.correlation_id,p); RETURN jsonb_build_object('ok',true);
  ELSIF act='edit' THEN
    nv := ca_edit_content(c.content_id,p->'per_platform',actor);
    UPDATE approvals SET status='awaiting_approval',version=nv,decision='edit',comments=p->>'comments',
      metadata_snapshot=jsonb_build_object('per_platform',(SELECT per_platform FROM content_versions WHERE content_id=c.content_id AND version=nv))
      WHERE approval_id=a.approval_id;
    RETURN jsonb_build_object('ok',true,'version',nv,'note','edited; scheduled items blocked until re-approval');
  ELSIF act='regenerate' THEN
    UPDATE approvals SET status='needs_edit',decision='regenerate',comments=p->>'comments' WHERE approval_id=a.approval_id;
    SELECT * INTO nj FROM ca_enqueue('content_packaging',c.content_id,c.correlation_id,jsonb_build_object('channel_id',c.channel_id,'clip_id',(SELECT clip_id FROM clips WHERE content_id=c.content_id LIMIT 1),'feedback',p->>'comments'),5,'pkg:'||c.content_id||':regen:'||COALESCE(p->>'nonce',gen_random_uuid()::text));
    RETURN jsonb_build_object('ok',true,'job_id',nj.job_id);
  END IF;
  RETURN jsonb_build_object('ok',false,'error','unknown_action');
END $$ LANGUAGE plpgsql;

-- ISSUE-009: reusing a cached policy summary must NOT renew it (it never re-expired). Cache is written/refreshed only from freshly fetched text.
DROP FUNCTION IF EXISTS ca_policy_store(uuid, jsonb);
CREATE OR REPLACE FUNCTION ca_policy_store(p_job uuid, p_assessments jsonb, p_fetched boolean DEFAULT false) RETURNS jsonb AS $$
DECLARE j jobs; a jsonb; ch uuid; worst text := 'pass'; nj jobs; txt text; rank jsonb := '{"pass":0,"conditional":1,"review_required":2,"blocked":3}'; days int;
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE;
  IF j.status <> 'running' THEN RETURN jsonb_build_object('skipped','job_not_running','status',j.status); END IF;
  ch := (j.payload->>'channel_id')::uuid; days := ((ca_setting('policy_refresh_days','14'))#>>'{}')::int;
  txt := lower(p_assessments::text);
  IF txt ~ '(guaranteed (monetization|earnings|revenue)|definitely safe|100% safe)' THEN RAISE EXCEPTION 'VALIDATION: assessment contains forbidden guarantee language'; END IF;
  UPDATE policy_assessments SET status='superseded' WHERE source_id=j.entity_id AND status='active';
  FOR a IN SELECT * FROM jsonb_array_elements(p_assessments) LOOP
    IF (a->>'monetization_status') NOT IN ('pass','conditional','review_required','blocked') THEN RAISE EXCEPTION 'VALIDATION: invalid monetization_status'; END IF;
    INSERT INTO policy_assessments(source_id,platform,rights_status,monetization_status,policy_risk,reasons,required_actions,evidence,checked_at,expires_at)
    VALUES (j.entity_id,a->>'platform',a->>'rights_status',a->>'monetization_status',COALESCE(a->>'policy_risk','unknown'),
      COALESCE(a->'reasons','[]'),COALESCE(a->'required_actions','[]'),COALESCE(a->'evidence','[]'),COALESCE((a->>'checked_at')::timestamptz,now()),now()+make_interval(days=>days));
    IF p_fetched AND jsonb_array_length(COALESCE(a->'evidence','[]'))>0 THEN
      INSERT INTO policy_knowledge(platform,summary,source_urls,fetched_at,expires_at,status)
      VALUES (a->>'platform',jsonb_build_object('derived_from','model_assessment_of_fetched_text','reasons',a->'reasons','required_actions',a->'required_actions','evidence',a->'evidence'),
              ARRAY(SELECT e->>'url' FROM jsonb_array_elements(a->'evidence') e WHERE e->>'url' IS NOT NULL),now(),now()+make_interval(days=>days),'fresh')
      ON CONFLICT (platform) DO UPDATE SET summary=EXCLUDED.summary,source_urls=EXCLUDED.source_urls,fetched_at=now(),expires_at=EXCLUDED.expires_at,status='fresh';
    END IF;
    IF (rank->>(a->>'monetization_status'))::int > (rank->>worst)::int THEN worst := a->>'monetization_status'; END IF;
  END LOOP;
  PERFORM ca_emit('policy.checked',j.entity_id,j.correlation_id,jsonb_build_object('worst',worst,'cache_written',p_fetched));
  IF worst='blocked' THEN
    UPDATE sources SET status='policy_blocked' WHERE source_id=j.entity_id;
    PERFORM ca_notify('CRITICAL','policy','Policy hard stop for source '||j.entity_id,p_assessments::text,'policy-block:'||j.entity_id,j.entity_id,j.correlation_id);
  ELSE
    UPDATE sources SET status='policy_'||worst WHERE source_id=j.entity_id;
    SELECT * INTO nj FROM ca_enqueue('clipping',j.entity_id,j.correlation_id,jsonb_build_object('channel_id',ch),5,'clip:'||j.entity_id||':'||ch);
  END IF;
  IF worst<>'blocked' THEN UPDATE schedules SET status='scheduled',last_error=NULL WHERE status='blocked' AND last_error ILIKE '%stale%' AND content_id IN (SELECT content_id FROM content WHERE source_id=j.entity_id); END IF;   -- refreshed assessment re-arms schedules blocked for stale policy (the gate re-checks everything again)
  PERFORM ca_job_done(p_job,jsonb_build_object('worst',worst));
  RETURN jsonb_build_object('worst',worst,'clipping_enqueued',worst<>'blocked');
END $$ LANGUAGE plpgsql;

-- ================= FINAL-AUDIT REPAIRS (publishing idempotency, platform accounts, policy freshness) =================
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_status_check;
ALTER TABLE publications ADD CONSTRAINT publications_status_check CHECK (status IN ('started','processing','published','failed','unsupported','ambiguous'));
UPDATE settings SET value='true' WHERE key='block_on_stale_policy' AND value='false'::jsonb;   -- product rule: never publish on expired policy
INSERT INTO settings(key,value,description) VALUES
 ('block_on_stale_policy','true','expired policy assessment blocks publishing and triggers a forced refresh'),
 ('youtube_default_privacy','"private"','public|private|unlisted; channel override: channels.rules.youtube_privacy. Default PRIVATE so tests never publish publicly')
ON CONFLICT (key) DO NOTHING;

-- Platform account validation (shared by scheduler and publish gate). Returns NULL when valid, else the reason. Fails closed.
CREATE OR REPLACE FUNCTION ca_platform_account_problem(p_channel uuid, p_platform text) RETURNS text AS $$
DECLARE acct platform_accounts; ch channels;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('youtube','instagram','facebook') THEN RETURN 'unsupported platform '||COALESCE(p_platform,'NULL'); END IF;
  SELECT * INTO ch FROM channels WHERE id=p_channel;
  IF ch.id IS NULL THEN RETURN 'channel not found'; END IF;
  IF NOT (p_platform = ANY(ch.platforms)) THEN RETURN 'platform not enabled for channel'; END IF;
  SELECT * INTO acct FROM platform_accounts WHERE channel_id=p_channel AND platform=p_platform;
  IF acct.id IS NULL THEN RETURN 'no platform account configured for '||p_platform; END IF;
  IF NOT acct.enabled THEN RETURN 'platform account disabled'; END IF;
  IF p_platform IN ('instagram','facebook') AND COALESCE(trim(acct.external_account_id),'')='' THEN RETURN 'platform account has no external_account_id'; END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION ca_publish_gate(p_content uuid, p_platform text) RETURNS jsonb AS $$
DECLARE c content; ch channels; v content_versions; s schedules; r jsonb; f jsonb := '[]'; pa policy_assessments; prob text;
BEGIN
  SELECT * INTO c FROM content WHERE content_id=p_content; SELECT * INTO ch FROM channels WHERE id=c.channel_id;
  SELECT * INTO s FROM schedules WHERE content_id=p_content AND platform=p_platform;
  IF c.approved_version IS NULL THEN f := f||to_jsonb('no approved version'::text);
  ELSIF c.approved_version <> c.current_version THEN f := f||to_jsonb('approved version v'||c.approved_version||' is not the latest version v'||c.current_version); END IF;
  IF NOT EXISTS (SELECT 1 FROM approvals WHERE content_id=p_content AND status IN ('approved','scheduled') AND version=c.approved_version) THEN f := f||to_jsonb('no approval record for the approved version'::text); END IF;
  IF c.status IN ('blocked','rejected') THEN f := f||to_jsonb('content status is '||c.status); END IF;
  SELECT * INTO v FROM content_versions WHERE content_id=p_content AND version=c.approved_version;
  r := ca_rights_gate(c.source_id,c.channel_id);
  IF r->>'decision' <> 'verified' THEN f := f||to_jsonb('rights: '||(r->>'decision')); END IF;
  SELECT * INTO pa FROM policy_assessments WHERE source_id=c.source_id AND platform=p_platform AND status='active' ORDER BY checked_at DESC LIMIT 1;
  IF pa.id IS NULL THEN
    IF ch.monetization_review_required THEN f := f||to_jsonb('no policy assessment for '||p_platform); END IF;
  ELSE
    IF pa.monetization_status='blocked' THEN f := f||to_jsonb('policy blocked'::text);
    ELSIF ch.monetization_review_required AND (pa.monetization_status='review_required' OR pa.policy_risk IN ('high','unknown'))
      AND NOT EXISTS (SELECT 1 FROM policy_reviews pr WHERE pr.assessment_id=pa.id AND pr.decision='approved') THEN f := f||to_jsonb('policy review unresolved'::text); END IF;
    IF EXISTS (SELECT 1 FROM policy_reviews pr WHERE pr.assessment_id=pa.id AND pr.decision IN ('rejected','changes_requested')
        AND pr.created_at >= ALL (SELECT created_at FROM policy_reviews x WHERE x.assessment_id=pa.id)) THEN f := f||to_jsonb('latest policy review is not an approval'::text); END IF;
    IF pa.expires_at IS NOT NULL AND pa.expires_at < now() AND (ca_setting('block_on_stale_policy','true'))#>>'{}'='true' THEN f := f||to_jsonb('policy assessment is stale (expired '||to_char(pa.expires_at,'YYYY-MM-DD')||'); refresh required'); END IF;
  END IF;
  IF COALESCE(v.quality_score,0) < ch.quality_threshold THEN f := f||to_jsonb('quality '||COALESCE(v.quality_score,0)||' below threshold '||ch.quality_threshold); END IF;
  IF (ca_setting('publish_requires_visual_qa','true'))#>>'{}'='true' AND COALESCE((v.qa->>'visual_pass')::boolean,false)=false THEN f := f||to_jsonb('visual QA missing or failed'::text); END IF;
  prob := ca_platform_account_problem(c.channel_id,p_platform); IF prob IS NOT NULL THEN f := f||to_jsonb(prob); END IF;
  IF COALESCE((ca_setting('adapter_verified_'||p_platform,'false'))#>>'{}','false')<>'true' THEN f := f||to_jsonb('platform adapter not verified/enabled'::text); END IF;
  IF EXISTS (SELECT 1 FROM integration_health WHERE name='auth_'||c.channel_id::text AND state='open') THEN f := f||to_jsonb('channel authentication failure is open'::text); END IF;
  IF s.schedule_id IS NULL THEN f := f||to_jsonb('no schedule'::text);
  ELSIF s.scheduled_at > now()+interval '2 minutes' THEN f := f||to_jsonb('schedule not due'::text); END IF;
  RETURN jsonb_build_object('ok', jsonb_array_length(f)=0, 'failures', f, 'version', c.approved_version);
END $$ LANGUAGE plpgsql;

-- PUBLISH BEGIN: publication row per idempotency key. published(+post id)=duplicate; started/processing/ambiguous=AMBIGUOUS (never auto-retried);
-- failed=retry allowed (same row, bounded by max_publish_attempts). A schedule is only ever 'published' with a confirmed platform post id.
CREATE OR REPLACE FUNCTION ca_publish_begin(p_schedule uuid) RETURNS jsonb AS $$
DECLARE s schedules; c content; key text; pub publications; g jsonb; maxatt int := ((ca_setting('max_publish_attempts','4'))#>>'{}')::int; stuck int := ((ca_setting('stuck_publish_minutes','15'))#>>'{}')::int;
BEGIN
  SELECT * INTO s FROM schedules WHERE schedule_id=p_schedule FOR UPDATE;
  IF s.schedule_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  SELECT * INTO c FROM content WHERE content_id=s.content_id;
  key := s.content_id||':'||s.platform||':'||s.channel_id;
  SELECT * INTO pub FROM publications WHERE idempotency_key=key FOR UPDATE;
  IF pub.id IS NOT NULL THEN
    IF pub.status='published' AND COALESCE(trim(pub.platform_post_id),'')<>'' THEN
      IF s.status<>'published' THEN
        UPDATE schedules SET status='published', published_at=COALESCE(pub.published_at,now()), last_error=NULL WHERE schedule_id=p_schedule;   -- reconciliation of a CONFIRMED publication (platform post id exists)
        PERFORM ca_audit('system','publisher','reconcile_schedule_published','schedule',p_schedule,s.status,'published',jsonb_build_object('post_id',pub.platform_post_id),c.correlation_id);
      END IF;
      PERFORM ca_emit('publication.failed', s.content_id, c.correlation_id, jsonb_build_object('reason','duplicate_publication_prevented','key',key,'post_id',pub.platform_post_id));
      PERFORM ca_notify('CRITICAL','publish','Duplicate publication prevented on '||s.platform,'key '||key,'dup:'||key,s.content_id,c.correlation_id);
      RETURN jsonb_build_object('ok',false,'reason','duplicate_prevented','critical',true,'key',key);
    ELSIF pub.status='unsupported' THEN
      UPDATE schedules SET status='blocked', last_error='platform adapter unsupported' WHERE schedule_id=p_schedule;
      RETURN jsonb_build_object('ok',false,'reason','unsupported');
    ELSIF pub.status IN ('started','processing') AND s.status='publishing' AND pub.updated_at > now()-make_interval(mins=>stuck) THEN
      RETURN jsonb_build_object('ok',false,'reason','in_progress');            -- another execution is legitimately running: touch nothing
    ELSIF pub.status IN ('started','processing','ambiguous','published') THEN    -- 'published' without a post id is also ambiguous
      UPDATE publications SET status='ambiguous', error=COALESCE(error,'outcome unknown; reconciliation required before any retry') WHERE id=pub.id;
      UPDATE schedules SET status='failed', last_error='ambiguous publication: verify on the platform, then POST ca-api-publication-reconcile' WHERE schedule_id=p_schedule;
      PERFORM ca_emit('publication.failed', s.content_id, c.correlation_id, jsonb_build_object('reason','ambiguous_publication','key',key));
      PERFORM ca_audit('system','publisher','publication_ambiguous','schedule',p_schedule,s.status,'failed',jsonb_build_object('publication_status',pub.status),c.correlation_id);
      PERFORM ca_notify('CRITICAL','publish','Publication outcome unknown on '||s.platform,'Do not retry blindly. Check the platform, then reconcile. key '||key,'amb:'||key,s.content_id,c.correlation_id);
      RETURN jsonb_build_object('ok',false,'reason','ambiguous_needs_reconciliation','critical',true,'key',key);
    END IF;
  END IF;
  IF s.status <> 'scheduled' THEN RETURN jsonb_build_object('ok',false,'reason','not_due','status',s.status); END IF;
  g := ca_publish_gate(s.content_id, s.platform);
  IF NOT (g->>'ok')::boolean THEN
    UPDATE schedules SET status='blocked', last_error=left(g->>'failures',500) WHERE schedule_id=p_schedule;
    INSERT INTO errors(category,severity,retryable,workflow,entity_id,message,details,correlation_id)
      VALUES (CASE WHEN g->>'failures' ~* 'rights' THEN 'RIGHTS' WHEN g->>'failures' ~* 'policy' THEN 'POLICY' WHEN g->>'failures' ~* 'authentication' THEN 'AUTH' ELSE 'VALIDATION' END,
              'critical',false,'publish_gate',s.content_id,'Pre-publish gate failed: '||left(g->>'failures',500),g,c.correlation_id);
    PERFORM ca_emit('publication.failed', s.content_id, c.correlation_id, jsonb_build_object('reason','pre_publish_gate','failures',g->'failures','platform',s.platform));
    PERFORM ca_notify('CRITICAL','publish','Publication stopped by safety gate ('||s.platform||')',g->>'failures','gate:'||s.content_id||':'||s.platform||':'||md5(g->>'failures'),s.content_id,c.correlation_id);
    IF g->>'failures' ~* 'stale' THEN   -- policy freshness: force an official-policy refresh (bounded: one per hour per source)
      PERFORM ca_enqueue('monetization_policy',c.source_id,c.correlation_id,jsonb_build_object('channel_id',c.channel_id,'force_refresh',true),6,'policy-refresh:'||c.source_id||':'||to_char(now(),'YYYYMMDDHH24'));
    END IF;
    RETURN jsonb_build_object('ok',false,'reason','gate_failed','failures',g->'failures');
  END IF;
  IF pub.id IS NOT NULL AND pub.status='failed' AND s.publication_attempts >= maxatt THEN
    UPDATE schedules SET status='failed', last_error='retry limit reached' WHERE schedule_id=p_schedule;
    RETURN jsonb_build_object('ok',false,'reason','retry_limit');
  END IF;
  INSERT INTO publications(schedule_id,content_id,channel_id,platform,version,idempotency_key,status)
  VALUES (s.schedule_id,s.content_id,s.channel_id,s.platform,c.approved_version,key,'started')
  ON CONFLICT (idempotency_key) DO UPDATE SET status='started', version=EXCLUDED.version, error=NULL WHERE publications.status='failed'
  RETURNING * INTO pub;
  IF pub.id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','duplicate_prevented','critical',true,'key',key); END IF;
  UPDATE schedules SET status='publishing', publication_attempts=publication_attempts+1 WHERE schedule_id=p_schedule;
  PERFORM ca_emit('publication.started', s.content_id, c.correlation_id, jsonb_build_object('platform',s.platform,'version',pub.version));
  RETURN jsonb_build_object('ok',true,'publication_id',pub.id,'version',pub.version,'content_id',s.content_id,'channel_id',s.channel_id,'platform',s.platform,'schedule_id',s.schedule_id);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ca_publish_result(p_pub uuid, p_ok boolean, p_post_id text, p_error text, p_category text DEFAULT 'UNKNOWN') RETURNS void AS $$
DECLARE pub publications; s schedules; c content; cnt_open int; integ text;
BEGIN
  SELECT * INTO pub FROM publications WHERE id=p_pub FOR UPDATE;
  IF pub.id IS NULL THEN RAISE EXCEPTION 'VALIDATION: unknown publication id %', p_pub; END IF;
  SELECT * INTO s FROM schedules WHERE schedule_id=pub.schedule_id FOR UPDATE; SELECT * INTO c FROM content WHERE content_id=pub.content_id;
  integ := CASE pub.platform WHEN 'youtube' THEN 'youtube_upload' ELSE pub.platform END;
  IF pub.status='published' THEN RETURN; END IF;                       -- repeated success/failure callbacks are harmless: a confirmed publication never changes
  IF p_ok AND COALESCE(trim(p_post_id),'')='' THEN p_ok := false; p_category := 'AMBIGUOUS'; p_error := 'platform reported success without a post id'; END IF;   -- success REQUIRES a platform id
  IF p_ok THEN
    UPDATE publications SET status='published',platform_post_id=p_post_id,published_at=now(),error=NULL WHERE id=p_pub;
    UPDATE schedules SET status='published',published_at=now(),last_error=NULL WHERE schedule_id=s.schedule_id;
    PERFORM ca_circuit_record(integ,true);
    PERFORM ca_emit('publication.completed',pub.content_id,c.correlation_id,jsonb_build_object('platform',pub.platform,'post_id',p_post_id));
    SELECT count(*) INTO cnt_open FROM schedules WHERE content_id=pub.content_id AND status NOT IN ('published','cancelled');
    IF cnt_open=0 THEN UPDATE content SET status='published' WHERE content_id=pub.content_id; UPDATE approvals SET status='published' WHERE content_id=pub.content_id AND status='scheduled'; END IF;
    PERFORM ca_notify('IMPORTANT','publish','Published on '||pub.platform,'content '||pub.content_id||' post '||p_post_id,'pub-ok:'||pub.idempotency_key,pub.content_id,c.correlation_id);
    RETURN;
  END IF;
  IF p_category='AMBIGUOUS' THEN       -- upload may have happened: NEVER retried automatically
    UPDATE publications SET status='ambiguous',error=left(p_error,1000) WHERE id=p_pub;
    UPDATE schedules SET status='failed',last_error='ambiguous publication: verify on the platform, then POST ca-api-publication-reconcile' WHERE schedule_id=s.schedule_id;
    PERFORM ca_notify('CRITICAL','publish','Publication outcome unknown on '||pub.platform,left(p_error,600),'amb:'||pub.idempotency_key,pub.content_id,c.correlation_id);
    PERFORM ca_emit('publication.failed',pub.content_id,c.correlation_id,jsonb_build_object('platform',pub.platform,'category','AMBIGUOUS'));
    RETURN;
  END IF;
  UPDATE publications SET status=CASE WHEN p_category='UNSUPPORTED' THEN 'unsupported' ELSE 'failed' END,error=left(p_error,1000) WHERE id=p_pub;
  IF p_category='AUTH' THEN
    PERFORM ca_circuit_record('auth_'||pub.channel_id::text,false,p_error);
    UPDATE integration_health SET state='open',failure_threshold=1,opened_at=now() WHERE name='auth_'||pub.channel_id::text;
  END IF;
  INSERT INTO errors(category,severity,retryable,workflow,entity_id,message,correlation_id)
    VALUES (CASE WHEN p_category='UNSUPPORTED' THEN 'VALIDATION' ELSE p_category END, CASE WHEN p_category IN ('AUTH','POLICY','RIGHTS') THEN 'critical' ELSE 'error' END,
            p_category IN ('TRANSIENT','RATE_LIMIT','PROVIDER'),'publishing',pub.content_id,left(p_error,1000),c.correlation_id);
  IF p_category IN ('TRANSIENT','RATE_LIMIT','PROVIDER') AND s.publication_attempts < ((ca_setting('max_publish_attempts','4'))#>>'{}')::int THEN
    UPDATE schedules SET status='scheduled',last_error=left(p_error,500),scheduled_at=now()+make_interval(mins=>LEAST(5*s.publication_attempts*s.publication_attempts,120)) WHERE schedule_id=s.schedule_id;   -- definite failure (upload not performed): bounded backoff retry
  ELSE
    UPDATE schedules SET status='failed',last_error=left(p_error,500) WHERE schedule_id=s.schedule_id;
    PERFORM ca_notify('CRITICAL','publish','Publishing failed on '||pub.platform||' ('||p_category||')',left(p_error,800),'pub-fail:'||pub.idempotency_key,pub.content_id,c.correlation_id);
  END IF;
  PERFORM ca_emit('publication.failed',pub.content_id,c.correlation_id,jsonb_build_object('platform',pub.platform,'category',p_category,'error',left(p_error,300)));
END $$ LANGUAGE plpgsql;

-- Human reconciliation of an ambiguous publication (after checking the platform).
CREATE OR REPLACE FUNCTION ca_publication_reconcile(p jsonb) RETURNS jsonb AS $$
DECLARE pub publications; s schedules; outcome text := p->>'outcome'; actor text := COALESCE(NULLIF(trim(p->>'by'),''),'owner');
BEGIN
  SELECT * INTO pub FROM publications WHERE id=(p->>'publication_id')::uuid FOR UPDATE;
  IF pub.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','NOT_FOUND','message','publication not found'); END IF;
  IF pub.status NOT IN ('ambiguous','started','processing') THEN RETURN jsonb_build_object('ok',false,'error','CONFLICT','message','publication is '||pub.status||', nothing to reconcile'); END IF;
  IF COALESCE(trim(p->>'reason'),'')='' THEN RETURN jsonb_build_object('ok',false,'error','VALIDATION','message','reason is required'); END IF;
  SELECT * INTO s FROM schedules WHERE schedule_id=pub.schedule_id FOR UPDATE;
  IF outcome='published' THEN
    IF COALESCE(trim(p->>'post_id'),'')='' THEN RETURN jsonb_build_object('ok',false,'error','VALIDATION','message','post_id is required to confirm a publication'); END IF;
    UPDATE publications SET status='published',platform_post_id=p->>'post_id',published_at=COALESCE(published_at,now()),error=NULL WHERE id=pub.id;
    UPDATE schedules SET status='published',published_at=now(),last_error=NULL WHERE schedule_id=s.schedule_id;
    UPDATE content SET status='published' WHERE content_id=pub.content_id AND NOT EXISTS (SELECT 1 FROM schedules x WHERE x.content_id=pub.content_id AND x.status NOT IN ('published','cancelled'));
  ELSIF outcome='not_published' THEN
    UPDATE publications SET status='failed',error='human confirmed: not published ('||left(p->>'reason',200)||')' WHERE id=pub.id;
    UPDATE schedules SET status='scheduled',scheduled_at=now(),last_error=NULL WHERE schedule_id=s.schedule_id;
  ELSE RETURN jsonb_build_object('ok',false,'error','VALIDATION','message','outcome must be published|not_published'); END IF;
  PERFORM ca_audit('user',actor,'publication_reconcile','publication',pub.id,pub.status,outcome,jsonb_build_object('reason',p->>'reason','post_id',p->>'post_id'));
  RETURN jsonb_build_object('ok',true,'outcome',outcome);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ca_schedule_content(p_job uuid) RETURNS jsonb AS $$
DECLARE j jobs; c content; ch channels; plat text; slot timestamptz; n int := 0; missing text[] := '{}'; bad text[] := '{}'; prob text;
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE;
  IF j.status <> 'running' THEN RETURN jsonb_build_object('skipped','job_not_running','status',j.status); END IF;
  SELECT * INTO c FROM content WHERE content_id=j.entity_id; SELECT * INTO ch FROM channels WHERE id=c.channel_id;
  IF c.approved_version IS NULL THEN PERFORM ca_job_fail(p_job,'VALIDATION','content has no approved version'); RETURN jsonb_build_object('ok',false); END IF;
  FOREACH plat IN ARRAY ch.platforms LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM schedules WHERE content_id=c.content_id AND platform=plat);
    prob := ca_platform_account_problem(ch.id,plat);
    IF prob IS NOT NULL THEN bad := bad||(plat||': '||prob); CONTINUE; END IF;      -- fail closed: no schedule that cannot publish
    slot := ca_pick_slot(ch.id,plat);
    IF slot IS NULL THEN missing := missing||plat; CONTINUE; END IF;
    INSERT INTO schedules(content_id,channel_id,platform,scheduled_at,timezone) VALUES (c.content_id,ch.id,plat,slot,ch.timezone) ON CONFLICT DO NOTHING;
    n := n+1;
  END LOOP;
  IF n>0 THEN
    UPDATE approvals SET status='scheduled' WHERE content_id=c.content_id AND status='approved';
    UPDATE content SET status='scheduled' WHERE content_id=c.content_id;
    PERFORM ca_emit('schedule.created',c.content_id,c.correlation_id,jsonb_build_object('platforms_scheduled',n));
    PERFORM ca_notify('IMPORTANT','schedule','Content scheduled','content '||c.content_id||' scheduled on '||n||' platform(s)','sched-note:'||c.content_id||':'||c.approved_version,c.content_id,c.correlation_id);
  END IF;
  IF cardinality(missing)>0 THEN PERFORM ca_notify('IMPORTANT','schedule','No publishing window configured for '||array_to_string(missing,','),'Set channels.preferred_windows for channel '||ch.id,'nowin:'||ch.id,ch.id,c.correlation_id); END IF;
  IF cardinality(bad)>0 THEN
    PERFORM ca_notify('IMPORTANT','schedule','Not scheduled: platform account problem',array_to_string(bad,'; '),'badacct:'||c.content_id||':'||md5(array_to_string(bad,';')),c.content_id,c.correlation_id);
    INSERT INTO errors(category,severity,retryable,workflow,entity_id,message,correlation_id) VALUES ('VALIDATION','warning',false,'scheduling',c.content_id,left(array_to_string(bad,'; '),900),c.correlation_id);
  END IF;
  PERFORM ca_job_done(p_job,jsonb_build_object('scheduled',n,'missing_windows',missing,'platform_account_problems',bad));
  RETURN jsonb_build_object('ok',true,'scheduled',n,'missing_windows',missing,'platform_account_problems',bad);
END $$ LANGUAGE plpgsql;

-- supervisor: ambiguous parking now marks the PUBLICATION ambiguous (human reconcile required before any retry)
CREATE OR REPLACE FUNCTION ca_supervisor_tick() RETURNS jsonb AS $$
DECLARE recovered int; halfopen int; delayed int; res resource_snapshots; parked int := 0; r record;
BEGIN
  recovered := ca_recover_stuck(((ca_setting('stuck_job_minutes','90'))#>>'{}')::int);
  UPDATE integration_health SET state='half_open' WHERE state='open' AND opened_at + make_interval(secs=>cooldown_seconds) <= now() AND name NOT LIKE 'auth\_%';
  GET DIAGNOSTICS halfopen = ROW_COUNT;
  FOR r IN SELECT s.schedule_id,s.content_id,s.platform FROM schedules s WHERE s.status='publishing' AND s.updated_at < now()-make_interval(mins=>((ca_setting('stuck_publish_minutes','15'))#>>'{}')::int) LOOP
    UPDATE schedules SET status='failed', last_error='ambiguous publication (stuck in publishing): verify on the platform, then POST ca-api-publication-reconcile; never auto-retried' WHERE schedule_id=r.schedule_id;
    UPDATE publications SET status='ambiguous', error='stuck in publishing; outcome unknown' WHERE schedule_id=r.schedule_id AND status IN ('started','processing');
    PERFORM ca_notify('CRITICAL','publish','Publication outcome unknown on '||r.platform,'content '||r.content_id||' was stuck in publishing. Check the platform for a published post, then reconcile.','stuck-pub:'||r.schedule_id,r.content_id,NULL);
    parked := parked+1;
  END LOOP;
  SELECT count(*) INTO delayed FROM jobs j JOIN job_type_config c USING(job_type) WHERE c.heavy AND j.status IN ('queued','retrying')
    AND j.created_at < now()-make_interval(mins=>((ca_setting('backlog_notify_minutes','120'))#>>'{}')::int);
  IF delayed>0 THEN PERFORM ca_notify('IMPORTANT','resource',delayed||' heavy job(s) delayed by resource limits or open circuit','Check disk/CPU thresholds and integration_health','backlog:'||to_char(now(),'YYYY-MM-DD-HH24'),NULL,NULL); END IF;
  IF recovered>0 THEN PERFORM ca_emit('worker.recovered',NULL,NULL,jsonb_build_object('recovered_jobs',recovered),'supervisor'); END IF;
  IF EXISTS (SELECT 1 FROM jobs WHERE status='dead_letter' AND finished_at>now()-interval '1 day') THEN
    PERFORM ca_notify('CRITICAL','system','Dead-lettered jobs need human attention',(SELECT string_agg(job_type||':'||left(COALESCE(error_message,''),80),'; ') FROM jobs WHERE status='dead_letter' AND finished_at>now()-interval '1 day'),'dead:'||to_char(now(),'YYYY-MM-DD'),NULL,NULL); END IF;
  SELECT * INTO res FROM resource_snapshots ORDER BY id DESC LIMIT 1;
  IF FOUND AND res.disk_free_gb IS NOT NULL AND res.disk_free_gb < ((ca_setting('min_free_disk_gb','8'))#>>'{}')::numeric THEN
    PERFORM ca_notify('CRITICAL','storage','Low disk space: '||res.disk_free_gb||' GB free','Heavy video jobs are paused until space is freed.','disk:'||to_char(now(),'YYYY-MM-DD'),NULL,NULL); END IF;
  DELETE FROM resource_snapshots WHERE captured_at < now()-interval '3 days';
  RETURN jsonb_build_object('recovered_stuck',recovered,'circuits_half_open',halfopen,'delayed_heavy',delayed,'publications_parked',parked);
END $$ LANGUAGE plpgsql;

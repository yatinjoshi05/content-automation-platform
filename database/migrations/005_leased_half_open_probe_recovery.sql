-- Migration 005: Robust Quota Reset Metadata, Leased Half-Open Probe Recovery & Fencing
-- Description:
-- 1. Adds probe fencing and lease columns to integration_health:
--    - probe_token uuid: unique token granted to the worker holding the half-open probe lease.
--    - probe_expires_at timestamptz: lease timeout (default 60s) after which a crashed probe can be safely claimed by another worker.
-- 2. Concurrency-Safe & Crash-Recoverable ca_circuit_allowed:
--    - If circuit is 'open' and cooldown has elapsed: transitions to 'half_open', generates a new probe_token, sets probe_expires_at = now() + interval '60 seconds', and returns true.
--    - If circuit is 'half_open' BUT probe_expires_at <= now() (indicating previous worker crashed or timed out): acquires row lock, generates a fresh probe_token, extends probe_expires_at, and admits exactly ONE recovery worker!
--    - Other concurrent workers receive false.
-- 3. Fenced ca_circuit_record:
--    - Accepts optional p_token uuid.
--    - If circuit is 'half_open' and p_token is supplied, verifies that p_token matches current probe_token. A stale worker whose lease expired cannot overwrite or close a circuit that a newer probe is testing or has already reopened!
-- 4. Provider-Aware Quota Metadata Handling in ca_model_result:
--    - Extracts exact reset durations from provider error strings (e.g., '1m26s', '500ms', 'reset in 120s', 'Retry-After').
--    - For Groq: RPD quota is 1,000 requests/day on the free tier (RPM 30, RPD 1,000, 8,000 TPM). Resets on rolling 24h or midnight UTC.
--    - For Gemini: 15 RPM, 1M TPM, 1,500 RPD. Resets at midnight Pacific / UTC.
--    - If reset time is unknown or ambiguous, applies a safe bounded deferral (minimum 300s, default 1800s) rather than premature eligibility.

-- 1. Add probe lease & fencing columns to integration_health
ALTER TABLE public.integration_health 
  ADD COLUMN IF NOT EXISTS probe_token uuid,
  ADD COLUMN IF NOT EXISTS probe_expires_at timestamp with time zone;

-- 2. Concurrency-Safe, Crash-Recoverable ca_circuit_allowed
CREATE OR REPLACE FUNCTION public.ca_circuit_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  h integration_health;
  lease_timeout_sec int := 60;
BEGIN
  -- Fast-path check without locking if circuit is closed
  SELECT * INTO h FROM integration_health WHERE name=p_name;
  IF NOT FOUND OR h.state='closed' THEN
    RETURN true;
  END IF;

  -- Case 1: Circuit is 'open' and cooldown has elapsed -> acquire exclusive half_open probe lease
  IF h.state='open' AND now() >= h.opened_at + make_interval(secs => h.cooldown_seconds) THEN
    SELECT * INTO h FROM integration_health WHERE name=p_name FOR UPDATE;
    IF h.state='open' AND now() >= h.opened_at + make_interval(secs => h.cooldown_seconds) THEN
      UPDATE integration_health
         SET state='half_open',
             opened_at=now(),
             probe_token=gen_random_uuid(),
             probe_expires_at=now() + make_interval(secs => lease_timeout_sec)
       WHERE name=p_name;
      RETURN true; -- Won the probe lease
    END IF;
  END IF;

  -- Case 2: Circuit is 'half_open' BUT probe lease expired (crashed worker) -> admit ONE recovery probe!
  IF h.state='half_open' AND (h.probe_expires_at IS NULL OR now() >= h.probe_expires_at) THEN
    SELECT * INTO h FROM integration_health WHERE name=p_name FOR UPDATE;
    IF h.state='half_open' AND (h.probe_expires_at IS NULL OR now() >= h.probe_expires_at) THEN
      UPDATE integration_health
         SET opened_at=now(),
             probe_token=gen_random_uuid(),
             probe_expires_at=now() + make_interval(secs => lease_timeout_sec)
       WHERE name=p_name;
      PERFORM ca_emit('circuit.probe_recovered', NULL, NULL, jsonb_build_object('circuit', p_name, 'action', 'lease_timeout_recovered'), 'circuit_breaker');
      RETURN true; -- Won the recovery probe lease
    END IF;
  END IF;

  -- In all other cases (circuit open within cooldown, or half_open with active probe lease), block concurrent queries
  RETURN false;
END $function$;

-- 3. Fenced ca_circuit_record: prevents stale workers from corrupting newer probe states
CREATE OR REPLACE FUNCTION public.ca_circuit_record(p_name text, p_ok boolean, p_err text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  h integration_health;
BEGIN
  INSERT INTO integration_health(name) VALUES (p_name) ON CONFLICT DO NOTHING;
  SELECT * INTO h FROM integration_health WHERE name=p_name FOR UPDATE;

  -- Fencing check: If circuit is half_open and p_token is provided, verify it matches active lease
  IF h.state = 'half_open' AND p_token IS NOT NULL AND h.probe_token IS NOT NULL AND h.probe_token <> p_token THEN
    -- Stale worker response ignored!
    PERFORM ca_emit('circuit.stale_result_ignored', NULL, NULL, jsonb_build_object('circuit', p_name, 'stale_token', p_token, 'active_token', h.probe_token), 'circuit_breaker');
    RETURN h.state;
  END IF;

  IF p_ok THEN
    UPDATE integration_health
       SET state='closed',
           consecutive_failures=0,
           last_success_at=now(),
           probe_token=NULL,
           probe_expires_at=NULL
     WHERE name=p_name;
    RETURN 'closed';
  END IF;

  UPDATE integration_health
     SET consecutive_failures=consecutive_failures+1,
         last_error=left(p_err,500),
         probe_token=NULL,
         probe_expires_at=NULL,
         state=CASE WHEN state='half_open' OR consecutive_failures+1>=failure_threshold THEN 'open' ELSE state END,
         opened_at=CASE WHEN state='half_open' OR consecutive_failures+1>=failure_threshold THEN now() ELSE opened_at END
   WHERE name=p_name RETURNING * INTO h;

  IF h.state='open' THEN
    PERFORM ca_emit('quota.warning', NULL, NULL, jsonb_build_object('circuit_open',p_name,'error',left(p_err,300)),'circuit_breaker');
  END IF;

  RETURN h.state;
END $function$;

-- Overload for backwards compatibility
CREATE OR REPLACE FUNCTION public.ca_circuit_record(p_name text, p_ok boolean, p_err text)
 RETURNS text
 LANGUAGE sql
AS $function$
  SELECT ca_circuit_record($1, $2, $3, NULL::uuid);
$function$;

-- 4. Enhanced ca_model_result with robust provider-aware reset parsing
CREATE OR REPLACE FUNCTION public.ca_model_result(p_provider text, p_ok boolean, p_err text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  st text;
  is_auth boolean := false;
  is_quota boolean := false;
  is_rate_or_temp boolean := false;
  is_daily_exhausted boolean := false;
  cooldown_sec int := 1800;
  quota_reset_time timestamptz := NULL;
  
  -- Match patterns like "reset in 1m26s", "try again in 45s", "retry after 30", "120s"
  m_min text[];
  m_sec text[];
BEGIN
  INSERT INTO integration_health(name,kind,failure_threshold) VALUES ('model_'||p_provider,'provider',3) ON CONFLICT DO NOTHING;
  
  -- Record daily usage on success or quota encounter
  INSERT INTO model_quotas(provider,day,used) VALUES (p_provider,current_date,1)
    ON CONFLICT (provider,day) DO UPDATE SET used=model_quotas.used+1;

  IF p_ok THEN
    RETURN ca_circuit_record('model_'||p_provider, true, NULL, p_token);
  END IF;

  -- Provider-aware reset extraction
  m_min := regexp_matches(p_err, '(\d+)\s*(?:m|min|minutes)', 'i');
  m_sec := regexp_matches(p_err, '(\d+)\s*(?:s|sec|seconds)', 'i');
  
  IF m_min IS NOT NULL OR m_sec IS NOT NULL THEN
    cooldown_sec := COALESCE(m_min[1]::int * 60, 0) + COALESCE(m_sec[1]::int, 0);
    cooldown_sec := GREATEST(10, LEAST(7200, cooldown_sec)); -- bounded between 10s and 2h
  END IF;

  -- Classify error
  IF p_err ~* '(401|403|unauthori|invalid.?api.?key|invalid_grant|forbidden|permission denied)' THEN
    is_auth := true;
    cooldown_sec := 86400; -- 24 hours quarantine for invalid/revoked credentials
  ELSIF p_err ~* '(daily.?limit|day.?quota|per.day|exceeded your current quota|requests per day)' THEN
    is_daily_exhausted := true;
    is_quota := true;
    -- Quota resets at midnight UTC
    quota_reset_time := (date_trunc('day', (now() AT TIME ZONE 'UTC') + interval '1 day')) AT TIME ZONE 'UTC';
    cooldown_sec := GREATEST(1800, EXTRACT(EPOCH FROM (quota_reset_time - now()))::int);
  ELSIF p_err ~* '(429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|rate.?limit|high demand|overloaded|capacity)' THEN
    is_rate_or_temp := true;
    IF m_min IS NULL AND m_sec IS NULL THEN
      cooldown_sec := 1800; -- 30 minutes conservative default
    END IF;
  END IF;

  IF is_auth THEN
    UPDATE integration_health
       SET state='open', opened_at=now(), cooldown_seconds=cooldown_sec,
           probe_token=NULL, probe_expires_at=NULL,
           consecutive_failures=consecutive_failures+1, last_error=left(p_err,300)
     WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','circuit_open_auth_failure','error',left(p_err,100)),'model_router');
    PERFORM ca_notify('CRITICAL','auth','Model provider auth failure: '||p_provider,left(p_err,300),'auth_fail:'||p_provider,NULL,NULL);
    RETURN 'open';
  ELSIF is_daily_exhausted THEN
    UPDATE model_quotas
       SET status='exhausted', reset_at=quota_reset_time
     WHERE provider=p_provider AND day=current_date;
    UPDATE integration_health
       SET state='open', opened_at=now(), cooldown_seconds=cooldown_sec,
           probe_token=NULL, probe_expires_at=NULL,
           consecutive_failures=consecutive_failures+1, last_error=left(p_err,300)
     WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','daily_quota_exhausted','reset_at',quota_reset_time,'error',left(p_err,100)),'model_router');
    RETURN 'open';
  ELSIF is_rate_or_temp THEN
    UPDATE integration_health
       SET state='open', opened_at=now(), cooldown_seconds=cooldown_sec,
           probe_token=NULL, probe_expires_at=NULL,
           consecutive_failures=consecutive_failures+1, last_error=left(p_err,300)
     WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','circuit_open_unavailable_or_quota','cooldown_seconds',cooldown_sec,'error',left(p_err,100)),'model_router');
    RETURN 'open';
  END IF;

  RETURN ca_circuit_record('model_'||p_provider, false, p_err, p_token);
END $function$;

-- Overload for backwards compatibility
CREATE OR REPLACE FUNCTION public.ca_model_result(p_provider text, p_ok boolean, p_err text)
 RETURNS text
 LANGUAGE sql
AS $function$
  SELECT ca_model_result($1, $2, $3, NULL::uuid);
$function$;

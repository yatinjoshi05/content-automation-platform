-- Migration 004: Reliability Closure - Independent Quota vs Circuit State, Concurrency-Safe Half-Open Probing, & Capacity-Aware Retry Limits
-- Description:
-- 1. Schema addition: add `reset_at` timestamptz to `model_quotas`.
-- 2. Concurrency-Safe `ca_circuit_allowed`: Uses FOR UPDATE on integration_health row to serialize the transition
--    from 'open' to 'half_open', ensuring exactly ONE probe trial occurs. If another worker queries while 'half_open',
--    it returns FALSE until the probe concludes (circuit closed or reopened).
-- 3. Independent Quota vs Circuit in `ca_pick_model`: Checks ca_circuit_allowed('model_'||provider) AND verifies
--    that the daily quota is active (COALESCE(q.status,'active') <> 'exhausted' OR (q.reset_at IS NOT NULL AND now() >= q.reset_at)).
-- 4. Capacity-Aware Resumption in `ca_job_fail`:
--    - When is_model_outage is true: does not increment `attempt` toward `max_attempts`. Computes next_retry_at
--      from the earliest of circuit cooldowns OR quota resets.
--    - When genuine failure occurs: increments `attempt`. Reaching max_attempts safely transitions to `dead_letter`.
-- 5. Updated `ca_model_result`: Extracts retry-after / reset window or calculates midnight UTC, populating `reset_at`
--    on `model_quotas`. Keeps quota reset independent from circuit cooldown.
-- 6. Updated `ca_models_status`: Accurately displays quota reset times, circuit states, and eligibility.

-- 1. Schema enhancement on model_quotas
ALTER TABLE public.model_quotas ADD COLUMN IF NOT EXISTS reset_at timestamp with time zone;

-- 2. Concurrency-Safe Half-Open Circuit Gating
CREATE OR REPLACE FUNCTION public.ca_circuit_allowed(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  h integration_health;
BEGIN
  -- Fast-path check without locking if circuit is closed
  SELECT * INTO h FROM integration_health WHERE name=p_name;
  IF NOT FOUND OR h.state='closed' THEN
    RETURN true;
  END IF;

  -- If open and cooldown has elapsed, acquire a row lock to serialize the single-probe transition
  IF h.state='open' AND now() >= h.opened_at + make_interval(secs => h.cooldown_seconds) THEN
    SELECT * INTO h FROM integration_health WHERE name=p_name FOR UPDATE;
    -- Re-check state inside lock
    IF h.state='open' AND now() >= h.opened_at + make_interval(secs => h.cooldown_seconds) THEN
      UPDATE integration_health
         SET state='half_open',
             opened_at=now() -- mark timestamp of probe start
       WHERE name=p_name;
      RETURN true; -- THIS worker won the exclusive probe lease
    END IF;
  END IF;

  -- If state is 'half_open', only the winner got true above. Other concurrent workers are blocked from probing.
  RETURN false;
END $function$;

-- 3. Enhance ca_model_result with independent quota reset tracking
CREATE OR REPLACE FUNCTION public.ca_model_result(p_provider text, p_ok boolean, p_err text DEFAULT NULL::text)
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
  retry_after_match text[];
BEGIN
  INSERT INTO integration_health(name,kind,failure_threshold) VALUES ('model_'||p_provider,'provider',3) ON CONFLICT DO NOTHING;
  
  -- Record daily usage on success or quota encounter
  INSERT INTO model_quotas(provider,day,used) VALUES (p_provider,current_date,1)
    ON CONFLICT (provider,day) DO UPDATE SET used=model_quotas.used+1;

  IF p_ok THEN
    RETURN ca_circuit_record('model_'||p_provider,true);
  END IF;

  -- Check for Retry-After header / provider error metadata (e.g., "retry in 120s" or "reset in 300s")
  retry_after_match := regexp_matches(p_err, '(?:retry|reset|wait)[^\d]*(\d+)\s*(s|sec|seconds|m|min|minutes)?', 'i');
  IF retry_after_match IS NOT NULL THEN
    IF retry_after_match[2] ~* 'm' THEN
      cooldown_sec := LEAST(7200, (retry_after_match[1]::int * 60));
    ELSE
      cooldown_sec := LEAST(7200, retry_after_match[1]::int);
    END IF;
  END IF;

  -- Classify error
  IF p_err ~* '(401|403|unauthori|invalid.?api.?key|invalid_grant|forbidden|permission denied)' THEN
    is_auth := true;
    cooldown_sec := 86400; -- 24 hours quarantine for invalid/revoked credentials
  ELSIF p_err ~* '(daily.?limit|day.?quota|per.day|exceeded your current quota)' THEN
    is_daily_exhausted := true;
    is_quota := true;
    -- Quota resets at midnight UTC
    quota_reset_time := (date_trunc('day', (now() AT TIME ZONE 'UTC') + interval '1 day')) AT TIME ZONE 'UTC';
    -- Circuit cooldown can be shorter or align with quota reset
    cooldown_sec := GREATEST(1800, EXTRACT(EPOCH FROM (quota_reset_time - now()))::int);
  ELSIF p_err ~* '(429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|rate.?limit|high demand|overloaded|capacity)' THEN
    is_rate_or_temp := true;
    IF retry_after_match IS NULL THEN
      cooldown_sec := 1800; -- 30 minutes default
    END IF;
  END IF;

  IF is_auth THEN
    UPDATE integration_health
       SET state='open', opened_at=now(), cooldown_seconds=cooldown_sec,
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
           consecutive_failures=consecutive_failures+1, last_error=left(p_err,300)
     WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','daily_quota_exhausted','reset_at',quota_reset_time,'error',left(p_err,100)),'model_router');
    RETURN 'open';
  ELSIF is_rate_or_temp THEN
    UPDATE integration_health
       SET state='open', opened_at=now(), cooldown_seconds=cooldown_sec,
           consecutive_failures=consecutive_failures+1, last_error=left(p_err,300)
     WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','circuit_open_unavailable_or_quota','cooldown_seconds',cooldown_sec,'error',left(p_err,100)),'model_router');
    RETURN 'open';
  END IF;

  RETURN ca_circuit_record('model_'||p_provider,false,p_err);
END $function$;

-- 4. Independent Quota and Circuit Eligibility in ca_pick_model
CREATE OR REPLACE FUNCTION public.ca_pick_model(p_caps text[], p_fallback boolean DEFAULT false)
 RETURNS SETOF models
 LANGUAGE sql
AS $function$
  SELECT m.* FROM models m
  LEFT JOIN model_quotas q ON q.provider=m.provider AND q.day=current_date
  WHERE m.enabled AND m.capabilities @> p_caps
    AND ca_circuit_allowed('model_'||m.provider)
    AND (q.daily_limit IS NULL OR COALESCE(q.used,0) < q.daily_limit)
    -- Crucial: Provider is ineligible if daily quota is exhausted AND reset_at has not passed
    AND (COALESCE(q.status, 'active') <> 'exhausted' OR (q.reset_at IS NOT NULL AND now() >= q.reset_at))
  ORDER BY CASE WHEN p_fallback THEN -m.priority ELSE m.priority END, m.quality_tier DESC
  LIMIT 1
$function$;

-- 5. Enhanced ca_job_fail with Independent Quota and Circuit Recovery Tracking
CREATE OR REPLACE FUNCTION public.ca_job_fail(p_job uuid, p_category text, p_message text)
 RETURNS jobs
 LANGUAGE plpgsql
AS $function$
DECLARE
  j jobs;
  retryable boolean;
  lvl int;
  delay_s int;
  cfg job_type_config;
  is_model_outage boolean;
  earliest_circuit timestamptz;
  earliest_quota timestamptz;
  earliest_recovery timestamptz;
BEGIN
  SELECT * INTO j FROM jobs WHERE job_id=p_job FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO cfg FROM job_type_config WHERE job_type=j.job_type;

  is_model_outage := (p_category = 'RESOURCE' AND p_message ~* '(no enabled model|quota|circuit|ALL_CIRCUITS_OPEN)');
  retryable := is_model_outage OR (p_category IN ('TRANSIENT','RATE_LIMIT','PROVIDER','RESOURCE','UNKNOWN'));

  IF cfg.integration IS NOT NULL THEN
    PERFORM ca_circuit_record(cfg.integration,false,p_message);
  END IF;

  INSERT INTO errors(category,severity,retryable,workflow,job_id,entity_id,message,correlation_id)
  VALUES (p_category,
          CASE WHEN p_category IN ('AUTH','POLICY','RIGHTS') THEN 'critical' WHEN retryable THEN 'warning' ELSE 'error' END,
          retryable, j.job_type, j.job_id, j.entity_id, left(p_message,1000), j.correlation_id);

  IF NOT retryable THEN
    UPDATE jobs
       SET status='blocked', error_code=p_category, error_message=left(p_message,1000), finished_at=now(), recovery_level=6
     WHERE job_id=p_job RETURNING * INTO j;
    PERFORM ca_emit('worker.failed', j.entity_id, j.correlation_id, jsonb_build_object('job_id',j.job_id,'category',p_category,'action','blocked_needs_human'));
    RETURN j;
  END IF;

  -- CAPACITY/OUTAGE DEFERRAL: Protects execution attempts from burning into dead_letter!
  IF is_model_outage THEN
    -- Find earliest circuit recovery among model integrations
    SELECT min(opened_at + make_interval(secs => cooldown_seconds))
      INTO earliest_circuit
      FROM integration_health
     WHERE name LIKE 'model_%' AND state IN ('open', 'half_open');

    -- Find earliest quota reset among model quotas
    SELECT min(reset_at)
      INTO earliest_quota
      FROM model_quotas
     WHERE day = current_date AND status = 'exhausted' AND reset_at IS NOT NULL;

    -- Pick the earliest reliable recovery point
    IF earliest_circuit IS NOT NULL AND earliest_quota IS NOT NULL THEN
      earliest_recovery := LEAST(earliest_circuit, earliest_quota);
    ELSE
      earliest_recovery := COALESCE(earliest_circuit, earliest_quota);
    END IF;

    IF earliest_recovery IS NOT NULL AND earliest_recovery > now() THEN
      delay_s := GREATEST(30, LEAST(EXTRACT(EPOCH FROM (earliest_recovery - now()))::int, 1800));
    ELSE
      delay_s := 300; -- default 5 min bounded wait
    END IF;

    -- Maintain status='retrying' and do NOT increment attempt count past max_attempts
    UPDATE jobs
       SET status='retrying',
           error_code=p_category,
           error_message=left(p_message,1000),
           recovery_level=GREATEST(j.recovery_level, 3),
           next_retry_at=now() + make_interval(secs=>delay_s),
           payload=payload || jsonb_build_object('use_fallback_provider', true, 'deferred_reason', 'MODEL_CAPACITY_EXHAUSTED')
     WHERE job_id=p_job RETURNING * INTO j;

    PERFORM ca_emit('model.outage_deferred', j.entity_id, j.correlation_id,
                    jsonb_build_object('job_id',j.job_id,'next_retry_at',j.next_retry_at,'delay_seconds',delay_s,'reason',left(p_message,100)));
    RETURN j;
  END IF;

  -- Genuine non-capacity failure: increment attempt count and enforce max_attempts
  IF j.attempt >= j.max_attempts THEN
    UPDATE jobs
       SET status='dead_letter', error_code=p_category, error_message=left(p_message,1000), finished_at=now(), recovery_level=6
     WHERE job_id=p_job RETURNING * INTO j;
    PERFORM ca_emit('worker.failed', j.entity_id, j.correlation_id, jsonb_build_object('job_id',j.job_id,'category',p_category,'action','dead_letter'));
    RETURN j;
  END IF;

  lvl := CASE WHEN j.attempt<=1 THEN 1 WHEN j.attempt<=3 THEN 2 WHEN j.attempt=4 THEN 3 ELSE 4 END;
  delay_s := CASE WHEN lvl=1 THEN 30 ELSE LEAST((2 ^ j.attempt)::int * 30, 3600) END;

  UPDATE jobs
     SET status='retrying',
         error_code=p_category,
         error_message=left(p_message,1000),
         recovery_level=lvl,
         next_retry_at=now()+make_interval(secs=>delay_s),
         payload=payload||jsonb_build_object('use_fallback_provider', lvl>=3)
   WHERE job_id=p_job RETURNING * INTO j;

  RETURN j;
END $function$;

-- 6. Updated ca_models_status view helper
CREATE OR REPLACE FUNCTION public.ca_models_status()
 RETURNS TABLE(
   provider text,
   model_id text,
   priority int,
   enabled boolean,
   circuit_state text,
   cooldown_remaining_sec int,
   daily_used int,
   daily_limit int,
   quota_status text,
   quota_reset_at timestamptz,
   eligible boolean
 )
 LANGUAGE sql
 AS $function$
   SELECT
     m.provider,
     m.model AS model_id,
     m.priority,
     m.enabled,
     COALESCE(h.state, 'closed') AS circuit_state,
     CASE
       WHEN h.state IN ('open', 'half_open') THEN GREATEST(0, EXTRACT(EPOCH FROM ((h.opened_at + make_interval(secs=>h.cooldown_seconds)) - now()))::int)
       ELSE 0
     END AS cooldown_remaining_sec,
     COALESCE(q.used, 0) AS daily_used,
     q.daily_limit,
     COALESCE(q.status, 'active') AS quota_status,
     q.reset_at AS quota_reset_at,
     (m.enabled AND (h.state IS NULL OR h.state = 'closed' OR (h.state = 'open' AND now() >= h.opened_at + make_interval(secs=>h.cooldown_seconds)))
      AND (q.daily_limit IS NULL OR COALESCE(q.used, 0) < q.daily_limit)
      AND (COALESCE(q.status, 'active') <> 'exhausted' OR (q.reset_at IS NOT NULL AND now() >= q.reset_at))) AS eligible
   FROM models m
   LEFT JOIN integration_health h ON h.name = 'model_' || m.provider
   LEFT JOIN model_quotas q ON q.provider = m.provider AND q.day = current_date
   ORDER BY m.priority ASC, m.quality_tier DESC;
 $function$;

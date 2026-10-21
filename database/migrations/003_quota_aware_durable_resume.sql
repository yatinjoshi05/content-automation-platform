-- Migration 003: Quota-Aware Durable Resumption, Smarter Circuit Classification & Auto-Resume
-- Description:
-- 1. Updates ca_model_result to intelligently classify errors (429/503/RESOURCE_EXHAUSTED/daily quota/AUTH 401/403)
--    and sets appropriate circuit cooldown / quota status.
-- 2. Updates ca_job_fail so that when a job encounters model or provider exhaustion (RESOURCE / ALL_CIRCUITS_OPEN),
--    it does NOT burn execution attempts into dead_letter. Instead, it defers the job with next_retry_at aligned
--    with the earliest model circuit cooldown (or default bounded 15-30m) and emits telemetry.
-- 3. Adds ca_models_status() helper to return operational visibility of all registered providers and circuits.

-- 1. Enhance ca_model_result
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
BEGIN
  INSERT INTO integration_health(name,kind,failure_threshold) VALUES ('model_'||p_provider,'provider',3) ON CONFLICT DO NOTHING;
  
  -- Record daily usage on success or quota encounter
  INSERT INTO model_quotas(provider,day,used) VALUES (p_provider,current_date,1)
    ON CONFLICT (provider,day) DO UPDATE SET used=model_quotas.used+1;

  IF p_ok THEN
    RETURN ca_circuit_record('model_'||p_provider,true);
  END IF;

  -- Classify error
  IF p_err ~* '(401|403|unauthori|invalid.?api.?key|invalid_grant|forbidden|permission denied)' THEN
    is_auth := true;
    cooldown_sec := 86400; -- 24 hours for invalid/revoked credentials
  ELSIF p_err ~* '(daily.?limit|day.?quota|per.day|exceeded your current quota)' THEN
    is_daily_exhausted := true;
    is_quota := true;
    -- Cooldown until midnight UTC or at least 4 hours
    cooldown_sec := GREATEST(14400, EXTRACT(EPOCH FROM (date_trunc('day', now() + interval '1 day') - now()))::int);
  ELSIF p_err ~* '(429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|rate.?limit|high demand|overloaded|capacity)' THEN
    is_rate_or_temp := true;
    cooldown_sec := 1800; -- 30 minutes
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
    UPDATE model_quotas SET status='exhausted' WHERE provider=p_provider AND day=current_date;
    UPDATE integration_health
       SET state='open', opened_at=now(), cooldown_seconds=cooldown_sec,
           consecutive_failures=consecutive_failures+1, last_error=left(p_err,300)
     WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','daily_quota_exhausted','cooldown_seconds',cooldown_sec,'error',left(p_err,100)),'model_router');
    RETURN 'open';
  ELSIF is_rate_or_temp THEN
    UPDATE integration_health
       SET state='open', opened_at=now(), cooldown_seconds=cooldown_sec,
           consecutive_failures=consecutive_failures+1, last_error=left(p_err,300)
     WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','circuit_open_unavailable_or_quota','error',left(p_err,100)),'model_router');
    RETURN 'open';
  END IF;

  RETURN ca_circuit_record('model_'||p_provider,false,p_err);
END $function$;

-- 2. Enhance ca_job_fail for Quota-Aware Durable Resumption
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

  -- SPECIAL HANDLING FOR TOTAL MODEL OUTAGE: Preserve job attempts without burning toward dead_letter!
  IF is_model_outage THEN
    -- Find earliest circuit recovery among model integrations
    SELECT min(opened_at + make_interval(secs => cooldown_seconds))
      INTO earliest_recovery
      FROM integration_health
     WHERE name LIKE 'model_%' AND state = 'open';

    IF earliest_recovery IS NOT NULL AND earliest_recovery > now() THEN
      delay_s := GREATEST(30, LEAST(EXTRACT(EPOCH FROM (earliest_recovery - now()))::int, 1800));
    ELSE
      delay_s := 300; -- default 5 min bounded wait if unknown
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

  -- Normal retryable handling
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

-- 3. Operational visibility helper
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
       WHEN h.state = 'open' THEN GREATEST(0, EXTRACT(EPOCH FROM ((h.opened_at + make_interval(secs=>h.cooldown_seconds)) - now()))::int)
       ELSE 0
     END AS cooldown_remaining_sec,
     COALESCE(q.used, 0) AS daily_used,
     q.daily_limit,
     (m.enabled AND (h.state IS NULL OR h.state = 'closed' OR (h.state = 'open' AND now() >= h.opened_at + make_interval(secs=>h.cooldown_seconds)))
      AND (q.daily_limit IS NULL OR COALESCE(q.used, 0) < q.daily_limit)
      AND COALESCE(q.status, 'active') <> 'exhausted') AS eligible
   FROM models m
   LEFT JOIN integration_health h ON h.name = 'model_' || m.provider
   LEFT JOIN model_quotas q ON q.provider = m.provider AND q.day = current_date
   ORDER BY m.priority ASC, m.quality_tier DESC;
 $function$;

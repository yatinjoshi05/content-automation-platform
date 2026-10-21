-- Migration 006: Provider Metadata Verification & Groq Quota Semantics
-- Applied for Mission 11G

-- 1. Register verified canonical Gemini model (gemini-3.6-flash)
-- Google API explicitly redirects gemini-3.5-flash to gemini-3.6-flash ("modelVersion": "gemini-3.6-flash").
-- Direct registration eliminates the aliasing hop.
INSERT INTO models (provider, kind, model, priority, enabled, capabilities, quality_tier, status)
VALUES ('gemini', 'gemini', 'gemini-3.6-flash', 10, true, ARRAY['text', 'json'], 1, 'active')
ON CONFLICT (provider, model) DO UPDATE 
  SET enabled = true, priority = 10, status = 'active';

-- Mark previous alias gemini-3.5-flash as aliased (disabled for direct picking)
UPDATE models 
   SET enabled = false, status = 'aliased_to_3.6' 
 WHERE provider = 'gemini' AND model = 'gemini-3.5-flash';

-- Mark retired/spiking models clearly
UPDATE models SET enabled = false, status = 'spikes_503' WHERE provider = 'gemini' AND model = 'gemini-3.8-flash';
UPDATE models SET enabled = false, status = 'retired_404' WHERE provider = 'gemini' AND model = 'gemini-2.0-flash';

-- 2. Enhanced ca_model_result with comprehensive multi-dimension quota parsing:
-- Distinguishes Requests Per Day (RPD / daily quota) from Tokens Per Minute (TPM / transient cooldown).
-- Parses hours, minutes, seconds, milliseconds, and retry-after.
-- Never truncates multi-hour daily resets into short circuit cooldowns.
CREATE OR REPLACE FUNCTION public.ca_model_result(
  p_provider text, 
  p_ok boolean, 
  p_err text DEFAULT NULL::text, 
  p_token uuid DEFAULT NULL::uuid
)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  is_auth boolean := false;
  is_daily_exhausted boolean := false;
  is_rate_or_temp boolean := false;
  cooldown_sec int := 1800;
  quota_reset_time timestamptz := NULL;
  parsed_duration_sec int := 0;

  -- Regex matches
  m_hr text[];
  m_min text[];
  m_sec text[];
  m_ms text[];
  m_retry text[];
  m_rem_req text[];
BEGIN
  INSERT INTO integration_health(name, kind, failure_threshold) 
  VALUES ('model_'||p_provider, 'provider', 3) 
  ON CONFLICT DO NOTHING;
  
  -- Record daily usage count
  INSERT INTO model_quotas(provider, day, used) 
  VALUES (p_provider, current_date, 1)
  ON CONFLICT (provider, day) DO UPDATE SET used = model_quotas.used + 1;

  IF p_ok THEN
    RETURN ca_circuit_record('model_'||p_provider, true, NULL, p_token);
  END IF;

  -- 1. Duration extraction (Hours, Minutes, Seconds, Milliseconds, and Retry-After)
  m_hr := regexp_matches(p_err, '(\d+)\s*(?:h|hr|hours)', 'i');
  m_min := regexp_matches(p_err, '(\d+)\s*(?:m|min|minutes)', 'i');
  m_sec := regexp_matches(p_err, '(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)', 'i');
  m_ms := regexp_matches(p_err, '(\d+(?:\.\d+)?)\s*(?:ms|milliseconds)', 'i');
  m_retry := regexp_matches(p_err, '(?:retry-after|retry_after)["'':\s]+(\d+)', 'i');
  m_rem_req := regexp_matches(p_err, 'x-ratelimit-remaining-requests["'':\s]+"?(\d+)"?', 'i');

  IF m_hr IS NOT NULL OR m_min IS NOT NULL OR m_sec IS NOT NULL OR m_ms IS NOT NULL THEN
    parsed_duration_sec := COALESCE(m_hr[1]::int * 3600, 0) + 
                           COALESCE(m_min[1]::int * 60, 0) + 
                           COALESCE(m_sec[1]::numeric::int, 0) +
                           CASE WHEN m_ms IS NOT NULL AND m_sec IS NULL AND m_min IS NULL AND m_hr IS NULL THEN 1 ELSE 0 END;
  ELSIF m_retry IS NOT NULL THEN
    parsed_duration_sec := m_retry[1]::int;
  END IF;

  -- 2. Quota Dimension Classification
  -- Dimension A: Authentication error
  IF p_err ~* '(401|403|unauthori|invalid.?api.?key|invalid_grant|forbidden|permission denied)' THEN
    is_auth := true;
    cooldown_sec := 86400; -- 24 hours quarantine for invalid/revoked credentials

  -- Dimension B: Requests Per Day (RPD / Daily Quota)
  -- Groq docs: x-ratelimit-limit-requests, x-ratelimit-remaining-requests, and x-ratelimit-reset-requests ALWAYS refer to RPD.
  ELSIF p_err ~* '(daily.?limit|day.?quota|per.day|exceeded your current quota|requests per day|\brpd\b|x-ratelimit-reset-requests)'
     OR (m_rem_req IS NOT NULL AND m_rem_req[1]::int = 0) THEN
    is_daily_exhausted := true;
    
    IF parsed_duration_sec > 0 THEN
      quota_reset_time := now() + make_interval(secs => parsed_duration_sec);
      cooldown_sec := parsed_duration_sec;
    ELSE
      -- Conservative bounded fallback: Midnight UTC
      quota_reset_time := (date_trunc('day', (now() AT TIME ZONE 'UTC') + interval '1 day')) AT TIME ZONE 'UTC';
      cooldown_sec := GREATEST(1800, EXTRACT(EPOCH FROM (quota_reset_time - now()))::int);
    END IF;

  -- Dimension C: Tokens Per Minute (TPM), Requests Per Minute (RPM), or Transient Server Overload (429/503)
  -- Groq docs: x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens, x-ratelimit-reset-tokens ALWAYS refer to TPM.
  ELSIF p_err ~* '(429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|rate.?limit|high demand|overloaded|capacity|\btpm\b|\brpm\b|tokens per minute|requests per minute|x-ratelimit-reset-tokens)' THEN
    is_rate_or_temp := true;
    
    IF parsed_duration_sec > 0 THEN
      -- TPM/RPM cooldowns are bounded between 5 seconds and 2 hours
      cooldown_sec := GREATEST(5, LEAST(7200, parsed_duration_sec));
    ELSE
      -- Conservative bounded deferral appropriate to quota dimension
      IF p_err ~* '(\btpm\b|\brpm\b|tokens per minute|requests per minute)' THEN
        cooldown_sec := 60; -- 1 minute conservative for per-minute limits
      ELSE
        cooldown_sec := 1800; -- 30 minutes conservative for 503/server capacity
      END IF;
    END IF;
  END IF;

  -- 3. State Application
  IF is_auth THEN
    UPDATE integration_health
       SET state = 'open', opened_at = now(), cooldown_seconds = cooldown_sec,
           probe_token = NULL, probe_expires_at = NULL,
           consecutive_failures = consecutive_failures + 1, last_error = left(p_err, 300)
     WHERE name = 'model_'||p_provider;
    PERFORM ca_emit('quota.warning', NULL, NULL, jsonb_build_object('provider', p_provider, 'action', 'circuit_open_auth_failure', 'error', left(p_err, 100)), 'model_router');
    PERFORM ca_notify('CRITICAL', 'auth', 'Model provider auth failure: '||p_provider, left(p_err, 300), 'auth_fail:'||p_provider, NULL, NULL);
    RETURN 'open';

  ELSIF is_daily_exhausted THEN
    -- Mark daily quota as exhausted with exact reset_at
    UPDATE model_quotas
       SET status = 'exhausted', reset_at = quota_reset_time
     WHERE provider = p_provider AND day = current_date;
     
    -- Circuit opened with cooldown matching the daily reset window (never prematurely expires)
    UPDATE integration_health
       SET state = 'open', opened_at = now(), cooldown_seconds = GREATEST(cooldown_sec, EXTRACT(EPOCH FROM (quota_reset_time - now()))::int),
           probe_token = NULL, probe_expires_at = NULL,
           consecutive_failures = consecutive_failures + 1, last_error = left(p_err, 300)
     WHERE name = 'model_'||p_provider;
     
    PERFORM ca_emit('quota.warning', NULL, NULL, jsonb_build_object('provider', p_provider, 'dimension', 'RPD', 'action', 'daily_quota_exhausted', 'reset_at', quota_reset_time, 'cooldown_seconds', cooldown_sec, 'error', left(p_err, 100)), 'model_router');
    RETURN 'open';

  ELSIF is_rate_or_temp THEN
    -- Daily quota remains active! Only transient circuit cooldown is opened.
    UPDATE integration_health
       SET state = 'open', opened_at = now(), cooldown_seconds = cooldown_sec,
           probe_token = NULL, probe_expires_at = NULL,
           consecutive_failures = consecutive_failures + 1, last_error = left(p_err, 300)
     WHERE name = 'model_'||p_provider;
     
    PERFORM ca_emit('quota.warning', NULL, NULL, jsonb_build_object('provider', p_provider, 'dimension', 'TPM_OR_TRANSIENT', 'action', 'circuit_open_unavailable_or_quota', 'cooldown_seconds', cooldown_sec, 'error', left(p_err, 100)), 'model_router');
    RETURN 'open';
  END IF;

  RETURN ca_circuit_record('model_'||p_provider, false, p_err, p_token);
END $function$;

-- Drop redundant 3-argument overload to prevent ambiguous function call errors in PostgreSQL
DROP FUNCTION IF EXISTS public.ca_model_result(text, boolean, text);

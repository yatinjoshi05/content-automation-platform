-- Migration 002: Enhance ca_model_result to immediately trip circuit breaker on 503/UNAVAILABLE/overloaded as well as 429
CREATE OR REPLACE FUNCTION public.ca_model_result(p_provider text, p_ok boolean, p_err text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE st text;
BEGIN
  INSERT INTO integration_health(name,kind,failure_threshold) VALUES ('model_'||p_provider,'provider',3) ON CONFLICT DO NOTHING;
  INSERT INTO model_quotas(provider,day,used) VALUES (p_provider,current_date,1)
    ON CONFLICT (provider,day) DO UPDATE SET used=model_quotas.used+1;
  IF p_ok THEN RETURN ca_circuit_record('model_'||p_provider,true); END IF;
  IF p_err ~* '(429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|quota|rate.?limit|high demand|overloaded)' THEN
    UPDATE integration_health SET state='open',opened_at=now(),cooldown_seconds=1800,consecutive_failures=consecutive_failures+1,last_error=left(p_err,300) WHERE name='model_'||p_provider;
    PERFORM ca_emit('quota.warning',NULL,NULL,jsonb_build_object('provider',p_provider,'action','circuit_open_unavailable_or_quota','error',left(p_err,100)),'model_router');
    RETURN 'open';
  END IF;
  RETURN ca_circuit_record('model_'||p_provider,false,p_err);
END $function$;

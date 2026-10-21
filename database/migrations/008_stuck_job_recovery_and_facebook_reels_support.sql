-- Migration 008: Stuck Job Recovery & Facebook Reels Support
-- Applied for Mission 12

-- 1. Hardened ca_recover_stuck function:
-- Protect against orphaned jobs where started_at is NULL by falling back to created_at/updated_at.
-- Prevents concurrency deadlock in max_concurrent_light_jobs queue slots.
CREATE OR REPLACE FUNCTION public.ca_recover_stuck(p_minutes integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE n int := 0; r record;
BEGIN
  FOR r IN SELECT job_id FROM jobs 
   WHERE (status='running' AND COALESCE(started_at, created_at, updated_at) < now() - make_interval(mins=>p_minutes))
      OR (status='waiting' AND updated_at < now() - make_interval(mins=>p_minutes*4))
  LOOP
    PERFORM ca_job_fail(r.job_id, 'TRANSIENT', 'stuck job recovered by supervisor');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

-- 2. Seed default Facebook configuration in settings table (fail-closed by default)
INSERT INTO settings(key, value)
VALUES ('facebook_default_privacy', '"EVERYONE"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings(key, value)
VALUES ('facebook_video_state', '"PUBLISHED"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings(key, value)
VALUES ('adapter_verified_facebook', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Eliminate ambiguous function overload for ca_circuit_record (caused by legacy 3-arg stub in migration 005)
DROP FUNCTION IF EXISTS public.ca_circuit_record(text, boolean, text);


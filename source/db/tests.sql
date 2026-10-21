-- Executable DB-level tests. Run: psql -v ON_ERROR_STOP=1 -d <db> -f tests.sql   (uses a rolled-back transaction)
\set QUIET on
BEGIN;
\o nul
CREATE TEMP TABLE t_results(name text, pass boolean, detail text);
CREATE OR REPLACE FUNCTION pg_temp.chk(n text, ok boolean, d text DEFAULT '') RETURNS void AS $$ INSERT INTO t_results VALUES (n, COALESCE(ok,false), d) $$ LANGUAGE sql;

INSERT INTO niches(slug,name) VALUES ('funny','Funny');
INSERT INTO channels(id,name,niche_id,platforms,autonomy_mode,preferred_windows,posts_per_day,min_gap_minutes,quality_threshold)
  SELECT '00000000-0000-0000-0000-0000000000c1','Ch A',id,'{youtube,instagram}','manual','[{"start":"09:00"},{"start":"19:30"}]',2,120,0.7 FROM niches WHERE slug='funny';
INSERT INTO channels(id,name,platforms,autonomy_mode,preferred_windows,posts_per_day)
  VALUES ('00000000-0000-0000-0000-0000000000c2','Ch B (new channel, zero workflow edits)','{youtube}','automatic','[{"start":"07:15"}]',1);

INSERT INTO platform_accounts(channel_id,platform,external_account_id,credential_ref) VALUES ('00000000-0000-0000-0000-0000000000c1','youtube',NULL,'TEST'),('00000000-0000-0000-0000-0000000000c1','instagram','ig-test-1','TEST'),('00000000-0000-0000-0000-0000000000c2','youtube',NULL,'TEST');
-- sources
INSERT INTO sources(source_id,canonical_id,normalized_url,source_platform) VALUES
 ('00000000-0000-0000-0000-0000000000a1','youtube:AAA','https://www.youtube.com/watch?v=AAA','youtube'),
 ('00000000-0000-0000-0000-0000000000a2','youtube:BBB','https://www.youtube.com/watch?v=BBB','youtube'),
 ('00000000-0000-0000-0000-0000000000a3','youtube:CCC','https://www.youtube.com/watch?v=CCC','youtube');
INSERT INTO permissions(source_id,permission_status,permission_evidence,allowed_platforms,verification_timestamp) VALUES
 ('00000000-0000-0000-0000-0000000000a1','verified','signed licence #12','{youtube,instagram,facebook}',now()),
 ('00000000-0000-0000-0000-0000000000a3','pending',NULL,'{}',NULL);

-- TEST 2/3: rights
SELECT pg_temp.chk('T2 verified rights proceed', ca_rights_gate('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1')->>'decision'='verified');
SELECT pg_temp.chk('T3a missing rights blocked', ca_rights_gate('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1')->>'decision'='blocked');
SELECT pg_temp.chk('T3b pending rights -> human_review', ca_rights_gate('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1')->>'decision'='human_review');
UPDATE permissions SET expiration_date=current_date-1 WHERE source_id='00000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.chk('T3c expired rights blocked', ca_rights_gate('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1')->>'decision'='blocked');
UPDATE permissions SET expiration_date=NULL WHERE source_id='00000000-0000-0000-0000-0000000000a1';

-- TEST 8: duplicate source
WITH q AS (INSERT INTO sources(canonical_id,normalized_url,source_platform) VALUES ('youtube:AAA','x','youtube') ON CONFLICT (canonical_id) DO NOTHING RETURNING 1)
SELECT pg_temp.chk('T8 duplicate source rejected by canonical_id', (SELECT count(*)=0 FROM q) AND (SELECT count(*)=1 FROM sources WHERE canonical_id='youtube:AAA'));
-- idempotent enqueue
CREATE TEMP TABLE t_enq AS SELECT job_id FROM ca_enqueue('clipping','00000000-0000-0000-0000-0000000000a1',NULL,'{}',5,'clip:k1');
INSERT INTO t_enq SELECT job_id FROM ca_enqueue('clipping','00000000-0000-0000-0000-0000000000a1',NULL,'{}',5,'clip:k1');
SELECT pg_temp.chk('enqueue idempotent (same key -> same job, one row)', (SELECT count(DISTINCT job_id)=1 FROM t_enq) AND (SELECT count(*)=1 FROM jobs WHERE idempotency_key='clip:k1'));
DO $$ BEGIN PERFORM ca_enqueue('rm_rf',NULL,NULL,'{}',5,'bad:1'); PERFORM pg_temp.chk('enqueue rejects non-allowlisted job type',false);
 EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.chk('enqueue rejects non-allowlisted job type',true); END $$;

-- Baseline nominal resource snapshot so host is monitored & healthy
INSERT INTO resource_snapshots(cpu_percent,ram_percent,disk_free_gb) VALUES (20,40,50);

-- TEST 6/7: retry ladder + circuit breaker + dead letter
UPDATE integration_health SET failure_threshold=3 WHERE name='openshorts';
DO $$ DECLARE j jobs; g jobs; BEGIN
  SELECT * INTO j FROM ca_claim_job();
  PERFORM ca_job_fail(j.job_id,'TRANSIENT','conn refused');
  SELECT * INTO g FROM jobs WHERE job_id=j.job_id;
  PERFORM pg_temp.chk('T6 transient failure -> retrying with backoff', g.status='retrying' AND g.next_retry_at>now() AND g.recovery_level=1, g.status||' L'||g.recovery_level);
END $$;
UPDATE jobs SET next_retry_at=now()-interval '1s' WHERE idempotency_key='clip:k1';
DO $$ DECLARE j jobs; BEGIN
  FOR i IN 1..2 LOOP  -- failures #2 and #3 (threshold=3)
    UPDATE jobs SET next_retry_at=now()-interval '1s' WHERE idempotency_key='clip:k1';
    SELECT * INTO j FROM ca_claim_job(); PERFORM ca_job_fail(j.job_id,'TRANSIENT','again '||i);
  END LOOP;
  PERFORM pg_temp.chk('T7a circuit opens after repeated failures', (SELECT state FROM integration_health WHERE name='openshorts')='open', (SELECT state FROM integration_health WHERE name='openshorts'));
END $$;
UPDATE jobs SET next_retry_at=now()-interval '1s' WHERE idempotency_key='clip:k1';
SELECT pg_temp.chk('T7b open circuit: no new clipping job claimed', (SELECT count(*)=0 FROM ca_claim_job()));
UPDATE jobs SET max_attempts=2 WHERE idempotency_key='clip:k1';
SELECT ca_job_fail(job_id,'TRANSIENT','final') FROM jobs WHERE idempotency_key='clip:k1';
SELECT pg_temp.chk('T7c exhausted attempts -> dead_letter (bounded)', (SELECT status FROM jobs WHERE idempotency_key='clip:k1')='dead_letter');
SELECT pg_temp.chk('non-retryable AUTH -> blocked', (SELECT status FROM ca_job_fail((SELECT job_id FROM ca_enqueue('scheduling',NULL,NULL,'{}',5,'s:auth')),'AUTH','token expired'))='blocked');
UPDATE integration_health SET state='closed',consecutive_failures=0 WHERE name='openshorts';

-- TEST 15: low disk and untrusted telemetry pause heavy jobs, light continue
UPDATE jobs SET status='queued', attempt=0, next_retry_at=NULL, max_attempts=5 WHERE idempotency_key='clip:k1';
-- 15a: low disk (2.5 GB < 8 GB)
INSERT INTO resource_snapshots(cpu_percent,ram_percent,disk_free_gb) VALUES (20,40,2.5);
SELECT ca_enqueue('trend_research',NULL,NULL,'{}',5,'tr:1');
SELECT pg_temp.chk('T15a low disk: heavy clipping job NOT claimed', NOT EXISTS (SELECT 1 FROM ca_claim_job() WHERE job_type='clipping'));
SELECT pg_temp.chk('T15b low disk: light jobs still run', (SELECT count(*)=1 FROM jobs WHERE job_type='trend_research' AND status='running'));

-- 15c: missing telemetry (table empty)
DELETE FROM resource_snapshots;
SELECT pg_temp.chk('T15c missing telemetry: heavy job NOT claimed', NOT EXISTS (SELECT 1 FROM ca_claim_job() WHERE job_type='clipping'));

-- 15d: stale telemetry (captured > 15 mins ago)
INSERT INTO resource_snapshots(captured_at,cpu_percent,ram_percent,disk_free_gb) VALUES (now() - interval '30 minutes',20,40,50);
SELECT pg_temp.chk('T15d stale telemetry: heavy job NOT claimed', NOT EXISTS (SELECT 1 FROM ca_claim_job() WHERE job_type='clipping'));

-- 15e: invalid telemetry (null disk_free_gb)
INSERT INTO resource_snapshots(cpu_percent,ram_percent,disk_free_gb) VALUES (20,40,NULL);
SELECT pg_temp.chk('T15e invalid telemetry (null disk): heavy job NOT claimed', NOT EXISTS (SELECT 1 FROM ca_claim_job() WHERE job_type='clipping'));

-- 15f: low disk on either drive (constrained min e.g. C: 3.5 GB, D: 50 GB => reported 3.5 GB)
INSERT INTO resource_snapshots(cpu_percent,ram_percent,disk_free_gb) VALUES (20,40,3.5);
SELECT pg_temp.chk('T15f dual-drive low margin: heavy job NOT claimed', NOT EXISTS (SELECT 1 FROM ca_claim_job() WHERE job_type='clipping'));

-- 15g: disk recovered (adequate disk space >= 8 GB, fresh telemetry)
INSERT INTO resource_snapshots(cpu_percent,ram_percent,disk_free_gb) VALUES (20,40,50);
SELECT pg_temp.chk('T15g disk recovered: heavy job claimed', (SELECT count(*)=1 FROM ca_claim_job() WHERE job_type='clipping'));

-- content / approval / schedule
INSERT INTO content(content_id,source_id,channel_id,current_version,status) VALUES
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1',1,'needs_approval'),
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c2',1,'needs_approval');
INSERT INTO content_versions(content_id,version,per_platform,quality_score) VALUES
 ('00000000-0000-0000-0000-0000000000d1',1,'{"youtube":{"title":"v1 title"}}',0.9),
 ('00000000-0000-0000-0000-0000000000d2',1,'{"youtube":{"title":"auto"}}',0.9);
UPDATE content_versions SET qa='{"visual_pass":true}' WHERE content_id='00000000-0000-0000-0000-0000000000d2';
-- TEST 13: automatic mode
INSERT INTO policy_assessments(source_id,platform,rights_status,monetization_status,policy_risk) VALUES ('00000000-0000-0000-0000-0000000000a1','youtube','verified','pass','low');
SELECT pg_temp.chk('T13a automatic channel + all gates pass -> auto_approve', (ca_autonomy_gate('00000000-0000-0000-0000-0000000000d2',1)->>'auto_approve')::boolean);
SELECT pg_temp.chk('T10 manual channel -> must wait', NOT (ca_autonomy_gate('00000000-0000-0000-0000-0000000000d1',1)->>'auto_approve')::boolean);
INSERT INTO policy_assessments(source_id,platform,monetization_status,policy_risk) VALUES ('00000000-0000-0000-0000-0000000000a1','youtube','review_required','medium');
SELECT pg_temp.chk('T4/T13b policy review_required stops automatic mode', NOT (ca_autonomy_gate('00000000-0000-0000-0000-0000000000d2',1)->>'auto_approve')::boolean);
UPDATE policy_assessments SET status='superseded' WHERE monetization_status='review_required';
UPDATE content_versions SET quality_score=0.4 WHERE content_id='00000000-0000-0000-0000-0000000000d2';
SELECT pg_temp.chk('T13c low quality stops automatic mode', NOT (ca_autonomy_gate('00000000-0000-0000-0000-0000000000d2',1)->>'auto_approve')::boolean);
UPDATE content_versions SET quality_score=0.9 WHERE content_id='00000000-0000-0000-0000-0000000000d2';

-- TEST 11: approval -> schedule
INSERT INTO approvals(approval_id,content_id,version) VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1',1);
SELECT pg_temp.chk('T10b open approval stays awaiting', (SELECT status FROM approvals WHERE approval_id='00000000-0000-0000-0000-0000000000e1')='awaiting_approval');
SELECT pg_temp.chk('approve stale version rejected', ca_approve('00000000-0000-0000-0000-0000000000e1','me',7)->>'error'='stale_version');
SELECT pg_temp.chk('approve ok', (ca_approve('00000000-0000-0000-0000-0000000000e1','me',1)->>'ok')::boolean);
INSERT INTO schedules(content_id,channel_id,platform,scheduled_at,timezone)
  VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','youtube', ca_pick_slot('00000000-0000-0000-0000-0000000000c1','youtube'),'Asia/Kolkata');
SELECT pg_temp.chk('T11 schedule created in configured window (IST)', (SELECT to_char(scheduled_at AT TIME ZONE 'Asia/Kolkata','HH24:MI') IN ('09:00','19:30') FROM schedules WHERE content_id='00000000-0000-0000-0000-0000000000d1'), (SELECT scheduled_at::text FROM schedules WHERE content_id='00000000-0000-0000-0000-0000000000d1'));
WITH q AS (INSERT INTO schedules(content_id,channel_id,platform,scheduled_at) VALUES ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','youtube',now()+interval '9 days') ON CONFLICT (content_id,platform) DO NOTHING RETURNING 1)
SELECT pg_temp.chk('no duplicate schedule for same content+platform', (SELECT count(*)=0 FROM q));
SELECT pg_temp.chk('slot picker never double-books', ca_pick_slot('00000000-0000-0000-0000-0000000000c1','youtube') IS DISTINCT FROM (SELECT scheduled_at FROM schedules WHERE content_id='00000000-0000-0000-0000-0000000000d1'));

UPDATE content_versions SET qa='{"visual_pass":true}' WHERE content_id='00000000-0000-0000-0000-0000000000d1';
-- TEST 12: edit scheduled content -> latest version publishes
SELECT ca_edit_content('00000000-0000-0000-0000-0000000000d1','{"youtube":{"title":"EDITED v2"}}','me');
SELECT pg_temp.chk('T12a edit bumps version and clears approval', (SELECT current_version=2 AND approved_version IS NULL FROM content WHERE content_id='00000000-0000-0000-0000-0000000000d1'));
SELECT pg_temp.chk('T12b old scheduled item blocked until re-approval', (SELECT status='blocked' FROM schedules WHERE content_id='00000000-0000-0000-0000-0000000000d1'));
SELECT pg_temp.chk('T12c publish refused while edited version is unapproved', NOT (ca_publish_begin((SELECT schedule_id FROM schedules WHERE content_id='00000000-0000-0000-0000-0000000000d1'))->>'ok')::boolean);
UPDATE approvals SET status='needs_edit' WHERE approval_id='00000000-0000-0000-0000-0000000000e1';
SELECT ca_approve('00000000-0000-0000-0000-0000000000e1','me',2);
SELECT pg_temp.chk('T12d re-approved v2 re-arms schedule', (SELECT s.status='scheduled' AND c.approved_version=2 FROM schedules s JOIN content c USING(content_id) WHERE c.content_id='00000000-0000-0000-0000-0000000000d1'));
UPDATE schedules SET scheduled_at=now()-interval '1 min' WHERE content_id='00000000-0000-0000-0000-0000000000d1';
CREATE TEMP TABLE t_pb AS SELECT ca_publish_begin((SELECT schedule_id FROM schedules WHERE content_id='00000000-0000-0000-0000-0000000000d1')) r;
SELECT pg_temp.chk('T12e publication uses latest approved version', (SELECT r->>'version' FROM t_pb)='2', (SELECT r::text FROM t_pb));

-- TEST 9: duplicate publication blocked
UPDATE publications SET status='published', platform_post_id='yt123' WHERE content_id='00000000-0000-0000-0000-0000000000d1';
SELECT pg_temp.chk('T9 duplicate publication attempt blocked', (ca_publish_begin((SELECT schedule_id FROM schedules WHERE content_id='00000000-0000-0000-0000-0000000000d1'))->>'reason')='duplicate_prevented');

-- TEST 16: quota/circuit -> fallback provider (router SQL is in workflow; here: state used by router)
SELECT pg_temp.chk('models seeded local fallback exists', EXISTS (SELECT 1 FROM models WHERE is_local AND enabled));

-- audit / events
SELECT pg_temp.chk('events recorded', (SELECT count(*)>3 FROM events));
SELECT pg_temp.chk('errors persisted with category', (SELECT count(*)>=3 FROM errors WHERE category IN ('TRANSIENT','AUTH')));

\o
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS r, name, detail FROM t_results ORDER BY r DESC, name;
ROLLBACK;

-- Publishing idempotency, platform-account validation and policy-freshness tests (all rolled back).
\set QUIET on
\o /dev/null
BEGIN;
CREATE TEMP TABLE t_results(name text, pass boolean, detail text);
CREATE OR REPLACE FUNCTION pg_temp.chk(n text, ok boolean, d text DEFAULT '') RETURNS void AS $$ INSERT INTO t_results VALUES (n, COALESCE(ok,false), d) $$ LANGUAGE sql;
UPDATE settings SET value='true' WHERE key IN ('adapter_verified_instagram'); UPDATE settings SET value='"true"'::jsonb WHERE false;
-- fixture: a fully valid, approved, due, policy-fresh youtube schedule on its own channel
CREATE OR REPLACE FUNCTION pg_temp.mk(tag text, plats text[] DEFAULT '{youtube}') RETURNS uuid AS $$
DECLARE ch uuid := gen_random_uuid(); src uuid := gen_random_uuid(); cid uuid := gen_random_uuid(); sid uuid; p text;
BEGIN
  INSERT INTO channels(id,name,platforms,autonomy_mode,preferred_windows,posts_per_day) VALUES (ch,'F '||tag,plats,'manual','[{"start":"09:00"}]',2);
  FOREACH p IN ARRAY plats LOOP INSERT INTO platform_accounts(channel_id,platform,external_account_id,credential_ref) VALUES (ch,p,CASE WHEN p='youtube' THEN NULL ELSE 'ext-'||tag END,'TEST'); END LOOP;
  INSERT INTO sources(source_id,canonical_id,normalized_url,source_platform,channel_id,status) VALUES (src,'youtube:'||tag,'https://www.youtube.com/watch?v='||tag,'youtube',ch,'policy_conditional');
  INSERT INTO permissions(source_id,permission_status,permission_evidence,allowed_platforms,verification_timestamp) VALUES (src,'verified','evidence','{}',now());
  FOREACH p IN ARRAY plats LOOP INSERT INTO policy_assessments(source_id,platform,rights_status,monetization_status,policy_risk,expires_at,evidence) VALUES (src,p,'verified','conditional','low',now()+interval '7 days','[{"u":1}]'); END LOOP;
  INSERT INTO content(content_id,source_id,channel_id,current_version,approved_version,status) VALUES (cid,src,ch,1,1,'scheduled');
  INSERT INTO content_versions(content_id,version,per_platform,quality_score,qa,status) VALUES (cid,1,'{}',0.9,'{"visual_pass":true}','approved');
  INSERT INTO approvals(content_id,version,status) VALUES (cid,1,'scheduled');
  INSERT INTO schedules(content_id,channel_id,platform,scheduled_at) VALUES (cid,ch,plats[1],now()-interval '5 minutes') RETURNING schedule_id INTO sid;
  RETURN sid;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.old(sid uuid) RETURNS void AS $$
BEGIN ALTER TABLE schedules DISABLE TRIGGER trg_touch_schedules; ALTER TABLE publications DISABLE TRIGGER trg_touch_publications;
  UPDATE schedules SET updated_at=now()-interval '2 hours' WHERE schedule_id=sid; UPDATE publications SET updated_at=now()-interval '2 hours' WHERE schedule_id=sid;
  ALTER TABLE schedules ENABLE TRIGGER trg_touch_schedules; ALTER TABLE publications ENABLE TRIGGER trg_touch_publications; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.st(sid uuid) RETURNS text AS $$ SELECT status FROM schedules WHERE schedule_id=sid $$ LANGUAGE sql;

-- 1 started + duplicate (concurrent execution still running): no side effects
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaaaaa1'); r1 jsonb; r2 jsonb; BEGIN
  r1 := ca_publish_begin(s); r2 := ca_publish_begin(s);
  PERFORM pg_temp.chk('PUB1 begin ok then duplicate while in progress => in_progress, nothing touched', (r1->>'ok')::boolean AND r2->>'reason'='in_progress' AND pg_temp.st(s)='publishing' AND (SELECT count(*)=1 AND min(status)='started' FROM publications WHERE schedule_id=s), r2::text);
END $$;
-- 2 started + crash (stale) + duplicate attempt => AMBIGUOUS, never published, never retried
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaaaaa2'); r jsonb; BEGIN
  PERFORM ca_publish_begin(s); PERFORM pg_temp.old(s);
  UPDATE schedules SET status='scheduled' WHERE schedule_id=s;                       -- someone re-queued it without reconciling
  r := ca_publish_begin(s);
  PERFORM pg_temp.chk('PUB2 started+crash+re-queue => ambiguous, schedule NOT published, no new upload', r->>'reason'='ambiguous_needs_reconciliation' AND pg_temp.st(s)='failed' AND (SELECT status='ambiguous' AND count(*) OVER ()=1 FROM publications WHERE schedule_id=s) AND EXISTS(SELECT 1 FROM notifications WHERE dedup_key LIKE 'amb:%' AND level='CRITICAL'), r::text);
  r := ca_publish_begin(s);
  PERFORM pg_temp.chk('PUB2b ambiguous publication is not retried on later attempts', r->>'reason' IN ('not_due','ambiguous_needs_reconciliation') AND (SELECT count(*)=1 FROM publications WHERE schedule_id=s), r::text);
END $$;
-- 3 processing + duplicate
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaaaaa3'); r jsonb; BEGIN
  PERFORM ca_publish_begin(s); UPDATE publications SET status='processing' WHERE schedule_id=s; UPDATE schedules SET status='scheduled' WHERE schedule_id=s;
  r := ca_publish_begin(s);
  PERFORM pg_temp.chk('PUB3 processing + duplicate => ambiguous (not published, not retried)', r->>'reason'='ambiguous_needs_reconciliation' AND pg_temp.st(s)='failed', r::text);
END $$;
-- 4 published + duplicate; 8 success twice
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaaaaa4'); r jsonb; pid uuid; BEGIN
  pid := (ca_publish_begin(s)->>'publication_id')::uuid;
  PERFORM ca_publish_result(pid,true,'yt_one',NULL); PERFORM ca_publish_result(pid,true,'yt_one',NULL); PERFORM ca_publish_result(pid,true,'yt_DIFFERENT',NULL); PERFORM ca_publish_result(pid,false,NULL,'late failure','TRANSIENT');
  PERFORM pg_temp.chk('PUB8 success twice / conflicting later callbacks are harmless (post id never overwritten, one row, still published)', (SELECT status='published' AND platform_post_id='yt_one' FROM publications WHERE id=pid) AND (SELECT count(*)=1 FROM publications WHERE schedule_id=s) AND pg_temp.st(s)='published');
  UPDATE schedules SET status='scheduled' WHERE schedule_id=s; r := ca_publish_begin(s);
  PERFORM pg_temp.chk('PUB4 published(+post id) + duplicate => blocked, no new upload, event+CRITICAL', r->>'reason'='duplicate_prevented' AND (SELECT count(*)=1 FROM publications WHERE schedule_id=s) AND EXISTS(SELECT 1 FROM events WHERE event_type='publication.failed' AND payload->>'reason'='duplicate_publication_prevented') AND EXISTS(SELECT 1 FROM notifications WHERE dedup_key LIKE 'dup:%'), r::text);
END $$;
-- 5 published but WITHOUT a post id is not trusted
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaaaaa5'); r jsonb; BEGIN
  PERFORM ca_publish_begin(s); UPDATE publications SET status='published', platform_post_id=NULL WHERE schedule_id=s; UPDATE schedules SET status='scheduled' WHERE schedule_id=s;
  r := ca_publish_begin(s);
  PERFORM pg_temp.chk('PUB5 "published" without platform post id is treated as ambiguous, schedule not marked published', r->>'reason'='ambiguous_needs_reconciliation' AND pg_temp.st(s)='failed', r::text);
END $$;
-- 9 success callback without a post id
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaaaaa9'); pid uuid; BEGIN
  pid := (ca_publish_begin(s)->>'publication_id')::uuid; PERFORM ca_publish_result(pid,true,'  ',NULL);
  PERFORM pg_temp.chk('PUB9 success without post id => ambiguous, never published', (SELECT status='ambiguous' FROM publications WHERE id=pid) AND pg_temp.st(s)='failed');
END $$;
-- 6 failed + retry (definite failure) and 7 retry limit
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaaaab6'); r jsonb; pid uuid; pid2 uuid; BEGIN
  pid := (ca_publish_begin(s)->>'publication_id')::uuid; PERFORM ca_publish_result(pid,false,NULL,'429 rate limit','RATE_LIMIT');
  PERFORM pg_temp.chk('PUB6a definite failure => schedule rescheduled with backoff, publication failed', pg_temp.st(s)='scheduled' AND (SELECT status='failed' FROM publications WHERE id=pid) AND (SELECT scheduled_at>now() FROM schedules WHERE schedule_id=s));
  UPDATE schedules SET scheduled_at=now()-interval '1 minute' WHERE schedule_id=s; r := ca_publish_begin(s); pid2 := (r->>'publication_id')::uuid;
  PERFORM pg_temp.chk('PUB6b retry reuses the SAME publication row (idempotency key preserved)', (r->>'ok')::boolean AND pid2=pid AND (SELECT count(*)=1 FROM publications WHERE schedule_id=s) AND (SELECT publication_attempts=2 FROM schedules WHERE schedule_id=s), r::text);
  PERFORM ca_publish_result(pid,false,NULL,'x','TRANSIENT'); UPDATE schedules SET scheduled_at=now()-interval '1 minute', publication_attempts=4 WHERE schedule_id=s;
  r := ca_publish_begin(s); PERFORM pg_temp.chk('PUB7 retry limit reached => no further upload', r->>'reason'='retry_limit' AND pg_temp.st(s)='failed', r::text);
END $$;
-- 10 upload error classified AMBIGUOUS (timeout/5xx during upload)
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaab10'); pid uuid; BEGIN
  pid := (ca_publish_begin(s)->>'publication_id')::uuid; PERFORM ca_publish_result(pid,false,NULL,'ETIMEDOUT during upload','AMBIGUOUS');
  PERFORM pg_temp.chk('PUB10 AMBIGUOUS result => publication ambiguous, schedule failed (no auto retry), CRITICAL', (SELECT status='ambiguous' FROM publications WHERE id=pid) AND pg_temp.st(s)='failed' AND EXISTS(SELECT 1 FROM notifications WHERE dedup_key='amb:'||(SELECT idempotency_key FROM publications WHERE id=pid)));
END $$;
-- 11/12/13 crash before platform response / crash after upload before DB result / human reconciliation
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaab11'); s2 uuid := pg_temp.mk('aaaaaaab12'); s3 uuid := pg_temp.mk('aaaaaaab13'); pid uuid; r jsonb; BEGIN
  PERFORM ca_publish_begin(s); PERFORM ca_publish_begin(s2); PERFORM ca_publish_begin(s3); PERFORM pg_temp.old(s); PERFORM pg_temp.old(s2); PERFORM pg_temp.old(s3);
  r := ca_supervisor_tick();
  PERFORM pg_temp.chk('PUB11 crash mid-publish => supervisor parks as ambiguous (publication ambiguous, schedule failed, CRITICAL), not retried', (r->>'publications_parked')::int>=3 AND (SELECT bool_and(status='ambiguous') FROM publications WHERE schedule_id IN (s,s2,s3)) AND pg_temp.st(s)='failed');
  pid := (SELECT id FROM publications WHERE schedule_id=s2);
  r := ca_publication_reconcile(jsonb_build_object('publication_id',pid,'outcome','published','by','owner','reason','found on channel'));
  PERFORM pg_temp.chk('PUB14a reconcile "published" requires post_id', r->>'error'='VALIDATION');
  r := ca_publication_reconcile(jsonb_build_object('publication_id',pid,'outcome','published','by','owner'));
  PERFORM pg_temp.chk('PUB14b reconcile requires a reason', r->>'error'='VALIDATION');
  r := ca_publication_reconcile(jsonb_build_object('publication_id',pid,'outcome','published','post_id','yt_found','by','owner','reason','found on channel'));
  PERFORM pg_temp.chk('PUB12 crash AFTER upload: human confirms published with post id => published + audited', (r->>'ok')::boolean AND pg_temp.st(s2)='published' AND (SELECT platform_post_id='yt_found' FROM publications WHERE id=pid) AND EXISTS(SELECT 1 FROM audit_logs WHERE action='publication_reconcile' AND entity_id=pid));
  UPDATE schedules SET status='scheduled' WHERE schedule_id=s2; r := ca_publish_begin(s2);
  PERFORM pg_temp.chk('PUB12b after confirmation a duplicate attempt is blocked', r->>'reason'='duplicate_prevented');
  r := ca_publication_reconcile(jsonb_build_object('publication_id',(SELECT id FROM publications WHERE schedule_id=s3),'outcome','not_published','by','owner','reason','checked, not on the channel'));
  PERFORM pg_temp.chk('PUB13 human confirms NOT published => re-queued; retry now allowed once, same row', (r->>'ok')::boolean AND pg_temp.st(s3)='scheduled', r::text);
  r := ca_publish_begin(s3); PERFORM pg_temp.chk('PUB13b retry after confirmation starts exactly one new attempt on the same publication row', (r->>'ok')::boolean AND (SELECT count(*)=1 FROM publications WHERE schedule_id=s3));
  r := ca_publication_reconcile(jsonb_build_object('publication_id',(SELECT id FROM publications WHERE schedule_id=s2),'outcome','not_published','reason','x'));
  PERFORM pg_temp.chk('reconcile of an already published publication is refused', r->>'error'='CONFLICT');
END $$;
-- platform account validation (fail closed)
DO $$ DECLARE s uuid; c uuid; r jsonb; ch uuid; BEGIN
  s := pg_temp.mk('aaaaaaab20'); SELECT channel_id,content_id INTO ch,c FROM schedules WHERE schedule_id=s;
  DELETE FROM platform_accounts WHERE channel_id=ch; r := ca_publish_begin(s);
  PERFORM pg_temp.chk('ACCT1 missing platform account => publish gate fails closed', r->>'reason'='gate_failed' AND r->>'failures' LIKE '%no platform account%' AND pg_temp.st(s)='blocked', r::text);
  s := pg_temp.mk('aaaaaaab21'); UPDATE platform_accounts SET enabled=false WHERE channel_id=(SELECT channel_id FROM schedules WHERE schedule_id=s); r := ca_publish_begin(s);
  PERFORM pg_temp.chk('ACCT2 disabled platform account => blocked', r->>'failures' LIKE '%disabled%', r::text);
  s := pg_temp.mk('aaaaaaab22','{instagram}'); UPDATE platform_accounts SET external_account_id=NULL WHERE channel_id=(SELECT channel_id FROM schedules WHERE schedule_id=s); r := ca_publish_begin(s);
  PERFORM pg_temp.chk('ACCT3 instagram account without external_account_id => blocked', r->>'failures' LIKE '%external_account_id%', r::text);
  s := pg_temp.mk('aaaaaaab23','{facebook}'); r := ca_publish_begin(s);
  PERFORM pg_temp.chk('ACCT4 facebook adapter unverified => blocked (stays fail-closed)', r->>'failures' LIKE '%adapter not verified%', r::text);
  PERFORM pg_temp.chk('ACCT5 unsupported platform string => problem reported', ca_platform_account_problem((SELECT channel_id FROM schedules LIMIT 1),'tiktok') LIKE 'unsupported platform%');
  s := pg_temp.mk('aaaaaaab24'); PERFORM pg_temp.chk('ACCT6 valid youtube account => no problem', ca_platform_account_problem((SELECT channel_id FROM schedules WHERE schedule_id=s),'youtube') IS NULL);
END $$;
-- scheduling refuses platforms without a valid account (no schedule that cannot publish)
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaab30','{youtube,instagram}'); ch uuid; cid uuid; j jobs; r jsonb; BEGIN
  SELECT channel_id,content_id INTO ch,cid FROM schedules WHERE schedule_id=s; DELETE FROM schedules WHERE schedule_id=s; UPDATE platform_accounts SET external_account_id='' WHERE channel_id=ch AND platform='instagram';
  SELECT * INTO j FROM ca_enqueue('scheduling',cid,NULL,'{"version":1}',5,'sched-acct-test'); UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id; r := ca_schedule_content(j.job_id);
  PERFORM pg_temp.chk('SCHED1 only platforms with valid accounts are scheduled; invalid one reported', (r->>'scheduled')::int=1 AND (SELECT count(*)=1 AND min(platform)='youtube' FROM schedules WHERE content_id=cid) AND r->>'platform_account_problems' LIKE '%instagram%external_account_id%', r::text);
END $$;
-- policy freshness
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaab40'); src uuid; ch uuid; r jsonb; j jobs; BEGIN
  SELECT c.source_id,c.channel_id INTO src,ch FROM schedules sc JOIN content c USING(content_id) WHERE sc.schedule_id=s;
  UPDATE policy_assessments SET expires_at=now()-interval '1 day' WHERE source_id=src;
  r := ca_publish_begin(s);
  PERFORM pg_temp.chk('POL1 stale policy => publication blocked + forced refresh job enqueued', r->>'reason'='gate_failed' AND r->>'failures' LIKE '%stale%' AND pg_temp.st(s)='blocked' AND EXISTS(SELECT 1 FROM jobs WHERE job_type='monetization_policy' AND entity_id=src AND payload->>'force_refresh'='true'), r::text);
  SELECT * INTO j FROM jobs WHERE job_type='monetization_policy' AND entity_id=src AND payload->>'force_refresh'='true'; UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id;
  PERFORM ca_job_fail(j.job_id,'TRANSIENT','policy page fetch failed');
  PERFORM pg_temp.chk('POL2 refresh FAILURE => schedule stays blocked (never publishes on stale policy)', pg_temp.st(s)='blocked' AND (SELECT status='retrying' FROM jobs WHERE job_id=j.job_id));
  UPDATE jobs SET status='running' WHERE job_id=j.job_id;
  PERFORM ca_policy_store(j.job_id,'[{"platform":"youtube","monetization_status":"conditional","policy_risk":"low","evidence":[{"url":"https://p"}]}]',true);
  PERFORM pg_temp.chk('POL3 refresh SUCCESS => new active assessment, schedule re-armed', pg_temp.st(s)='scheduled' AND (SELECT count(*)=1 FROM policy_assessments WHERE source_id=src AND platform='youtube' AND status='active' AND expires_at>now()));
  r := ca_publish_begin(s); PERFORM pg_temp.chk('POL3b after refresh the gate passes and publishing may start', (r->>'ok')::boolean, r::text);
END $$;
DO $$ DECLARE s uuid := pg_temp.mk('aaaaaaab41'); src uuid; r jsonb; BEGIN
  SELECT c.source_id INTO src FROM schedules sc JOIN content c USING(content_id) WHERE sc.schedule_id=s;
  UPDATE policy_assessments SET monetization_status='review_required', policy_risk='medium' WHERE source_id=src; r := ca_publish_begin(s);
  PERFORM pg_temp.chk('POL4 review_required unresolved => blocked', r->>'failures' LIKE '%policy review unresolved%', r::text);
  UPDATE policy_assessments SET monetization_status='blocked' WHERE source_id=src; UPDATE schedules SET status='scheduled' WHERE schedule_id=s; r := ca_publish_begin(s);
  PERFORM pg_temp.chk('POL5 blocked policy => blocked', r->>'failures' LIKE '%policy blocked%', r::text);
END $$;
\o
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END r, name, left(detail,160) detail FROM t_results ORDER BY 1 DESC, 2;
ROLLBACK;

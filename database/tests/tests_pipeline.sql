-- End-to-end vertical slice at DB level (what the n8n workflows call). Rolled back at the end.
\set QUIET on
\o nul
BEGIN;
CREATE TEMP TABLE t_results(name text, pass boolean, detail text);
CREATE OR REPLACE FUNCTION pg_temp.chk(n text, ok boolean, d text DEFAULT '') RETURNS void AS $$ INSERT INTO t_results VALUES (n, COALESCE(ok,false), d) $$ LANGUAGE sql;
INSERT INTO channels(id,name,platforms,autonomy_mode,preferred_windows,posts_per_day) VALUES
 ('00000000-0000-0000-0000-0000000000c1','Manual ch','{youtube,instagram}','manual','[{"start":"09:00"},{"start":"19:30"}]',2),
 ('00000000-0000-0000-0000-0000000000c2','Auto ch','{youtube}','automatic','[{"start":"07:15"}]',1);
INSERT INTO platform_accounts(channel_id,platform,external_account_id,credential_ref) VALUES ('00000000-0000-0000-0000-0000000000c1','youtube',NULL,'TEST'),('00000000-0000-0000-0000-0000000000c1','instagram','ig-test-1','TEST'),('00000000-0000-0000-0000-0000000000c2','youtube',NULL,'TEST');
INSERT INTO authorized_creators(id,creator,external_channel_id,permission_status,permission_evidence,allowed_platforms) VALUES
 ('00000000-0000-0000-0000-0000000000b1','Licensed Creator','UCxxx','verified','email licence 2026-09','{youtube,instagram}'),
 ('00000000-0000-0000-0000-0000000000b2','Pending Creator','UCyyy','pending',NULL,'{}');
CREATE TEMP TABLE ctx(k text PRIMARY KEY, v text);

-- T1: trend -> source discovery job
DO $$ DECLARE j jobs; r jsonb; BEGIN
  SELECT * INTO j FROM ca_enqueue('trend_research','00000000-0000-0000-0000-0000000000c1',NULL,'{"channel_id":"00000000-0000-0000-0000-0000000000c1"}',3,'t1');
  UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id;
  r := ca_trend_store(j.job_id,'[{"niche":"funny","topic":"cat fails","source":"llm+search","trend_score":0.8,"confidence":0.6,"evidence":["x"]},{"niche":"interviews","topic":"interviews","trend_score":0.9,"new_channel_opportunity":true}]');
  PERFORM pg_temp.chk('T1 trend -> source_discovery job queued', EXISTS(SELECT 1 FROM jobs WHERE job_type='source_discovery' AND status='queued'));
  PERFORM pg_temp.chk('T1b new-niche trend -> IMPORTANT notification, no auto-channel', EXISTS(SELECT 1 FROM notifications WHERE category='trend' AND level='IMPORTANT') AND (SELECT count(*)=1 FROM jobs WHERE job_type='source_discovery'));
END $$;

-- T8: dedup at registration
DO $$ DECLARE a jsonb; b jsonb; c jsonb; p jsonb := '{"canonical_id":"youtube:V1","normalized_url":"https://www.youtube.com/watch?v=V1","source_platform":"youtube","platform_video_id":"V1","channel_id":"00000000-0000-0000-0000-0000000000c1","authorized_creator_id":"00000000-0000-0000-0000-0000000000b1","title":"Ep1","duration_seconds":1800}';
BEGIN
  a := ca_register_source(p); b := ca_register_source(p);
  PERFORM pg_temp.chk('T8 duplicate source: 2nd registration is a no-op', (a->>'inserted')::boolean AND NOT (b->>'inserted')::boolean AND (SELECT count(*)=1 FROM jobs WHERE job_type='rights_verification'));
  INSERT INTO ctx VALUES ('src1',a->>'source_id');
  c := ca_register_source(jsonb_set(jsonb_set(p,'{canonical_id}','"youtube:V2"'),'{authorized_creator_id}','"00000000-0000-0000-0000-0000000000b2"'));
  INSERT INTO ctx VALUES ('src2',c->>'source_id');
END $$;

-- T2/T3 through the stage function
DO $$ DECLARE j jobs; g jsonb; BEGIN
  FOR j IN SELECT * FROM jobs WHERE job_type='rights_verification' AND status='queued' ORDER BY created_at DESC LIMIT 2 LOOP
    UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id; PERFORM ca_rights_stage(j.job_id);
  END LOOP;
  PERFORM pg_temp.chk('T2 verified source -> policy job queued', (SELECT status FROM sources WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1'))='rights_verified' AND EXISTS(SELECT 1 FROM jobs WHERE job_type='monetization_policy'));
  PERFORM pg_temp.chk('T3 pending-rights source held, NOT sent on', (SELECT status FROM sources WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src2'))='needs_human_review' AND NOT EXISTS(SELECT 1 FROM jobs WHERE job_type='monetization_policy' AND entity_id=(SELECT v::uuid FROM ctx WHERE k='src2')));
END $$;
-- human resolves rights with evidence, re-runs
SELECT ca_source_review(jsonb_build_object('source_id',(SELECT v FROM ctx WHERE k='src2'),'action','verify'));
SELECT pg_temp.chk('rights verify without evidence refused', (ca_source_review(jsonb_build_object('source_id',(SELECT v FROM ctx WHERE k='src2'),'action','verify'))->>'error')='evidence_required');

-- T4: policy review_required -> still proceeds to clipping but forces human approval later; blocked stops
DO $$ DECLARE j jobs; r jsonb; BEGIN
  SELECT * INTO j FROM jobs WHERE job_type='monetization_policy' AND entity_id=(SELECT v::uuid FROM ctx WHERE k='src1') LIMIT 1; UPDATE jobs SET status='running' WHERE job_id=j.job_id;
  BEGIN PERFORM ca_policy_store(j.job_id,'[{"platform":"youtube","monetization_status":"pass","policy_risk":"low","reasons":["Guaranteed monetization"]}]');
    PERFORM pg_temp.chk('policy: forbidden guarantee language rejected',false);
  EXCEPTION WHEN raise_exception THEN PERFORM pg_temp.chk('policy: forbidden guarantee language rejected',true); END;
  r := ca_policy_store(j.job_id,'[{"platform":"youtube","rights_status":"verified","monetization_status":"review_required","policy_risk":"medium","reasons":["reused content risk"],"required_actions":["add commentary"]}]');
  PERFORM pg_temp.chk('T4 review_required recorded; clipping enqueued', r->>'worst'='review_required' AND EXISTS(SELECT 1 FROM jobs WHERE job_type='clipping' AND entity_id=(SELECT v::uuid FROM ctx WHERE k='src1')));
END $$;

-- T5: OpenShorts completion -> clips -> content -> packaging
DO $$ DECLARE j jobs; r jsonb; BEGIN
  SELECT * INTO j FROM jobs WHERE job_type='clipping' AND entity_id=(SELECT v::uuid FROM ctx WHERE k='src1') AND status='queued' LIMIT 1;
  UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id; PERFORM ca_job_wait(j.job_id,'os-job-1');
  r := ca_ingest_clips('os-job-1','openshorts','[{"index":0,"title":"Clip A","start":10,"end":50,"viral_hook_text":"wait for it","download_url":"http://x/a.mp4"},{"index":1,"title":"Clip B","start":100,"end":140}]');
  PERFORM pg_temp.chk('T5 OpenShorts success -> 2 clips + 2 content + 2 packaging jobs', (r->>'clip_count')::int=2 AND (SELECT count(*)=2 FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1')) AND (SELECT count(*)=2 FROM jobs WHERE job_type='content_packaging' AND entity_id IN (SELECT content_id FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1'))));
  r := ca_ingest_clips('os-job-1','openshorts','[{"index":0,"title":"Clip A"}]');
  PERFORM pg_temp.chk('T5b replayed webhook is idempotent', (r->>'ok')::boolean=false);
END $$;

-- packaging -> approval request (manual channel must wait)
DO $$ DECLARE j jobs; r jsonb; cid uuid; BEGIN
  FOR j IN SELECT * FROM jobs WHERE job_type='content_packaging' AND entity_id IN (SELECT content_id FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1')) LOOP
    UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id;
    PERFORM ca_packaging_store(j.job_id,'{"youtube":{"title":"T","description":"D","hashtags":["a"]}}','hook','{"ok":true}',0.9);
  END LOOP;
  PERFORM pg_temp.chk('packaging now enqueues visual_qa (not approval) - QA is a real stage', (SELECT count(*)=2 FROM jobs WHERE job_type='visual_qa' AND entity_id IN (SELECT content_id FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1'))) AND NOT EXISTS(SELECT 1 FROM jobs WHERE job_type='approval_request' AND entity_id IN (SELECT content_id FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1'))));
  FOR j IN SELECT * FROM jobs WHERE job_type='visual_qa' AND entity_id IN (SELECT content_id FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1')) LOOP
    UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id;
    PERFORM ca_visual_qa_store(j.job_id,'{"visual_pass":true,"failures":[],"thumbnail":{"ok":true,"url":"http://x/t.jpg","path":"/t.jpg"}}');
  END LOOP;
  FOR j IN SELECT * FROM jobs WHERE job_type='approval_request' AND entity_id IN (SELECT content_id FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1')) LOOP
    UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id; r := ca_approval_request(j.job_id);
  END LOOP;
  PERFORM pg_temp.chk('T10 manual mode: approvals wait (awaiting_approval, nothing scheduled)', (SELECT count(*)=2 FROM approvals WHERE status='awaiting_approval' AND content_id IN (SELECT content_id FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1'))) AND NOT EXISTS(SELECT 1 FROM schedules WHERE content_id IN (SELECT content_id FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1'))));
  SELECT content_id INTO cid FROM content WHERE source_id=(SELECT v::uuid FROM ctx WHERE k='src1') ORDER BY created_at LIMIT 1; INSERT INTO ctx VALUES ('cid',cid::text);
END $$;

-- T11: human approve -> scheduling job -> schedules
DO $$ DECLARE r jsonb; j jobs; aid uuid; cid uuid := (SELECT v::uuid FROM ctx WHERE k='cid'); BEGIN
  SELECT approval_id INTO aid FROM approvals WHERE content_id=cid;
  r := ca_approval_action(jsonb_build_object('action','approve','approval_id',aid,'by','me'));
  SELECT * INTO j FROM jobs WHERE job_type='scheduling' AND entity_id=cid; UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id;
  r := ca_schedule_content(j.job_id);
  PERFORM pg_temp.chk('T11 approval -> schedules on each channel platform', (r->>'scheduled')::int=2 AND (SELECT count(*)=2 FROM schedules WHERE content_id=cid) AND (SELECT status='scheduled' FROM approvals WHERE approval_id=aid));
END $$;

-- T12: edit after scheduling
DO $$ DECLARE r jsonb; cid uuid := (SELECT v::uuid FROM ctx WHERE k='cid'); aid uuid; BEGIN
  SELECT approval_id INTO aid FROM approvals WHERE content_id=cid;
  r := ca_approval_action(jsonb_build_object('action','edit','approval_id',aid,'by','me','per_platform','{"youtube":{"title":"EDITED"}}'));
  PERFORM pg_temp.chk('T12 edit: schedules blocked, needs re-approval', (SELECT count(*)=2 FROM schedules WHERE content_id=cid AND status='blocked') AND (SELECT approved_version IS NULL FROM content WHERE content_id=cid));
  r := ca_approval_action(jsonb_build_object('action','approve','approval_id',aid,'by','me','version',1));
  PERFORM pg_temp.chk('T12b approving stale version refused', r->>'error'='stale_version');
  r := ca_approval_action(jsonb_build_object('action','approve','approval_id',aid,'by','me'));
  PERFORM pg_temp.chk('T12c approve latest re-arms schedules', (SELECT count(*)=2 FROM schedules WHERE content_id=cid AND status='scheduled') AND (SELECT approved_version=(SELECT max(version) FROM content_versions WHERE content_id=cid) FROM content WHERE content_id=cid));
END $$;

-- T9 / T14 publishing
UPDATE schedules SET scheduled_at=now()-interval '1 min' WHERE status='scheduled';
UPDATE settings SET value='true' WHERE key IN ('adapter_verified_instagram','adapter_verified_youtube');
INSERT INTO policy_assessments(source_id,platform,rights_status,monetization_status,policy_risk,evidence) SELECT source_id,'instagram','verified','conditional','low','[{"u":1}]' FROM sources WHERE canonical_id='youtube:V1';
-- FINAL PRE-PUBLISH GATE: policy review_required is unresolved -> publication must be refused; blocked can never be human-approved
DO $$ DECLARE s schedules; r jsonb; cid uuid := (SELECT v::uuid FROM ctx WHERE k='cid'); rv jsonb; BEGIN
  SELECT * INTO s FROM schedules WHERE content_id=cid AND platform='youtube';
  r := ca_publish_begin(s.schedule_id);
  PERFORM pg_temp.chk('GATE: unresolved policy review_required stops publication', r->>'reason'='gate_failed' AND r->>'failures' LIKE '%policy review unresolved%', r::text);
  PERFORM pg_temp.chk('GATE: stop is persisted (schedule blocked, CRITICAL notification, POLICY error)', (SELECT status='blocked' FROM schedules WHERE schedule_id=s.schedule_id) AND EXISTS(SELECT 1 FROM notifications WHERE category='publish' AND subject LIKE 'Publication stopped%') AND EXISTS(SELECT 1 FROM errors WHERE workflow='publish_gate' AND category='POLICY'));
  rv := ca_policy_review(jsonb_build_object('source_id',(SELECT source_id FROM sources WHERE canonical_id='youtube:V1'),'decision','approved','reviewer','owner'));
  PERFORM pg_temp.chk('policy review requires a reason', rv->>'error'='reason_and_reviewer_required');
  rv := ca_policy_review(jsonb_build_object('source_id',(SELECT source_id FROM sources WHERE canonical_id='youtube:V1'),'decision','approved','reviewer','owner','reason','Added commentary; evidence attached','content_version',3,'evidence','[{"note":"commentary added in v3"}]'));
  PERFORM pg_temp.chk('human policy approval stored with reviewer/reason/version/assessment id', (rv->>'ok')::boolean AND (SELECT count(*)=2 FROM policy_reviews WHERE decision='approved' AND reviewer='owner' AND content_version=3 AND assessment_id IS NOT NULL));
  PERFORM pg_temp.chk('policy approval re-arms the gate-blocked schedule (gate still re-checks at publish)', (rv->>'schedules_rearmed')::int>=1 AND (SELECT status='scheduled' FROM schedules WHERE schedule_id=s.schedule_id));
END $$;
DO $$ DECLARE s schedules; r jsonb; cid uuid := (SELECT v::uuid FROM ctx WHERE k='cid'); pid uuid; BEGIN
  SELECT * INTO s FROM schedules WHERE content_id=cid AND platform='youtube';
  r := ca_publish_begin(s.schedule_id); pid := (r->>'publication_id')::uuid;
  PERFORM pg_temp.chk('publish begin ok on approved content', (r->>'ok')::boolean);
  PERFORM ca_publish_result(pid,true,'yt_abc',NULL);
  r := ca_publish_begin(s.schedule_id);
  PERFORM pg_temp.chk('T9 duplicate publication blocked after success', r->>'reason'='duplicate_prevented' AND (SELECT count(*)=1 FROM publications WHERE schedule_id=s.schedule_id));
  PERFORM pg_temp.chk('T9b duplicate raises CRITICAL-flag', (r->>'critical')::boolean);
  SELECT * INTO s FROM schedules WHERE content_id=cid AND platform='instagram'; UPDATE schedules SET status='scheduled' WHERE schedule_id=s.schedule_id; r := ca_publish_begin(s.schedule_id); pid := (r->>'publication_id')::uuid;
  PERFORM ca_publish_result(pid,false,NULL,'OAuthException 190 token expired','AUTH');
  PERFORM pg_temp.chk('T14 AUTH failure: schedule failed, CRITICAL notification, channel auth circuit open', (SELECT status='failed' FROM schedules WHERE schedule_id=s.schedule_id) AND EXISTS(SELECT 1 FROM notifications WHERE level='CRITICAL' AND category='publish') AND EXISTS(SELECT 1 FROM integration_health WHERE name LIKE 'auth\_%' AND state='open'));
  PERFORM pg_temp.chk('T14b other schedules on that channel are not picked while auth circuit open', NOT EXISTS (SELECT 1 FROM ca_due_schedules(10) WHERE channel_id=s.channel_id));
END $$;

-- gate: blocked policy can never be approved by a human; stale version, rights loss, missing visual QA stop publishing
DO $$ DECLARE sid uuid; rv jsonb; BEGIN
  SELECT source_id INTO sid FROM sources WHERE canonical_id='youtube:V2';
  INSERT INTO policy_assessments(source_id,platform,monetization_status,policy_risk) VALUES (sid,'youtube','blocked','high');
  rv := ca_policy_review(jsonb_build_object('source_id',sid,'decision','approved','reviewer','owner','reason','please'));
  PERFORM pg_temp.chk('blocked policy assessment cannot be human-approved', rv->>'error'='blocked_assessment_cannot_be_approved');
END $$;
DO $$ DECLARE cid uuid := (SELECT v::uuid FROM ctx WHERE k='cid'); g jsonb; BEGIN
  UPDATE content_versions SET qa=qa-'visual_pass' WHERE content_id=cid AND version=(SELECT approved_version FROM content WHERE content_id=cid);
  g := ca_publish_gate(cid,'youtube'); PERFORM pg_temp.chk('GATE: missing visual QA stops publishing', g->>'failures' LIKE '%visual QA%', g::text);
  UPDATE content_versions SET qa=qa||'{"visual_pass":true}' WHERE content_id=cid;
  UPDATE permissions SET permission_status='rejected' WHERE source_id=(SELECT source_id FROM content WHERE content_id=cid) AND status='active';
  g := ca_publish_gate(cid,'youtube'); PERFORM pg_temp.chk('GATE: rights revoked after approval stops publishing', g->>'failures' LIKE '%rights%', g::text);
  UPDATE permissions SET permission_status='verified' WHERE source_id=(SELECT source_id FROM content WHERE content_id=cid) AND status='active';
  UPDATE content SET current_version=current_version+1 WHERE content_id=cid;
  g := ca_publish_gate(cid,'youtube'); PERFORM pg_temp.chk('GATE: approved version no longer latest stops publishing', g->>'failures' LIKE '%not the latest%', g::text);
  UPDATE content SET current_version=current_version-1 WHERE content_id=cid;
END $$;
-- T13: automatic channel end-to-end skip of manual approval
DO $$ DECLARE cid uuid; j jobs; r jsonb; sid uuid; BEGIN
  INSERT INTO sources(canonical_id,normalized_url,source_platform,channel_id,authorized_creator_id) VALUES ('youtube:V9','u','youtube','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b1') RETURNING source_id INTO sid;
  INSERT INTO permissions(source_id,permission_status,permission_evidence,allowed_platforms,verification_timestamp) VALUES (sid,'verified','licence','{youtube}',now());
  INSERT INTO policy_assessments(source_id,platform,monetization_status,policy_risk) VALUES (sid,'youtube','pass','low');
  INSERT INTO content(source_id,channel_id,current_version,status) VALUES (sid,'00000000-0000-0000-0000-0000000000c2',1,'needs_approval') RETURNING content_id INTO cid;
  INSERT INTO content_versions(content_id,version,per_platform,quality_score,qa) VALUES (cid,1,'{}',0.95,'{"visual_pass":true}');
  SELECT * INTO j FROM ca_enqueue('approval_request',cid,NULL,'{"version":1}',5,'apr:auto'); UPDATE jobs SET status='running' WHERE job_id=j.job_id;
  r := ca_approval_request(j.job_id);
  PERFORM pg_temp.chk('T13 automatic mode: gates pass -> auto-approved + scheduling queued', (r->>'auto_approve')::boolean AND (SELECT approved_version=1 FROM content WHERE content_id=cid) AND EXISTS(SELECT 1 FROM jobs WHERE job_type='scheduling' AND entity_id=cid));
  UPDATE content_versions SET qa='{}' WHERE content_id=cid;
  PERFORM pg_temp.chk('T13c automatic mode blocked without visual QA (default setting)', NOT (ca_autonomy_gate(cid,1)->>'auto_approve')::boolean AND ca_autonomy_gate(cid,1)::text LIKE '%visual%');
  UPDATE content_versions SET qa='{"visual_pass":true}' WHERE content_id=cid;
  UPDATE permissions SET permission_status='pending' WHERE source_id=sid;  -- rights uncertainty is a hard stop even in automatic mode
  PERFORM pg_temp.chk('T13b automatic mode + rights uncertain -> hard stop', NOT (ca_autonomy_gate(cid,1)->>'auto_approve')::boolean);
END $$;

-- T16: quota exceeded -> router falls back
UPDATE models SET enabled=true;
DO $$ DECLARE p1 text; p2 text; p3 text; BEGIN
  SELECT provider INTO p1 FROM ca_pick_model('{text,json}',false);
  PERFORM ca_model_result(p1,false,'HTTP 429 RESOURCE_EXHAUSTED');
  SELECT provider INTO p2 FROM ca_pick_model('{text,json}',false);
  PERFORM pg_temp.chk('T16 quota exceeded -> router picks a different provider', p1 IS NOT NULL AND p2 IS NOT NULL AND p1<>p2, p1||' -> '||p2);
  SELECT provider INTO p3 FROM ca_pick_model('{text,json}',true);
  PERFORM pg_temp.chk('T16b fallback flag prefers local model', (SELECT is_local FROM models WHERE provider=p3 LIMIT 1));
  PERFORM pg_temp.chk('T16c vision task only routes to vision-capable model', (SELECT provider FROM ca_pick_model('{vision}',false)) IS DISTINCT FROM 'ollama');
END $$;
-- T17: analytics record + window suggestion
DO $$ DECLARE pid uuid; BEGIN
  SELECT id INTO pid FROM publications WHERE platform='youtube' LIMIT 1;
  INSERT INTO analytics_snapshots(publication_id,channel_id,platform,raw,views,likes,comments,metrics_available) VALUES (pid,'00000000-0000-0000-0000-0000000000c1','youtube','{"items":[]}',120,7,1,'{views,likes,comments}');
  PERFORM pg_temp.chk('T17 analytics snapshot stored; only available metrics flagged', (SELECT views=120 AND shares IS NULL AND 'shares' <> ALL(metrics_available) FROM analytics_snapshots WHERE publication_id=pid));
  PERFORM pg_temp.chk('window suggestion refuses to guess with too little data', (ca_suggest_windows('00000000-0000-0000-0000-0000000000c1')->>'enough_data')::boolean=false);
END $$;
-- lost OpenShorts webhook: waiting job is recovered (retrying), not stuck forever
DO $$ DECLARE j jobs; BEGIN
  SELECT * INTO j FROM ca_enqueue('clipping',(SELECT source_id FROM sources LIMIT 1),NULL,'{}',5,'lostwh'); UPDATE jobs SET status='waiting',attempt=1,external_job_id='lost' WHERE job_id=j.job_id;
  ALTER TABLE jobs DISABLE TRIGGER trg_touch_jobs; UPDATE jobs SET updated_at=now()-interval '10 hours' WHERE job_id=j.job_id; ALTER TABLE jobs ENABLE TRIGGER trg_touch_jobs;
  PERFORM ca_recover_stuck(90);
  PERFORM pg_temp.chk('lost webhook: waiting job recovered into retry ladder', (SELECT status FROM jobs WHERE job_id=j.job_id)='retrying');
END $$;
-- repeated worker invocation (the real n8n duplicate-edge bug): second call must be a no-op
DO $$ DECLARE j jobs; r jsonb; n1 int; cid uuid := (SELECT v::uuid FROM ctx WHERE k='cid'); BEGIN
  SELECT * INTO j FROM ca_enqueue('content_packaging',cid,NULL,jsonb_build_object('channel_id','00000000-0000-0000-0000-0000000000c1','clip_id',(SELECT clip_id FROM clips LIMIT 1)),5,'pkg:dup-test');
  UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id;
  PERFORM ca_packaging_store(j.job_id,'{"youtube":{"title":"x"}}','h','{}',0.9); SELECT count(*) INTO n1 FROM content_versions WHERE content_id=cid;
  r := ca_packaging_store(j.job_id,'{"youtube":{"title":"x"}}','h','{}',0.9);
  PERFORM pg_temp.chk('duplicate worker call is a no-op (no 2nd version)', r->>'skipped'='job_not_running' AND (SELECT count(*) FROM content_versions WHERE content_id=cid)=n1);
END $$;
-- crash consistency: stuck 'publishing' is parked for a human, never auto-retried
DO $$ DECLARE sid uuid; r jsonb; BEGIN
  SELECT schedule_id INTO sid FROM schedules WHERE status='failed' LIMIT 1;
  UPDATE schedules SET status='publishing' WHERE schedule_id=sid;
  ALTER TABLE schedules DISABLE TRIGGER trg_touch_schedules; UPDATE schedules SET updated_at=now()-interval '2 hours' WHERE schedule_id=sid; ALTER TABLE schedules ENABLE TRIGGER trg_touch_schedules;
  r := ca_supervisor_tick();
  PERFORM pg_temp.chk('stuck publishing is parked (failed + CRITICAL), not retried', (r->>'publications_parked')::int>=1 AND (SELECT status='failed' AND last_error LIKE '%never auto-retried%' FROM schedules WHERE schedule_id=sid) AND EXISTS(SELECT 1 FROM notifications WHERE dedup_key='stuck-pub:'||sid));
END $$;
-- repeated rejection is idempotent (no second approval.rejected event)
DO $$ DECLARE aid uuid; r1 jsonb; r2 jsonb; n1 int; BEGIN
  SELECT approval_id INTO aid FROM approvals WHERE status='awaiting_approval' LIMIT 1;
  IF aid IS NULL THEN INSERT INTO approvals(content_id,version) SELECT content_id,current_version FROM content WHERE status='needs_approval' LIMIT 1 RETURNING approval_id INTO aid; END IF;
  r1 := ca_approval_action(jsonb_build_object('action','reject','approval_id',aid,'by','me')); SELECT count(*) INTO n1 FROM events WHERE event_type='approval.rejected';
  r2 := ca_approval_action(jsonb_build_object('action','reject','approval_id',aid,'by','me'));
  PERFORM pg_temp.chk('repeated reject is a no-op (one event)', (r1->>'ok')::boolean AND r2->>'noop'='already_rejected' AND (SELECT count(*) FROM events WHERE event_type='approval.rejected')=n1);
END $$;
-- ISSUE-009: cache is written only from fetched text and a cache-only assessment does not renew it
DO $$ DECLARE j jobs; exp1 timestamptz; BEGIN
  DELETE FROM policy_knowledge;
  SELECT * INTO j FROM ca_enqueue('monetization_policy',(SELECT source_id FROM sources LIMIT 1),NULL,'{"channel_id":"00000000-0000-0000-0000-0000000000c1"}',5,'cache-t1'); UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id;
  PERFORM ca_policy_store(j.job_id,'[{"platform":"youtube","monetization_status":"conditional","policy_risk":"low","evidence":[{"url":"https://x"}]}]',true);
  SELECT expires_at INTO exp1 FROM policy_knowledge WHERE platform='youtube';
  PERFORM pg_temp.chk('cache created from fetched text', exp1 IS NOT NULL);
  UPDATE policy_knowledge SET expires_at=now()+interval '1 day', fetched_at=now()-interval '13 days' WHERE platform='youtube';
  SELECT * INTO j FROM ca_enqueue('monetization_policy',(SELECT source_id FROM sources LIMIT 1),NULL,'{"channel_id":"00000000-0000-0000-0000-0000000000c1"}',5,'cache-t2'); UPDATE jobs SET status='running',attempt=1 WHERE job_id=j.job_id;
  PERFORM ca_policy_store(j.job_id,'[{"platform":"youtube","monetization_status":"conditional","policy_risk":"low","evidence":[{"url":"https://x"}]}]',false);
  PERFORM pg_temp.chk('cache-only assessment does NOT renew the cache', (SELECT expires_at<now()+interval '2 days' FROM policy_knowledge WHERE platform='youtube'));
END $$;
-- T18 / notifications dedup
SELECT pg_temp.chk('T18 critical notifications queued (pending) for Gmail', (SELECT count(*)>=1 FROM notifications WHERE level='CRITICAL' AND status='pending'));
SELECT pg_temp.chk('notification dedup', (SELECT ca_notify('CRITICAL','x','s','b','dupkey',NULL,NULL) IS NOT NULL) AND (SELECT ca_notify('CRITICAL','x','s','b','dupkey',NULL,NULL) IS NULL));
SELECT ca_notify('INFO','x','info-subject','b',NULL,NULL,NULL);
SELECT pg_temp.chk('INFO never emailed', (SELECT status='skipped' FROM notifications WHERE subject='info-subject'));
-- supervisor tick runs
SELECT pg_temp.chk('supervisor tick returns summary', ca_supervisor_tick() ? 'recovered_stuck');
SELECT pg_temp.chk('audit trail exists for content lifecycle', (SELECT count(DISTINCT event_type)>=8 FROM events));
\o
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END r, name, detail FROM t_results ORDER BY 1 DESC, 2;
ROLLBACK;

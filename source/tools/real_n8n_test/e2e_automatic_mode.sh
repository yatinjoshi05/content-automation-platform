#!/bin/bash
exec > /tmp/e2e3.log 2>&1
export PGPASSWORD=n8npass; P="timeout 20 psql -h localhost -U n8n -d content_automation"; H='Content-Type: application/json'; K='X-CA-Key: test-internal-key'
echo "== fresh deploy of the FINAL build (mock-pointed copies, test credentials)"; /tmp/setup_all.sh fresh; sleep 60
curl -s -m 3 localhost:5678/healthz; echo; curl -s -m 3 localhost:9100/health; echo
$P -qc "UPDATE policy_knowledge SET expires_at=now() WHERE false" -c "DELETE FROM policy_knowledge" -c "UPDATE settings SET value='{\"youtube\":[\"https://localhost:9443/policy/youtube\"]}' WHERE key='policy_source_urls'" -c "UPDATE channels SET clip_min_seconds=4, autonomy_mode='automatic' WHERE id='00000000-0000-0000-0000-0000000000c1'"
echo "== TEST CONFIG (labelled): channel AUTOMATIC mode, empty policy cache, policy page = local https mock, min clip 4s"
curl -s localhost:9000/__mode -d '{"openshorts":"ok","policy":"pass","policyVersion":1,"whDelay":800,"clipDelay":0,"yt":"ok"}' >/dev/null; : > /tmp/mock/mock.log
$P -qAtc "select ca_enqueue('trend_research','00000000-0000-0000-0000-0000000000c1',NULL,'{\"channel_id\":\"00000000-0000-0000-0000-0000000000c1\"}',5,'final-e2e-auto')" >/dev/null
for i in $(seq 1 60); do sleep 15; N=$($P -Atc "select count(*) from schedules"); echo "t=$((i*15))s schedules=$N awaiting_human_approval=$($P -Atc "select count(*) from approvals where status='awaiting_approval'") jobs=$($P -Atc "select string_agg(job_type||':'||status||':'||c,' ') from (select job_type,status,count(*) c from jobs group by 1,2 order by 1,2) x")"; [ "$N" -ge 4 ] && break; done
echo "== AUTOMATIC MODE RESULT (no human approval webhook was called)"
$P -c "select a.status approval, a.approved_by, c.status content, c.approved_version av, c.current_version cv from approvals a join content c using(content_id) order by a.created_at"
$P -c "select left(content_id::text,8) c, platform, to_char(scheduled_at at time zone 'Asia/Kolkata','MM-DD HH24:MI IST') at, status from schedules order by scheduled_at"
echo "-- policy: fetches=$(grep -c POLICY_FETCH /tmp/mock/mock.log); cache row:"; $P -Atc "select platform||' fetched '||fetched_at::time(0)||' status='||status from policy_knowledge"
echo "-- QA/versions:"; $P -Atc "select 'v'||version||' vpass='||coalesce(qa->>'visual_pass','?')||' thumb='||(thumbnail_url is not null)||' q='||quality_score from content_versions order by created_at"
echo "== force schedules due (TEST ACTION) -> real publishing workflow + FINAL PUBLISH GATE"
$P -qAtc "update schedules s set scheduled_at=now()-((r.n*10)||' minutes')::interval from (select schedule_id,(row_number() over (order by created_at))::int n from schedules where status='scheduled') r where s.schedule_id=r.schedule_id"
sleep 150
$P -c "select left(content_id::text,8) c, platform, status, publication_attempts att, left(last_error,80) err from schedules order by scheduled_at"
$P -Atc "select 'publications: '||coalesce(string_agg(status||'/'||left(coalesce(error,''),50),'; '),'none') from publications"
$P -Atc "select 'errors: '||category||' '||severity||' wf='||workflow||' | '||left(message,80) from errors where workflow in ('publishing','publish_gate')"
$P -Atc "select 'auth circuits: '||name||' '||state from integration_health where name like 'auth_%'"
$P -Atc "select 'CRITICAL notifications: '||count(*) from notifications where level='CRITICAL'"
echo E2E3_DONE

#!/bin/bash
exec > /tmp/e2e2.log 2>&1
export PGPASSWORD=n8npass; P="timeout 20 psql -h localhost -U n8n -d content_automation"; H='Content-Type: application/json'; K='X-CA-Key: test-internal-key'
/tmp/n8n_ctl.sh stop; sleep 2; (setsid nohup bash -c '/tmp/n8n_ctl.sh start' > /tmp/start.out 2>&1 < /dev/null &); sleep 55; curl -s -m 3 localhost:5678/healthz; echo
: > /tmp/mock/mock.log
echo "== TEST CONFIG (labelled): empty policy cache, policy URL = local https mock, test channel min clip 4s"
$P -qc "DELETE FROM policy_knowledge" -c "UPDATE settings SET value='{\"youtube\":[\"https://localhost:9443/policy/youtube\"]}' WHERE key='policy_source_urls'" -c "UPDATE channels SET clip_min_seconds=4 WHERE id='00000000-0000-0000-0000-0000000000c1'"
$P -Atc "select 'policy_knowledge rows before run: '||count(*) from policy_knowledge"
curl -s localhost:9000/__mode -d '{"openshorts":"ok","policy":"pass","policyVersion":1,"whDelay":800,"clipDelay":0}' >/dev/null
$P -qAtc "select ca_enqueue('trend_research','00000000-0000-0000-0000-0000000000c1',NULL,'{\"channel_id\":\"00000000-0000-0000-0000-0000000000c1\"}',5,'final-e2e-1')" >/dev/null
for i in $(seq 1 45); do sleep 15; N=$($P -Atc "select count(*) from approvals where status='awaiting_approval'"); echo "t=$((i*15))s awaiting_approval=$N jobs=$($P -Atc "select string_agg(job_type||':'||status||':'||c,' ') from (select job_type,status,count(*) c from jobs group by 1,2 order by 1,2) x")"; [ "$N" -ge 4 ] && break; done
echo "== E2E reached approval"
echo "-- policy fetches by workflow (mock log):"; grep -c POLICY_FETCH /tmp/mock/mock.log
echo "-- cache row written BY THE WORKFLOW:"; $P -c "select platform, status, fetched_at::time(0) fetched, expires_at::date exp, summary->>'derived_from' derived, source_urls from policy_knowledge"
echo "-- assessments:"; $P -c "select s.platform_video_id, pa.monetization_status, pa.policy_risk, pa.reasons->>1 saw from policy_assessments pa join sources s using(source_id) where pa.status='active' order by pa.created_at"
echo "-- QA/versions:"; $P -Atc "select 'version '||version||' vpass='||coalesce(qa->>'visual_pass','?')||' thumb='||(thumbnail_url is not null)||' q='||quality_score from content_versions order by created_at"
echo "== approve all via real webhook"
for id in $($P -Atc "select approval_id from approvals where status='awaiting_approval'"); do curl -s -m 30 -X POST localhost:5678/webhook/ca-api-approval -H "$H" -H "$K" -d "{\"approval_id\":\"$id\",\"action\":\"approve\",\"by\":\"tester\"}" | head -c 80; echo; done
for i in $(seq 1 16); do sleep 15; N=$($P -Atc "select count(*) from schedules"); echo "schedules=$N"; [ "$N" -ge 4 ] && break; done
$P -c "select left(content_id::text,8) c, platform, to_char(scheduled_at at time zone 'Asia/Kolkata','MM-DD HH24:MI') ist, status from schedules order by scheduled_at"
echo E2E_DONE

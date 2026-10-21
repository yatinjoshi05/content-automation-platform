#!/bin/bash
export PGPASSWORD=n8npass; P="timeout 20 psql -h localhost -U n8n -d content_automation"; H='Content-Type: application/json'; K='X-CA-Key: test-internal-key'; W=localhost:5678/webhook
echo "== 1. repeated approval via real webhook"
APR=$($P -Atc "select approval_id from approvals where status='scheduled' limit 1"); echo -n "approve an already-scheduled approval -> "; curl -s -m 30 -X POST $W/ca-api-approval -H "$H" -H "$K" -d "{\"approval_id\":\"$APR\",\"action\":\"approve\"}"; echo
echo "== 2. repeated rejection via real webhook (TEST DATA: put one approval back to awaiting via the real 'edit' action first)"
APE=$($P -Atc "select approval_id from approvals where status='scheduled' offset 0 limit 1")
curl -s -m 30 -X POST $W/ca-api-approval -H "$H" -H "$K" -d "{\"approval_id\":\"$APE\",\"action\":\"edit\",\"by\":\"tester\",\"per_platform\":{\"youtube\":{\"title\":\"Edited title v2\",\"description\":\"d\",\"hashtags\":[\"a\"]}}}"; echo
$P -Atc "select 'after edit: approval='||a.status||' v'||a.version||' content current v'||c.current_version||' approved_version='||coalesce(c.approved_version::text,'NULL')||' schedule='||coalesce((select string_agg(status,',') from schedules s where s.content_id=c.content_id),'-') from approvals a join content c using(content_id) where a.approval_id='$APE'"
echo -n "stale approve of v1 -> "; curl -s -m 30 -X POST $W/ca-api-approval -H "$H" -H "$K" -d "{\"approval_id\":\"$APE\",\"action\":\"approve\",\"version\":1}"; echo
for i in 1 2 3; do echo -n "reject #$i -> "; curl -s -m 30 -X POST $W/ca-api-approval -H "$H" -H "$K" -d "{\"approval_id\":\"$APE\",\"action\":\"reject\",\"by\":\"tester\"}"; echo; done
$P -Atc "select 'approval.rejected events for that content: '||count(*) from events where event_type='approval.rejected' and entity_id=(select content_id from approvals where approval_id='$APE')"
echo "== 3. duplicate scheduling job for an already-scheduled content (TEST DATA: second scheduling job with a different idempotency key)"
CID=$($P -Atc "select content_id from schedules where status in ('failed','blocked','scheduled') and content_id<>(select content_id from approvals where approval_id='$APE') limit 1")
N0=$($P -Atc "select count(*) from schedules where content_id='$CID'"); $P -qAtc "select ca_enqueue('scheduling','$CID',NULL,'{\"version\":1}',5,'dup-sched-attack-1')" >/dev/null; $P -qAtc "select ca_enqueue('scheduling','$CID',NULL,'{\"version\":1}',5,'dup-sched-attack-1')" >/dev/null
sleep 50; $P -Atc "select 'scheduling jobs with same key: '||count(*)||' | schedules for content before='||$N0||' after='||(select count(*) from schedules where content_id='$CID') from jobs where idempotency_key='dup-sched-attack-1'"
$P -Atc "select 'job status: '||status from jobs where idempotency_key='dup-sched-attack-1'"
echo "== 4. duplicate publication attempt through the REAL publishing workflow (TEST DATA: mark an existing publication as already published, re-open its schedule)"
read PCID PSID <<< $($P -Atc "select content_id||' '||schedule_id from schedules where status='failed' and last_error like '%credentials%' limit 1")
$P -qc "UPDATE publications SET status='published', platform_post_id='TESTDATA-already-live', error=NULL WHERE schedule_id='$PSID'" -c "UPDATE schedules SET status='scheduled', scheduled_at=now()-interval '5 minutes', last_error=NULL WHERE schedule_id='$PSID'" -c "UPDATE integration_health SET state='closed',consecutive_failures=0 WHERE name LIKE 'auth\_%'"
sleep 100
$P -Atc "select 'schedule after attempt: '||status from schedules where schedule_id='$PSID'"
$P -Atc "select 'publications rows for that schedule (must be 1): '||count(*) from publications where schedule_id='$PSID'"
$P -Atc "select level||' '||left(subject,60) from notifications where dedup_key like 'dup:%'"
$P -Atc "select 'event: '||payload->>'reason' from events where event_type='publication.failed' and payload->>'reason'='duplicate_publication_prevented' limit 1"

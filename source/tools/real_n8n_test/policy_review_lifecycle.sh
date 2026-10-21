#!/bin/bash
export PGPASSWORD=n8npass; P="timeout 20 psql -h localhost -U n8n -d content_automation"; H='Content-Type: application/json'; K='X-CA-Key: test-internal-key'
echo "--- TEST DATA (labelled): replace policy assessments for two sources: SRC_A review_required, SRC_B blocked"
read SA SB <<< $($P -Atc "select string_agg(source_id::text,' ') from (select distinct s.source_id from schedules sc join content c using(content_id) join sources s using(source_id) where sc.status='scheduled') x")
echo "SRC_A=$SA SRC_B=$SB"
$P -qc "UPDATE policy_assessments SET status='superseded' WHERE source_id IN ('$SA','$SB') AND status='active'" -c "INSERT INTO policy_assessments(source_id,platform,rights_status,monetization_status,policy_risk,reasons,evidence) VALUES ('$SA','youtube','verified','review_required','medium','[\"reused content risk\"]','[{\"url\":\"https://example.test/p\"}]'),('$SB','youtube','verified','blocked','high','[\"not eligible per assessment\"]','[{\"url\":\"https://example.test/p\"}]')" -c "UPDATE integration_health SET state='closed',consecutive_failures=0 WHERE name LIKE 'auth\_%'"
echo "(auth circuit closed = simulating the user reconnecting)"; sleep 130
echo "== real publishing workflow vs unresolved policy:"; $P -c "select left(s.content_id::text,8) c, case when c.source_id='$SA' then 'SRC_A' else 'SRC_B' end src, s.status, left(s.last_error,80) err from schedules s join content c using(content_id) order by 2,1"
echo "== human review via REAL webhook:"
echo -n "no reason -> "; curl -s -m 30 -X POST localhost:5678/webhook/ca-api-policy-review -H "$H" -H "$K" -d "{\"source_id\":\"$SA\",\"decision\":\"approved\",\"reviewer\":\"owner\"}" | head -c 90; echo
echo -n "bad uuid  -> "; curl -s -m 30 -X POST localhost:5678/webhook/ca-api-policy-review -H "$H" -H "$K" -d '{"source_id":"nope","decision":"approved","reviewer":"o","reason":"r"}' | head -c 90; echo
echo -n "approve BLOCKED SRC_B -> "; curl -s -m 30 -X POST localhost:5678/webhook/ca-api-policy-review -H "$H" -H "$K" -d "{\"source_id\":\"$SB\",\"decision\":\"approved\",\"reviewer\":\"owner\",\"reason\":\"override please\"}"; echo
echo -n "approve review_required SRC_A -> "; curl -s -m 30 -X POST localhost:5678/webhook/ca-api-policy-review -H "$H" -H "$K" -d "{\"source_id\":\"$SA\",\"decision\":\"approved\",\"reviewer\":\"owner\",\"reason\":\"Commentary added in v1; reviewed evidence\",\"content_version\":1,\"evidence\":[{\"note\":\"manual review\"}]}"; echo
sleep 130
echo "== after approval:"; $P -c "select left(s.content_id::text,8) c, case when c.source_id='$SA' then 'SRC_A' else 'SRC_B' end src, s.status, s.publication_attempts att, left(s.last_error,90) err from schedules s join content c using(content_id) order by 2,1"
$P -c "select decision, reviewer, content_version cv, left(reason,40) reason, assessment_id is not null has_assessment from policy_reviews"
$P -Atc "select 'publications: '||coalesce(string_agg(status||'/'||left(coalesce(error,''),50),'; '),'none') from publications where content_id in (select content_id from content where source_id='$SA')"
$P -Atc "select 'audit: '||action||' '||new_state from audit_logs where action='policy_review'"

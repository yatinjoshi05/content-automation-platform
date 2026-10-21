#!/bin/bash
exec > /tmp/cache_test4.log 2>&1
export PGPASSWORD=n8npass; P="timeout 20 psql -h localhost -U n8n -d content_automation"
fetches() { grep -c POLICY_FETCH /tmp/mock/mock.log; }
waitpol() { for i in $(seq 1 20); do sleep 8; S=$($P -Atc "select status from jobs where job_type='monetization_policy' and entity_id=(select source_id from sources where platform_video_id='$1')"); [ "$S" = completed ] && break; done; echo "policy job for $1: $S"; }
saw() { $P -Atc "select '  assessment: '||pa.monetization_status||'/'||pa.policy_risk||' | '||coalesce(pa.reasons->>1,'(no 2nd reason)') from policy_assessments pa where pa.status='active' and pa.source_id=(select source_id from sources where platform_video_id='$1')"; }
ep() { $P -Atc "select coalesce(extract(epoch from fetched_at)::bigint::text,'NONE') from policy_knowledge where platform='youtube'"; }
$P -qc "UPDATE settings SET value='0' WHERE key='max_concurrent_video_jobs'" -c "DELETE FROM policy_knowledge" -c "UPDATE settings SET value='{\"youtube\":[\"https://localhost:9443/policy/youtube\"]}' WHERE key='policy_source_urls'"
: > /tmp/mock/mock.log; curl -s localhost:9000/__mode -d '{"policyVersion":1}' >/dev/null
echo "== 0: cache EMPTY + URL configured -> workflow must fetch, assess (not review_required) and CREATE the cache"; echo "  cache before: $(ep)"; /tmp/mkpol.sh cachevidH000 >/dev/null; waitpol cachevidH000; echo "  fetches=$(fetches) cache after: $(ep)"; saw cachevidH000
$P -qc "UPDATE policy_knowledge SET fetched_at=now()-interval '6 days', expires_at=now()+interval '8 days' WHERE platform='youtube'"   # TEST ACTION: age the WORKFLOW-CREATED row so renewal-by-reuse would be visible
A=$(ep); echo "  aged fetched_at epoch=$A"
echo "== C: fresh cache -> REUSED (no fetch) and NOT renewed"; /tmp/mkpol.sh cachevidHC00 >/dev/null; waitpol cachevidHC00; echo "  fetches=$(fetches) fetched_at unchanged: $([ "$A" = "$(ep)" ] && echo YES || echo NO)"; saw cachevidHC00
echo "== D: page now v2 but cache fresh -> reuse (v1); change detected only after expiry (known limitation)"; curl -s localhost:9000/__mode -d '{"policyVersion":2}' >/dev/null; /tmp/mkpol.sh cachevidHD00 >/dev/null; waitpol cachevidHD00; echo "  fetches=$(fetches)"; saw cachevidHD00
echo "== E: cache expired -> refetch, new policy text (v2), cache refreshed"; $P -qc "UPDATE policy_knowledge SET expires_at=now()-interval '1 day' WHERE platform='youtube'"; /tmp/mkpol.sh cachevidHE00 >/dev/null; waitpol cachevidHE00; echo "  fetches=$(fetches) fetched_at renewed: $([ "$A" != "$(ep)" ] && echo YES || echo NO)"; saw cachevidHE00
$P -qc "UPDATE jobs SET status='cancelled' WHERE job_type='clipping' AND status='queued' AND entity_id IN (SELECT source_id FROM sources WHERE platform_video_id LIKE 'cachevidH%')" -c "UPDATE settings SET value='1' WHERE key='max_concurrent_video_jobs'"
echo CACHE4_DONE

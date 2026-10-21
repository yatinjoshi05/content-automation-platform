#!/bin/bash
exec > /tmp/kill_test.log 2>&1
export PGPASSWORD=n8npass; P="timeout 20 psql -h localhost -U n8n -d content_automation"
kill_n8n() { for d in /proc/[0-9]*; do c=$(tr '\0' ' ' < $d/cmdline 2>/dev/null); case "$c" in *n8n/bin/n8n*start*) case "$c" in *kill_n8n*) ;; *) kill -9 ${d#/proc/} 2>/dev/null;; esac;; esac; done; echo "   >>> n8n KILLED (kill -9) at $(date +%T)"; }
start_n8n() { (setsid nohup bash -c '/tmp/n8n_ctl.sh start' > /dev/null 2>&1 < /dev/null &); for i in $(seq 1 50); do sleep 3; curl -s -m 2 localhost:5678/healthz | grep -q ok && break; done; echo "   >>> n8n restarted, health=$(curl -s -m 2 localhost:5678/healthz) at $(date +%T)"; }
mode() { curl -s localhost:9000/__mode -d "$1" > /dev/null; }
echo "TEST CONFIG (labelled): stuck_job_minutes=1 (waiting recovered after 4), stuck_publish_minutes=1"
$P -qc "UPDATE settings SET value='1' WHERE key IN ('stuck_job_minutes','stuck_publish_minutes')" -c "UPDATE integration_health SET state='closed',consecutive_failures=0 WHERE name LIKE 'auth\_%' OR name='openshorts'"
echo; echo "######## A. KILL n8n DURING PUBLISHING (clip download step held 90s by the mock)"
mode '{"clipDelay":90000}'
for i in $(seq 1 30); do sleep 5; S=$($P -Atc "select schedule_id from schedules where status='publishing' limit 1"); [ -n "$S" ] && break; done
SID=$S; echo "   publishing in flight: schedule=$SID"; $P -Atc "select '   publication row: '||status from publications where schedule_id='$SID'"
kill_n8n; mode '{"clipDelay":0}'; sleep 5; start_n8n
echo "   state right after restart: $($P -Atc "select s.status||' / publication '||p.status from schedules s join publications p using(schedule_id) where s.schedule_id='$SID'")"
for i in $(seq 1 16); do sleep 15; ST=$($P -Atc "select status from publications where schedule_id='$SID'"); [ "$ST" = ambiguous ] && break; done
echo "   after supervisor: $($P -Atc "select 'schedule='||s.status||' | publication='||p.status||' | '||left(s.last_error,95) from schedules s join publications p using(schedule_id) where s.schedule_id='$SID'")"
echo "   CRITICAL notification rows: $($P -Atc "select count(*) from notifications where level='CRITICAL' and dedup_key='stuck-pub:$SID'")"
sleep 150
echo "   3 min later (must be unchanged, no auto-retry): $($P -Atc "select 'schedule='||s.status||' | publication='||p.status||' | publication rows='||(select count(*) from publications where schedule_id='$SID') from schedules s join publications p using(schedule_id) where s.schedule_id='$SID'")"
echo "A_DONE"
echo; echo "######## B1. KILL n8n WHILE CLIPPING IS 'waiting' FOR THE OPENSHORTS WEBHOOK; the webhook is LOST"
$P -qc "UPDATE integration_health SET state='closed',consecutive_failures=0 WHERE name='openshorts'"
mode '{"openshorts":"ok","whDelay":60000}'; /tmp/mkclip.sh lostwh000001 > /dev/null
for i in $(seq 1 30); do sleep 5; W=$($P -Atc "select external_job_id from jobs where job_type='clipping' and status='waiting' and entity_id=(select source_id from sources where platform_video_id='lostwh000001')"); [ -n "$W" ] && break; done
echo "   job waiting on OpenShorts job $W"; kill_n8n; mode '{"whDelay":800}'; sleep 75
echo "   mock log: $(grep 'webhook->n8n' /tmp/mock/mock.log | tail -1)"; start_n8n
JID="(select job_id from jobs where job_type='clipping' and entity_id=(select source_id from sources where platform_video_id='lostwh000001'))"
echo "   job right after restart: $($P -Atc "select status||' attempt='||attempt from jobs where job_id=$JID")  (webhook lost: nothing completes it)"
for i in $(seq 1 40); do sleep 15; ST=$($P -Atc "select status from jobs where job_id=$JID"); [ "$ST" = completed ] && break; done
echo "   final: $($P -Atc "select status||' attempt='||attempt||' recovery_level='||recovery_level||' external='||external_job_id from jobs where job_id=$JID")"
echo "   clips for source: $($P -Atc "select count(*)||' (distinct fingerprints '||count(distinct fingerprint)||')' from clips where source_id=(select source_id from sources where platform_video_id='lostwh000001')")"
curl -s -m 20 localhost:9000/__resend -d "{\"job_id\":\"$W\"}" > /dev/null; sleep 8
echo "   LATE webhook of the OLD job re-delivered -> clips now: $($P -Atc "select count(*) from clips where source_id=(select source_id from sources where platform_video_id='lostwh000001')") (must be unchanged)"
echo "B1_DONE"
echo; echo "######## B2. KILL n8n WHILE CLIPPING IS 'running' (OpenShorts submit hanging)"
mode '{"openshorts":"hang"}'; /tmp/mkclip.sh runhang00001 > /dev/null
for i in $(seq 1 30); do sleep 5; R=$($P -Atc "select status from jobs where job_type='clipping' and entity_id=(select source_id from sources where platform_video_id='runhang00001')"); [ "$R" = running ] && break; done
echo "   job state before kill: $R"; kill_n8n; mode '{"openshorts":"ok","whDelay":800}'; sleep 5; start_n8n
JID2="(select job_id from jobs where job_type='clipping' and entity_id=(select source_id from sources where platform_video_id='runhang00001'))"
echo "   job right after restart: $($P -Atc "select status||' attempt='||attempt from jobs where job_id=$JID2")  (silently 'running' until the supervisor acts)"
for i in $(seq 1 30); do sleep 15; ST=$($P -Atc "select status from jobs where job_id=$JID2"); [ "$ST" = completed ] && break; done
echo "   final: $($P -Atc "select status||' attempt='||attempt||' recovery_level='||recovery_level from jobs where job_id=$JID2")"
echo "   clips: $($P -Atc "select count(*)||' (distinct '||count(distinct fingerprint)||')' from clips where source_id=(select source_id from sources where platform_video_id='runhang00001')")"
echo "   dead_letter/blocked jobs anywhere: $($P -Atc "select count(*) from jobs where status in ('dead_letter','blocked')")"
echo "KILL_ALL_DONE"

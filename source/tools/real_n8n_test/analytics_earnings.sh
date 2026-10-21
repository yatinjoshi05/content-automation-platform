#!/bin/bash
export PGPASSWORD=n8npass; P="timeout 20 psql -h localhost -U n8n -d content_automation"; H='Content-Type: application/json'; K='X-CA-Key: test-internal-key'
echo "--- TEST DATA (labelled): one fabricated 'published' publication pointing at a video id the mock YouTube API knows"
$P -qc "INSERT INTO publications(content_id,channel_id,platform,version,idempotency_key,platform_post_id,status,published_at) SELECT content_id,channel_id,'youtube',1,'TESTDATA:analytics:'||content_id,'abcdefghij1','published',now()-interval '1 hour' FROM content LIMIT 1"
WID=$(PGPASSWORD=n8npass psql -h localhost -U n8n -d n8n_meta -Atc "select id from workflow_entity where name like 'CA 11%'")
. /tmp/n8nenv.sh; export N8N_RUNNERS_BROKER_PORT=5680 N8N_PORT=5690; cd /tmp/n8nrun
run() { timeout 120 node node_modules/n8n/bin/n8n execute --id=$WID 2>&1 | grep -E '"status"|Error' | head -3; }
echo "== run 1 (manual trigger path: Recent Publications -> YouTube stats -> snapshot)"; run
$P -c "select platform, views, likes, comments, shares, watch_time_seconds, metrics_available from analytics_snapshots"
echo "== run 2 immediately (idempotency: must NOT add a second snapshot within 5h)"; run
$P -Atc "select 'snapshots after run 2: '||count(*) from analytics_snapshots"
$P -Atc "select 'event analytics.updated: '||count(*) from events where event_type='analytics.updated'"
echo "== YouTube API 500 -> circuit records failure, no fabricated snapshot"
curl -s localhost:9000/__mode -d '{"yt":"500"}' >/dev/null; $P -qc "DELETE FROM analytics_snapshots"; run
$P -Atc "select 'snapshots after API failure: '||count(*)||' | youtube_api failures='||(select consecutive_failures from integration_health where name='youtube_api') from analytics_snapshots"
curl -s localhost:9000/__mode -d '{"yt":"ok"}' >/dev/null
echo "== EARNINGS API (real webhook)"
EP=localhost:5678/webhook/ca-api-earning
CH=00000000-0000-0000-0000-0000000000c1
echo -n "estimated      -> "; curl -s -m 30 -X POST $EP -H "$H" -H "$K" -d "{\"platform\":\"youtube\",\"channel_id\":\"$CH\",\"period_start\":\"2026-09-01\",\"period_end\":\"2026-09-30\",\"gross_amount\":12.5,\"currency\":\"USD\",\"usd_amount\":12.5,\"program\":\"shorts\",\"confirmation\":\"estimated\"}"; echo
echo -n "confirmed      -> "; curl -s -m 30 -X POST $EP -H "$H" -H "$K" -d "{\"platform\":\"youtube\",\"channel_id\":\"$CH\",\"period_start\":\"2026-08-01\",\"period_end\":\"2026-08-31\",\"gross_amount\":9.1,\"currency\":\"USD\",\"usd_amount\":9.1,\"confirmation\":\"confirmed\",\"payout_status\":\"paid\"}"; echo
echo -n "bad confirmation -> "; curl -s -m 30 -X POST $EP -H "$H" -H "$K" -d '{"platform":"youtube","currency":"USD","gross_amount":1,"confirmation":"sure"}' | head -c 60; echo
echo -n "bad currency   -> "; curl -s -m 30 -X POST $EP -H "$H" -H "$K" -d '{"platform":"youtube","currency":"dollars","gross_amount":1,"confirmation":"estimated"}' | head -c 60; echo
echo -n "negative amount-> "; curl -s -m 30 -X POST $EP -H "$H" -H "$K" -d '{"platform":"youtube","currency":"USD","gross_amount":-5,"confirmation":"estimated"}' | head -c 60; echo
echo -n "no auth key    -> "; curl -s -m 30 -o /dev/null -w "%{http_code}" -X POST $EP -H "$H" -d '{}'; echo
$P -c "select platform, confirmation, gross_amount, currency, period_start, payout_status from earnings order by period_start"

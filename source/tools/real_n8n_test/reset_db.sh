#!/bin/bash
export PGPASSWORD=n8npass; P="psql -h localhost -U n8n -q -v ON_ERROR_STOP=1"
psql -h localhost -U n8n -d postgres -q -c "DROP DATABASE IF EXISTS content_automation" -c "CREATE DATABASE content_automation" 2>&1 | grep -v NOTICE
$P -d content_automation -f /home/claude/n8n-workflows/db/schema.sql 2>&1 | grep -v NOTICE | head -3
$P -d content_automation <<'SQL'
UPDATE settings SET value='"http://localhost:9000"' WHERE key='openshorts_base_url';
UPDATE settings SET value='"http://localhost:5678"' WHERE key='n8n_webhook_base';
UPDATE models SET base_url='http://localhost:9000' WHERE provider='ollama';
INSERT INTO niches(slug,name,keywords) VALUES ('funny','Funny','{funny fails}');
INSERT INTO channels(id,name,niche_id,platforms,autonomy_mode,posts_per_day,preferred_windows)
 SELECT '00000000-0000-0000-0000-0000000000c1','Funny Shorts',id,'{youtube}','manual',2,'[{"start":"12:30"},{"start":"20:00"}]' FROM niches WHERE slug='funny';
INSERT INTO authorized_creators(id,creator,platform,external_channel_id,permission_status,permission_evidence,allowed_platforms,niche_slugs,verification_timestamp)
 VALUES ('00000000-0000-0000-0000-0000000000b1','Creator A','youtube','UCcreatorA','verified','licence email 2026-09-01','{youtube}','{funny}',now());
SQL

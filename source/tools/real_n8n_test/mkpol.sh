#!/bin/bash
# TEST HELPER: new rights-verified source + queued monetization_policy job (the workflow under test does the rest)
export PGPASSWORD=n8npass
psql -h localhost -U n8n -d content_automation -Atq <<SQL
WITH s AS (INSERT INTO sources(canonical_id,normalized_url,source_platform,platform_video_id,creator,authorized_creator_id,title,duration_seconds,channel_id,status)
  VALUES ('youtube:$1','https://www.youtube.com/watch?v=$1','youtube','$1','Creator A','00000000-0000-0000-0000-0000000000b1','Policy test $1',2400,'00000000-0000-0000-0000-0000000000c1','rights_verified') RETURNING source_id),
p AS (INSERT INTO permissions(source_id,permission_status,permission_evidence,allowed_platforms,verification_timestamp) SELECT source_id,'verified','test licence','{youtube}',now() FROM s)
SELECT (ca_enqueue('monetization_policy',source_id,NULL,'{"channel_id":"00000000-0000-0000-0000-0000000000c1"}'::jsonb,6,'policy:'||source_id)).job_id FROM s;
SQL

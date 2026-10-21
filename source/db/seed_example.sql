-- OPTIONAL example configuration (not required by any workflow). Edit, then: psql -d content_automation -f db/seed_example.sql
-- Channels/niches/platforms/schedule/rules are DATA. Adding a channel never needs a workflow edit.
INSERT INTO niches(slug,name,keywords) VALUES
 ('funny','Funny','{funny fails,comedy skits}'),
 ('podcasts','Podcasts','{podcast highlights,podcast clips}'),
 ('asmr','ASMR','{asmr,relaxing sounds}'),
 ('creator-clips','Creator-authorized clips','{challenge,giveaway challenge}')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO channels(name,niche_id,platforms,autonomy_mode,posts_per_day,preferred_windows,rules)
SELECT 'Funny Shorts', id, '{youtube}', 'manual', 2, '[{"start":"12:30"},{"start":"20:00"}]', '{"banned_phrases":[],"auto_windows":false}' FROM niches WHERE slug='funny'
ON CONFLICT DO NOTHING;
-- Rights registry: ONLY creators you are authorized to use. external_channel_id = YouTube channel id (UC...).
-- INSERT INTO authorized_creators(creator,platform,external_channel_id,permission_status,permission_evidence,permission_source_url,allowed_platforms,commercial_use_allowed,monetization_allowed,attribution_required,attribution_text,niche_slugs,verification_timestamp)
-- VALUES ('Creator Name','youtube','UCxxxxxxxxxxxxxxxxxxxxxx','verified','Signed licence dated ...','https://.../proof','{youtube,instagram,facebook}',true,true,true,'Credit: Creator Name','{funny}',now());
-- Platform accounts: credential_ref is only the NAME of an n8n credential (never a secret).
-- INSERT INTO platform_accounts(channel_id,platform,external_account_id,credential_ref) SELECT id,'youtube',NULL,'YouTube OAuth2 - Funny Shorts' FROM channels WHERE name='Funny Shorts';
-- Optional: official policy pages the Monetization & Policy stage may research (empty => every assessment is review_required).
-- UPDATE settings SET value='{"youtube":["https://support.google.com/youtube/answer/..."]}' WHERE key='policy_source_urls';
-- Enable cloud free-tier models after creating credentials:
-- UPDATE settings SET value='true' WHERE key='enable_cloud_models'; UPDATE models SET enabled=true WHERE provider IN ('gemini','groq');

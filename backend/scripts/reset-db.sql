-- backend/scripts/reset-db.sql

-- Drop VOD related tables first
DROP TABLE IF EXISTS vod_segments CASCADE;
DROP TABLE IF EXISTS vod_processing_history CASCADE;
DROP TABLE IF EXISTS vod_chapters CASCADE;
DROP TABLE IF EXISTS download_queue CASCADE;
DROP TABLE IF EXISTS vod_downloads CASCADE;
DROP TABLE IF EXISTS vods CASCADE;

-- Drop all metric tables
DROP TABLE IF EXISTS engagement_metrics CASCADE;
DROP TABLE IF EXISTS viewer_metrics CASCADE;
DROP TABLE IF EXISTS game_metrics CASCADE;

-- Drop discovery tables
DROP TABLE IF EXISTS channel_metrics CASCADE;
DROP TABLE IF EXISTS discovery_preferences CASCADE;
DROP TABLE IF EXISTS premiere_events CASCADE;

-- Drop user preference tables
DROP TABLE IF EXISTS channel_game_history CASCADE;
DROP TABLE IF EXISTS user_game_preferences CASCADE;
DROP TABLE IF EXISTS user_channel_preferences CASCADE;

-- Drop tracking tables
DROP TABLE IF EXISTS tracked_games CASCADE;
DROP TABLE IF EXISTS sync_history_config CASCADE;

-- Drop task related tables
DROP TABLE IF EXISTS task_notifications CASCADE;
DROP TABLE IF EXISTS task_history CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;

-- Drop auth related tables
DROP TABLE IF EXISTS twitch_accounts CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop core tables
DROP TABLE IF EXISTS game_changes CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS channels CASCADE;

-- Reset sequences for core tables
ALTER SEQUENCE IF EXISTS channels_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS games_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS game_changes_id_seq RESTART WITH 1;

-- Reset sequences for auth tables
ALTER SEQUENCE IF EXISTS users_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS sessions_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS user_preferences_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS twitch_accounts_id_seq RESTART WITH 1;

-- Reset sequences for task tables
ALTER SEQUENCE IF EXISTS tasks_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS task_history_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS task_notifications_id_seq RESTART WITH 1;

-- Reset sequences for discovery tables
ALTER SEQUENCE IF EXISTS premiere_events_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS discovery_preferences_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS channel_metrics_id_seq RESTART WITH 1;

-- Reset sequences for metric tables
ALTER SEQUENCE IF EXISTS game_metrics_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS viewer_metrics_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS engagement_metrics_id_seq RESTART WITH 1;

-- Reset sequences for user preference tables
ALTER SEQUENCE IF EXISTS channel_game_history_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS user_game_preferences_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS user_channel_preferences_id_seq RESTART WITH 1;

-- Reset sequences for VOD related tables
ALTER SEQUENCE IF EXISTS vods_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS vod_segments_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS vod_chapters_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS vod_downloads_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS vod_processing_history_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS download_queue_id_seq RESTART WITH 1;

-- Reset sequences for tracking tables
ALTER SEQUENCE IF EXISTS tracked_games_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS sync_history_config_id_seq RESTART WITH 1;

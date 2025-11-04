-- TwitchSync Database Schema
-- Generated for development use - can be reset anytime
-- To reset: node scripts/reset-database.js

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE content_status AS ENUM ('active', 'inactive', 'archived', 'deleted');
CREATE TYPE vod_status AS ENUM ('pending', 'queued', 'downloading', 'completed', 'failed', 'skipped', 'paused');
CREATE TYPE task_status AS ENUM ('pending', 'scanning', 'ready', 'downloading', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE task_priority AS ENUM ('critical', 'high', 'normal', 'low');
CREATE TYPE content_type AS ENUM ('stream', 'upload', 'highlight', 'archive');
CREATE TYPE skip_reason_type AS ENUM ('VOD_NOT_FOUND', 'ERROR', 'INVALID_METADATA', 'GAME_FILTER', 'GAME_FILTER_PROMOTIONAL', 'GAME_FILTER_CONTEXT');

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  twitch_id VARCHAR(50) UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(100),
  email VARCHAR(255),
  profile_image_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Channels table
CREATE TABLE channels (
  id SERIAL PRIMARY KEY,
  twitch_id VARCHAR(50) UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(100),
  profile_image_url TEXT,
  description TEXT,
  broadcaster_type VARCHAR(50),
  follower_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  language VARCHAR(10),
  status content_status DEFAULT 'active',
  is_active BOOLEAN DEFAULT true,
  is_mature BOOLEAN DEFAULT false,
  is_live BOOLEAN DEFAULT false,
  last_online TIMESTAMP,
  last_game_check TIMESTAMP,
  current_game_id VARCHAR(50),
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  twitch_game_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  box_art_url TEXT,
  igdb_id INTEGER,
  status content_status DEFAULT 'active',
  is_active BOOLEAN DEFAULT true,
  category VARCHAR(50),
  tags TEXT[],
  last_checked TIMESTAMP,
  viewer_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  peak_viewers INTEGER DEFAULT 0,
  average_viewers INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table (download tasks)
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status task_status DEFAULT 'pending',
  priority task_priority DEFAULT 'normal',
  total_vods INTEGER DEFAULT 0,
  completed_vods INTEGER DEFAULT 0,
  failed_vods INTEGER DEFAULT 0,
  skipped_vods INTEGER DEFAULT 0,
  error_message TEXT,
  progress_percentage DECIMAL(5,2) DEFAULT 0,
  last_run TIMESTAMP,
  last_paused_at TIMESTAMP,
  last_resumed_at TIMESTAMP,
  next_run TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VODs table
CREATE TABLE vods (
  id SERIAL PRIMARY KEY,
  twitch_id BIGINT UNIQUE NOT NULL,
  channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
  game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  duration INTERVAL NOT NULL,
  content_type content_type DEFAULT 'stream',
  status vod_status DEFAULT 'pending',
  view_count INTEGER DEFAULT 0,
  thumbnail_url TEXT,
  playlist_url TEXT,
  video_urls JSONB,
  resolution VARCHAR(20),
  file_path TEXT,
  file_size BIGINT,
  download_url TEXT,
  download_priority task_priority DEFAULT 'normal',
  download_progress DECIMAL(5,2) DEFAULT 0,
  current_segment INTEGER DEFAULT 0,
  total_segments INTEGER DEFAULT 0,
  download_speed DECIMAL(10,2) DEFAULT 0,
  eta_seconds INTEGER DEFAULT 0,
  resume_segment_index INTEGER DEFAULT 0,
  pause_reason TEXT,
  paused_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  streamed_at TIMESTAMP,
  CONSTRAINT unique_twitch_id_task UNIQUE (twitch_id, task_id)
);

-- Completed VODs tracking
CREATE TABLE completed_vods (
  id SERIAL PRIMARY KEY,
  vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  twitch_vod_id BIGINT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  duration INTERVAL,
  quality VARCHAR(20),
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_completed_vod UNIQUE (twitch_vod_id, task_id)
);

-- Task skipped VODs
CREATE TABLE task_skipped_vods (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  vod_id BIGINT NOT NULL,
  reason skip_reason_type NOT NULL,
  details TEXT,
  skipped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_task_vod_skip UNIQUE (task_id, vod_id)
);

-- Task monitoring
CREATE TABLE task_monitoring (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  status task_status NOT NULL,
  status_message TEXT,
  items_total INTEGER DEFAULT 0,
  items_completed INTEGER DEFAULT 0,
  progress_percentage DECIMAL(5,2) DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VOD events
CREATE TABLE vod_events (
  id SERIAL PRIMARY KEY,
  vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Task events
CREATE TABLE task_events (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- DISCOVERY/RECOMMENDATION TABLES (for future use)
-- =============================================================================

CREATE TABLE discovery_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  min_viewers INTEGER DEFAULT 100,
  max_viewers INTEGER DEFAULT 50000,
  preferred_languages TEXT[] DEFAULT ARRAY['en'::text],
  content_rating VARCHAR(20) DEFAULT 'all',
  notify_only BOOLEAN DEFAULT false,
  schedule_match BOOLEAN DEFAULT true,
  confidence_threshold FLOAT DEFAULT 0.7,
  excluded_game_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Users indexes
CREATE INDEX idx_users_twitch_id ON users(twitch_id);
CREATE INDEX idx_users_username ON users(username);

-- Channels indexes
CREATE INDEX idx_channels_twitch_id ON channels(twitch_id);
CREATE INDEX idx_channels_username ON channels(username);
CREATE INDEX idx_channels_language ON channels(language);
CREATE INDEX idx_channels_status ON channels(status);
CREATE INDEX idx_channels_game ON channels(current_game_id);
CREATE INDEX idx_channels_live ON channels(is_live);

-- Games indexes
CREATE INDEX idx_games_twitch_id ON games(twitch_game_id);
CREATE INDEX idx_games_name ON games(name);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_category ON games(category);
CREATE INDEX idx_games_active ON games(is_active);

-- Tasks indexes
CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_tasks_channel ON tasks(channel_id);
CREATE INDEX idx_tasks_game ON tasks(game_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_next_run ON tasks(next_run);

-- VODs indexes
CREATE INDEX idx_vods_twitch_id ON vods(twitch_id);
CREATE INDEX idx_vods_channel ON vods(channel_id);
CREATE INDEX idx_vods_game ON vods(game_id);
CREATE INDEX idx_vods_task ON vods(task_id);
CREATE INDEX idx_vods_status ON vods(status);
CREATE INDEX idx_vods_priority ON vods(download_priority);
CREATE INDEX idx_vods_task_status ON vods(task_id, status);
CREATE INDEX idx_vods_download_progress ON vods(download_progress);
CREATE INDEX idx_vods_created_at ON vods(created_at);
CREATE INDEX idx_vods_streamed_at ON vods(streamed_at);

-- Queue optimization indexes
CREATE INDEX idx_vods_queue_order ON vods(download_priority, created_at)
  WHERE status IN ('queued', 'pending');

-- Completed VODs indexes
CREATE INDEX idx_completed_vods_task ON completed_vods(task_id);
CREATE INDEX idx_completed_vods_twitch_id ON completed_vods(twitch_vod_id);

-- Task monitoring indexes
CREATE INDEX idx_task_monitoring_task ON task_monitoring(task_id);
CREATE INDEX idx_task_monitoring_status ON task_monitoring(status);

-- Events indexes
CREATE INDEX idx_vod_events_vod ON vod_events(vod_id);
CREATE INDEX idx_vod_events_type ON vod_events(event_type);
CREATE INDEX idx_task_events_task ON task_events(task_id);
CREATE INDEX idx_task_events_type ON task_events(event_type);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply timestamp triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vods_updated_at BEFORE UPDATE ON vods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_monitoring_updated_at BEFORE UPDATE ON task_monitoring
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discovery_preferences_updated_at BEFORE UPDATE ON discovery_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Check if VOD is completed (safe for concurrency)
CREATE OR REPLACE FUNCTION is_vod_completed_safe(twitch_vod_id BIGINT, task_id_param INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM completed_vods
    WHERE twitch_vod_id = twitch_vod_id
    AND task_id = task_id_param
  );
END;
$$ LANGUAGE plpgsql;

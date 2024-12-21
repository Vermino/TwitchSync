// Filepath: backend/src/database/migrations/004_vod_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create VOD-related enums
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE vod_status AS ENUM (
          'pending', 'queued', 'downloading', 'processing', 'completed', 
          'failed', 'cancelled', 'archived', 'deleted'
        );

        CREATE TYPE video_quality AS ENUM (
          'source', '1080p60', '1080p', '720p60', '720p', '480p', '360p', '160p'
        );

        CREATE TYPE content_type AS ENUM (
          'stream', 'highlight', 'upload', 'clip', 'premiere'
        );

        CREATE TYPE download_priority AS ENUM (
          'low', 'normal', 'high', 'critical'
        );

      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Main VODs table
    await client.query(`
      CREATE TABLE vods (
        id SERIAL PRIMARY KEY,
        twitch_id VARCHAR(50) UNIQUE NOT NULL,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
        fps INTEGER,
        language VARCHAR(10),
        muted_segments JSONB[],
        tags TEXT[],
        category_tags TEXT[],
        chat_replay_available BOOLEAN DEFAULT true,
        markers JSONB[],
        highlights_timestamps JSONB[],
        
        -- Download management fields
        download_path TEXT,
        download_status vod_status DEFAULT 'pending',
        download_priority download_priority DEFAULT 'normal',
        download_progress FLOAT DEFAULT 0,
        download_speed BIGINT,
        downloaded_size BIGINT,
        estimated_size BIGINT,
        file_size BIGINT,
        file_format VARCHAR(20),
        preferred_quality video_quality DEFAULT 'source',
        download_chat BOOLEAN DEFAULT true,
        download_markers BOOLEAN DEFAULT true,
        download_chapters BOOLEAN DEFAULT true,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_retry TIMESTAMP,
        error_message TEXT,
        scheduled_for TIMESTAMP,
        target_directory TEXT,
        auto_delete BOOLEAN DEFAULT false,
        retention_days INTEGER,
        
        -- Technical metadata
        checksum VARCHAR(64),
        video_metadata JSONB,
        processing_metadata JSONB,
        processing_options JSONB DEFAULT '{"transcode": false, "extract_chat": true}'::jsonb,
        deletion_scheduled_at TIMESTAMP,
        
        -- Timestamps
        started_at TIMESTAMP,
        downloaded_at TIMESTAMP,
        processed_at TIMESTAMP,
        published_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_vods_twitch_id ON vods(twitch_id);
      CREATE INDEX idx_vods_channel ON vods(channel_id);
      CREATE INDEX idx_vods_game ON vods(game_id);
      CREATE INDEX idx_vods_user ON vods(user_id);
      CREATE INDEX idx_vods_status ON vods(status);
      CREATE INDEX idx_vods_download_status ON vods(download_status);
      CREATE INDEX idx_vods_priority ON vods(download_priority);
      CREATE INDEX idx_vods_scheduled ON vods(scheduled_for) 
        WHERE download_status = 'queued';
      CREATE INDEX idx_vods_content_type ON vods(content_type);
      CREATE INDEX idx_vods_published ON vods(published_at);
    `);

    // VOD chapters for content navigation
    await client.query(`
      CREATE TABLE vod_chapters (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        start_time INTERVAL NOT NULL,
        duration INTERVAL NOT NULL,
        thumbnail_url TEXT,
        category VARCHAR(50),
        markers JSONB[],
        view_count INTEGER DEFAULT 0,
        highlight_clip_id VARCHAR(50),
        highlight_url TEXT,
        download_separately BOOLEAN DEFAULT false,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_chapters_vod ON vod_chapters(vod_id);
      CREATE INDEX idx_chapters_game ON vod_chapters(game_id);
      CREATE INDEX idx_chapters_start ON vod_chapters(start_time);
    `);

    // VOD segments for partial downloads
    await client.query(`
      CREATE TABLE vod_segments (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
        chapter_id INTEGER REFERENCES vod_chapters(id) ON DELETE SET NULL,
        segment_number INTEGER NOT NULL,
        segment_url TEXT NOT NULL,
        start_time INTERVAL NOT NULL,
        duration INTERVAL NOT NULL,
        file_path TEXT,
        file_size BIGINT,
        video_quality video_quality,
        download_status vod_status DEFAULT 'pending',
        download_progress FLOAT DEFAULT 0,
        download_speed BIGINT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_retry TIMESTAMP,
        error_message TEXT,
        checksum VARCHAR(64),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vod_id, segment_number, video_quality)
      );

      CREATE INDEX idx_segments_vod ON vod_segments(vod_id);
      CREATE INDEX idx_segments_chapter ON vod_segments(chapter_id);
      CREATE INDEX idx_segments_status ON vod_segments(download_status);
    `);

    // VOD markers and timestamps
    await client.query(`
      CREATE TABLE vod_markers (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
        chapter_id INTEGER REFERENCES vod_chapters(id) ON DELETE SET NULL,
        marker_type VARCHAR(50) NOT NULL,
        title TEXT,
        description TEXT,
        timestamp INTERVAL NOT NULL,
        duration INTERVAL,
        category VARCHAR(50),
        tags TEXT[],
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_markers_vod ON vod_markers(vod_id);
      CREATE INDEX idx_markers_chapter ON vod_markers(chapter_id);
      CREATE INDEX idx_markers_type ON vod_markers(marker_type);
    `);

    // Chat messages storage
    await client.query(`
      CREATE TABLE chat_messages (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
        message_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        username VARCHAR(100) NOT NULL,
        message_type VARCHAR(50) NOT NULL,
        message TEXT,
        timestamp INTERVAL NOT NULL,
        badges JSONB[],
        emotes JSONB[],
        bits INTEGER,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vod_id, message_id)
      );

      CREATE INDEX idx_chat_vod ON chat_messages(vod_id);
      CREATE INDEX idx_chat_user ON chat_messages(user_id);
      CREATE INDEX idx_chat_timestamp ON chat_messages(timestamp);
      CREATE INDEX idx_chat_type ON chat_messages(message_type);
    `);

    // VOD processing history
    await client.query(`
      CREATE TABLE vod_processing_history (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
        segment_id INTEGER REFERENCES vod_segments(id) ON DELETE SET NULL,
        process_type VARCHAR(50) NOT NULL,
        status vod_status NOT NULL,
        quality video_quality,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration INTERVAL,
        file_size BIGINT,
        output_path TEXT,
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_processing_vod ON vod_processing_history(vod_id);
      CREATE INDEX idx_processing_segment ON vod_processing_history(segment_id);
      CREATE INDEX idx_processing_status ON vod_processing_history(status);
      CREATE INDEX idx_processing_type ON vod_processing_history(process_type);
    `);

    // Bandwidth usage tracking
    await client.query(`
      CREATE TABLE vod_bandwidth_usage (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        bytes_downloaded BIGINT NOT NULL,
        bytes_uploaded BIGINT DEFAULT 0,
        download_speed BIGINT,
        measured_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_bandwidth_vod ON vod_bandwidth_usage(vod_id);
      CREATE INDEX idx_bandwidth_user ON vod_bandwidth_usage(user_id);
      CREATE INDEX idx_bandwidth_time ON vod_bandwidth_usage(measured_at);
    `);

    // User VOD preferences
    await client.query(`
      CREATE TABLE user_vod_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        auto_download BOOLEAN DEFAULT false,
        preferred_quality video_quality DEFAULT 'source',
        download_chat BOOLEAN DEFAULT true,
        download_markers BOOLEAN DEFAULT true,
        download_priority download_priority DEFAULT 'normal',
        retention_days INTEGER,
        storage_path TEXT,
        notification_settings JSONB DEFAULT '{
          "download_started": true,
          "download_completed": true,
          "download_failed": true,
          "space_warning": true
        }'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, channel_id)
      );

      CREATE INDEX idx_vod_prefs_user ON user_vod_preferences(user_id);
      CREATE INDEX idx_vod_prefs_channel ON user_vod_preferences(channel_id);
    `);

    // Add triggers for timestamp updates
    await client.query(`
      CREATE TRIGGER update_vods_updated_at
        BEFORE UPDATE ON vods
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_vod_chapters_updated_at
        BEFORE UPDATE ON vod_chapters
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_vod_segments_updated_at
        BEFORE UPDATE ON vod_segments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_user_vod_preferences_updated_at
        BEFORE UPDATE ON user_vod_preferences
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Create cleanup function for old VODs
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_vods()
      RETURNS void AS $$
      BEGIN
        -- Update status to archived for VODs that are past retention period
        UPDATE vods v
        SET 
          status = 'archived',
          deletion_scheduled_at = CURRENT_TIMESTAMP + COALESCE(
            (SELECT t.retention_days || ' days'
             FROM tasks t 
             WHERE t.id = v.task_id)::interval,
            '7 days'::interval
          )
        WHERE 
          v.status = 'completed'
          AND v.auto_delete = true
          AND v.downloaded_at < CURRENT_TIMESTAMP - COALESCE(
            (SELECT t.retention_days || ' days'
             FROM tasks t 
             WHERE t.id = v.task_id)::interval,
            '7 days'::interval
          );

        -- Delete VODs that have passed their deletion_scheduled_at date
        DELETE FROM vods
        WHERE 
          status = 'archived'
          AND deletion_scheduled_at < CURRENT_TIMESTAMP;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger function
      CREATE OR REPLACE FUNCTION trigger_cleanup_old_vods()
      RETURNS trigger AS $$
      BEGIN
        PERFORM cleanup_old_vods();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger
      CREATE TRIGGER cleanup_old_vods_trigger
        AFTER UPDATE OF downloaded_at ON vods
        FOR EACH STATEMENT
        EXECUTE FUNCTION trigger_cleanup_old_vods();
    `);

    await client.query('COMMIT');
    logger.info('VOD tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('VOD tables migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop triggers first
    await client.query(`
      DROP TRIGGER IF EXISTS cleanup_old_vods_trigger ON vods;
      DROP TRIGGER IF EXISTS trigger_cleanup_old_vods ON vods;
      DROP FUNCTION IF EXISTS trigger_cleanup_old_vods() CASCADE;
      DROP FUNCTION IF EXISTS cleanup_old_vods() CASCADE;

      DROP TRIGGER IF EXISTS update_user_vod_preferences_updated_at ON user_vod_preferences;
      DROP TRIGGER IF EXISTS update_vod_segments_updated_at ON vod_segments;
      DROP TRIGGER IF EXISTS update_vod_chapters_updated_at ON vod_chapters;
      DROP TRIGGER IF EXISTS update_vods_updated_at ON vods;
    `);

    // Drop tables in correct order (respecting foreign key dependencies)
    await client.query(`
      DROP TABLE IF EXISTS user_vod_preferences CASCADE;
      DROP TABLE IF EXISTS vod_bandwidth_usage CASCADE;
      DROP TABLE IF EXISTS vod_processing_history CASCADE;
      DROP TABLE IF EXISTS chat_messages CASCADE;
      DROP TABLE IF EXISTS vod_markers CASCADE;
      DROP TABLE IF EXISTS vod_segments CASCADE;
      DROP TABLE IF EXISTS vod_chapters CASCADE;
      DROP TABLE IF EXISTS vods CASCADE;
    `);

    // Drop enums in correct order
    await client.query(`
      DROP TYPE IF EXISTS download_priority CASCADE;
      DROP TYPE IF EXISTS content_type CASCADE;
      DROP TYPE IF EXISTS video_quality CASCADE;
      DROP TYPE IF EXISTS vod_status CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('VOD tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('VOD tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

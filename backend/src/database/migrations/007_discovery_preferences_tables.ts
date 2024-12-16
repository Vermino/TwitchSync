// Filepath: backend/src/database/migrations/007_discovery_preferences_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create user_preferences table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        preferred_languages TEXT[] DEFAULT ARRAY['en'],
        min_viewers INTEGER DEFAULT 0,
        max_viewers INTEGER DEFAULT 1000000,
        preferred_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
        schedule_preference TEXT DEFAULT 'any',
        content_rating TEXT DEFAULT 'all',
        notify_only BOOLEAN DEFAULT false,
        schedule_match BOOLEAN DEFAULT true,
        confidence_threshold FLOAT DEFAULT 0.7,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );

      -- Add default preferences trigger
      CREATE OR REPLACE FUNCTION create_default_preferences()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO user_preferences (user_id)
        VALUES (NEW.id);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS create_user_preferences ON users;
      CREATE TRIGGER create_user_preferences
        AFTER INSERT ON users
        FOR EACH ROW
        EXECUTE FUNCTION create_default_preferences();
    `);

    // Create premiere_events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS premiere_events (
        id SERIAL PRIMARY KEY,
        event_type TEXT NOT NULL CHECK (event_type IN ('CHANNEL_PREMIERE', 'RISING_STAR', 'SPECIAL_EVENT')),
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        predicted_viewers INTEGER,
        confidence_score FLOAT,
        similar_channels INTEGER[],
        viewer_trend TEXT CHECK (viewer_trend IN ('rising', 'stable', 'falling')),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_premiere_events_channel ON premiere_events(channel_id);
      CREATE INDEX IF NOT EXISTS idx_premiere_events_game ON premiere_events(game_id);
      CREATE INDEX IF NOT EXISTS idx_premiere_events_type ON premiere_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_premiere_events_start_time ON premiere_events(start_time);
    `);

    // Create user_premiere_tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_premiere_tracking (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        premiere_id INTEGER REFERENCES premiere_events(id) ON DELETE CASCADE,
        notification_sent BOOLEAN DEFAULT false,
        notification_time TIMESTAMP WITH TIME ZONE,
        is_tracked BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, premiere_id)
      );
    `);

    // Create channel_metrics_archive table
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_metrics_archive (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        metrics_data JSONB NOT NULL,
        period_start TIMESTAMP WITH TIME ZONE NOT NULL,
        period_end TIMESTAMP WITH TIME ZONE NOT NULL,
        archived_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, period_start, period_end)
      );

      CREATE INDEX IF NOT EXISTS idx_channel_metrics_archive_channel ON channel_metrics_archive(channel_id);
      CREATE INDEX IF NOT EXISTS idx_channel_metrics_archive_period ON channel_metrics_archive(period_start, period_end);
    `);

    // Add discovery metrics columns to channel_metrics if they don't exist
    await client.query(`
      DO $$ 
      BEGIN 
        ALTER TABLE channel_metrics 
          ADD COLUMN IF NOT EXISTS viewer_growth_rate FLOAT,
          ADD COLUMN IF NOT EXISTS viewer_retention_rate FLOAT,
          ADD COLUMN IF NOT EXISTS avg_session_duration INTERVAL,
          ADD COLUMN IF NOT EXISTS peak_concurrent_viewers INTEGER,
          ADD COLUMN IF NOT EXISTS unique_viewers INTEGER;
      END $$;
    `);

    // Insert default preferences for existing users
    await client.query(`
      INSERT INTO user_preferences (user_id)
      SELECT id FROM users
      WHERE NOT EXISTS (
        SELECT 1 FROM user_preferences WHERE user_preferences.user_id = users.id
      );
    `);

    await client.query('COMMIT');
    logger.info('Discovery preferences migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in discovery preferences migration:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Remove triggers first
    await client.query(`
      DROP TRIGGER IF EXISTS create_user_preferences ON users;
      DROP FUNCTION IF EXISTS create_default_preferences();
    `);

    // Drop tables in correct order
    await client.query(`
      DROP TABLE IF EXISTS user_premiere_tracking;
      DROP TABLE IF EXISTS premiere_events;
      DROP TABLE IF EXISTS channel_metrics_archive;
      DROP TABLE IF EXISTS user_preferences;
    `);

    // Remove added columns from channel_metrics
    await client.query(`
      ALTER TABLE channel_metrics
        DROP COLUMN IF EXISTS viewer_growth_rate,
        DROP COLUMN IF EXISTS viewer_retention_rate,
        DROP COLUMN IF EXISTS avg_session_duration,
        DROP COLUMN IF EXISTS peak_concurrent_viewers,
        DROP COLUMN IF EXISTS unique_viewers;
    `);

    await client.query('COMMIT');
    logger.info('Discovery preferences rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in discovery preferences rollback:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Filepath: backend/src/database/migrations/006_missing_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create user_channel_preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_channel_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        avg_viewers INTEGER,
        viewer_trend TEXT,
        similar_channels INTEGER[],
        notification_settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, channel_id)
      );

      CREATE INDEX idx_user_channel_prefs_user ON user_channel_preferences(user_id);
      CREATE INDEX idx_user_channel_prefs_channel ON user_channel_preferences(channel_id);
    `);

    // Create user_game_preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_game_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        avg_viewers INTEGER,
        notification_enabled BOOLEAN DEFAULT true,
        auto_track BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, game_id)
      );

      CREATE INDEX idx_user_game_prefs_user ON user_game_preferences(user_id);
      CREATE INDEX idx_user_game_prefs_game ON user_game_preferences(game_id);
    `);

    // Create channel_game_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_game_history (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        viewer_count INTEGER,
        started_at TIMESTAMP NOT NULL,
        ended_at TIMESTAMP,
        duration INTERVAL,
        peak_viewers INTEGER,
        avg_viewers INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_channel_game_history_channel ON channel_game_history(channel_id);
      CREATE INDEX idx_channel_game_history_game ON channel_game_history(game_id);
      CREATE INDEX idx_channel_game_history_time ON channel_game_history(started_at, ended_at);
    `);

    // Create channel_viewers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_viewers (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        viewer_id VARCHAR(50) NOT NULL,
        first_seen TIMESTAMP NOT NULL,
        last_seen TIMESTAMP NOT NULL,
        watch_time INTERVAL,
        chat_messages INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, viewer_id)
      );

      CREATE INDEX idx_channel_viewers_channel ON channel_viewers(channel_id);
      CREATE INDEX idx_channel_viewers_viewer ON channel_viewers(viewer_id);
    `);

    // Create channel_metrics_archive table
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_metrics_archive (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        metrics_data JSONB NOT NULL,
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, period_start, period_end)
      );

      CREATE INDEX idx_channel_metrics_archive_channel ON channel_metrics_archive(channel_id);
      CREATE INDEX idx_channel_metrics_archive_period ON channel_metrics_archive(period_start, period_end);
    `);

    // Add missing columns to existing tables if needed
    await client.query(`
      -- Add type column to channels if it doesn't exist
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'channels' AND column_name = 'type') THEN
          ALTER TABLE channels ADD COLUMN type VARCHAR(50);
        END IF;
      END $$;

      -- Add interval column if it doesn't exist
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'channel_metrics' AND column_name = 'interval') THEN
          ALTER TABLE channel_metrics ADD COLUMN interval INTERVAL;
        END IF;
      END $$;
    `);

    await client.query('COMMIT');
    logger.info('Missing tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Missing tables migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop all created tables in reverse order
    await client.query(`
      DROP TABLE IF EXISTS channel_metrics_archive;
      DROP TABLE IF EXISTS channel_viewers;
      DROP TABLE IF EXISTS channel_game_history;
      DROP TABLE IF EXISTS user_game_preferences;
      DROP TABLE IF EXISTS user_channel_preferences;
    `);

    // Remove added columns
    await client.query(`
      ALTER TABLE channels DROP COLUMN IF EXISTS type;
      ALTER TABLE channel_metrics DROP COLUMN IF EXISTS interval;
    `);

    await client.query('COMMIT');
    logger.info('Missing tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Missing tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

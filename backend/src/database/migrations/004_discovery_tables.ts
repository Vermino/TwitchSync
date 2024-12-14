// backend/src/database/migrations/004_discovery_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Premiere events table
    await client.query(`
      CREATE TABLE premiere_events (
        id SERIAL PRIMARY KEY,
        type VARCHAR(20) CHECK (type IN ('CHANNEL_PREMIERE', 'GAME_PREMIERE', 'RISING_STAR')),
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        start_time TIMESTAMP NOT NULL,
        predicted_viewers INTEGER,
        confidence_score FLOAT,
        similar_channels INTEGER,
        viewer_trend VARCHAR(10) CHECK (viewer_trend IN ('rising', 'stable', 'falling')),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_premiere_events_channel ON premiere_events(channel_id);
      CREATE INDEX idx_premiere_events_game ON premiere_events(game_id);
      CREATE INDEX idx_premiere_events_start_time ON premiere_events(start_time);
    `);

    // Discovery preferences table
    await client.query(`
      CREATE TABLE discovery_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        min_viewers INTEGER DEFAULT 100,
        max_viewers INTEGER DEFAULT 50000,
        preferred_languages TEXT[] DEFAULT ARRAY['EN'],
        content_rating VARCHAR(10) DEFAULT 'all',
        notify_only BOOLEAN DEFAULT false,
        schedule_match BOOLEAN DEFAULT true,
        confidence_threshold FLOAT DEFAULT 0.7,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX idx_discovery_preferences_user ON discovery_preferences(user_id);

      CREATE TRIGGER update_discovery_preferences_updated_at
        BEFORE UPDATE ON discovery_preferences
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Channel metrics table
    await client.query(`
      CREATE TABLE channel_metrics (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        viewer_count INTEGER,
        follower_count INTEGER,
        viewer_growth_rate FLOAT,
        engagement_rate FLOAT,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_channel_metrics_channel ON channel_metrics(channel_id);
      CREATE INDEX idx_channel_metrics_recorded_at ON channel_metrics(recorded_at);
    `);

    await client.query('COMMIT');
    logger.info('Discovery tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Discovery tables migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      DROP TABLE IF EXISTS channel_metrics;
      DROP TABLE IF EXISTS discovery_preferences;
      DROP TABLE IF EXISTS premiere_events;
    `);

    await client.query('COMMIT');
    logger.info('Discovery tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Discovery tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

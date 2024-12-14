// backend/src/database/migrations/005_metrics_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Game metrics table
    await client.query(`
      CREATE TABLE game_metrics (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        active_channels INTEGER,
        current_viewers INTEGER,
        average_viewers INTEGER,
        peak_viewers INTEGER,
        growth_rate FLOAT,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_game_metrics_game ON game_metrics(game_id);
      CREATE INDEX idx_game_metrics_recorded_at ON game_metrics(recorded_at);
    `);

    // Viewer metrics table
    await client.query(`
      CREATE TABLE viewer_metrics (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        viewer_count INTEGER,
        chatter_count INTEGER,
        follower_gain INTEGER,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_viewer_metrics_channel ON viewer_metrics(channel_id);
      CREATE INDEX idx_viewer_metrics_game ON viewer_metrics(game_id);
      CREATE INDEX idx_viewer_metrics_recorded_at ON viewer_metrics(recorded_at);
    `);

    // Engagement metrics table
    await client.query(`
      CREATE TABLE engagement_metrics (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        chat_messages INTEGER,
        unique_chatters INTEGER,
        chat_engagement_rate FLOAT,
        viewer_retention_rate FLOAT,
        peak_concurrent INTEGER,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_engagement_metrics_channel ON engagement_metrics(channel_id);
      CREATE INDEX idx_engagement_metrics_game ON engagement_metrics(game_id);
      CREATE INDEX idx_engagement_metrics_recorded_at ON engagement_metrics(recorded_at);
    `);

    await client.query('COMMIT');
    logger.info('Metrics tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Metrics tables migration failed:', error);
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
      DROP TABLE IF EXISTS engagement_metrics;
      DROP TABLE IF EXISTS viewer_metrics;
      DROP TABLE IF EXISTS game_metrics;
    `);

    await client.query('COMMIT');
    logger.info('Metrics tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Metrics tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

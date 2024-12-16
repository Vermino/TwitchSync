// Filepath: backend/src/database/migrations/008_discovery_stats_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Channel metrics for tracking growth and engagement
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_metrics (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        viewer_count INTEGER NOT NULL DEFAULT 0,
        chatter_count INTEGER DEFAULT 0,
        follower_count INTEGER DEFAULT 0,
        viewer_growth_rate FLOAT DEFAULT 0,
        engagement_rate FLOAT DEFAULT 0,
        peak_concurrent_viewers INTEGER DEFAULT 0,
        avg_stream_duration INTERVAL,
        stream_uptime INTERVAL,
        stream_start_time TIMESTAMP,
        last_update TIMESTAMP,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_channel_metrics_channel ON channel_metrics(channel_id);
      CREATE INDEX IF NOT EXISTS idx_channel_metrics_recorded ON channel_metrics(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_channel_metrics_growth ON channel_metrics(viewer_growth_rate);
    `);

    // Daily aggregated metrics
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_metrics_daily (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        avg_viewers FLOAT,
        peak_viewers INTEGER,
        total_stream_minutes INTEGER,
        unique_viewers INTEGER,
        new_followers INTEGER,
        viewer_growth_rate FLOAT,
        engagement_rate FLOAT,
        games_played INTEGER[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_channel_metrics_daily_channel ON channel_metrics_daily(channel_id);
      CREATE INDEX IF NOT EXISTS idx_channel_metrics_daily_date ON channel_metrics_daily(date);
    `);

    // Premiere event tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_premiere_tracking (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        premiere_id INTEGER REFERENCES premiere_events(id) ON DELETE CASCADE,
        notification_sent BOOLEAN DEFAULT false,
        notification_time TIMESTAMP,
        dismissed BOOLEAN DEFAULT false,
        remind_before INTERVAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, premiere_id)
      );

      CREATE INDEX IF NOT EXISTS idx_premiere_tracking_user ON user_premiere_tracking(user_id);
      CREATE INDEX IF NOT EXISTS idx_premiere_tracking_premiere ON user_premiere_tracking(premiere_id);
      CREATE INDEX IF NOT EXISTS idx_premiere_tracking_notification ON user_premiere_tracking(notification_sent, notification_time)
        WHERE NOT notification_sent;
    `);

    // Stats archive for historical tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS discovery_stats_archive (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        total_channels INTEGER DEFAULT 0,
        active_channels INTEGER DEFAULT 0,
        premieres_detected INTEGER DEFAULT 0,
        rising_channels INTEGER DEFAULT 0,
        avg_viewer_count INTEGER DEFAULT 0,
        total_tracked_premieres INTEGER DEFAULT 0,
        metrics JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date)
      );

      CREATE INDEX IF NOT EXISTS idx_discovery_stats_archive_date ON discovery_stats_archive(date);
    `);

    // Create function to aggregate daily metrics
    await client.query(`
      CREATE OR REPLACE FUNCTION aggregate_daily_metrics()
      RETURNS void AS $$
      BEGIN
        INSERT INTO channel_metrics_daily (
          channel_id,
          date,
          avg_viewers,
          peak_viewers,
          total_stream_minutes,
          unique_viewers,
          new_followers,
          viewer_growth_rate,
          engagement_rate,
          games_played
        )
        SELECT 
          channel_id,
          DATE(recorded_at),
          AVG(viewer_count)::float,
          MAX(viewer_count),
          EXTRACT(EPOCH FROM SUM(stream_uptime))/60,
          COUNT(DISTINCT viewer_count),
          MAX(follower_count) - MIN(follower_count),
          AVG(viewer_growth_rate),
          AVG(engagement_rate),
          ARRAY_AGG(DISTINCT games_played)
        FROM channel_metrics
        WHERE DATE(recorded_at) = CURRENT_DATE - 1
        GROUP BY channel_id, DATE(recorded_at)
        ON CONFLICT (channel_id, date) 
        DO UPDATE SET
          avg_viewers = EXCLUDED.avg_viewers,
          peak_viewers = EXCLUDED.peak_viewers,
          total_stream_minutes = EXCLUDED.total_stream_minutes,
          unique_viewers = EXCLUDED.unique_viewers,
          new_followers = EXCLUDED.new_followers,
          viewer_growth_rate = EXCLUDED.viewer_growth_rate,
          engagement_rate = EXCLUDED.engagement_rate,
          games_played = EXCLUDED.games_played;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger for updating channel metrics
    await client.query(`
      CREATE OR REPLACE FUNCTION update_channel_growth_rate()
      RETURNS TRIGGER AS $$
      DECLARE
        previous_count INTEGER;
      BEGIN
        SELECT viewer_count INTO previous_count
        FROM channel_metrics
        WHERE channel_id = NEW.channel_id
        AND recorded_at < NEW.recorded_at
        ORDER BY recorded_at DESC
        LIMIT 1;

        IF previous_count IS NOT NULL AND previous_count > 0 THEN
          NEW.viewer_growth_rate := (NEW.viewer_count - previous_count)::float / previous_count;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_update_growth_rate ON channel_metrics;
      CREATE TRIGGER trigger_update_growth_rate
        BEFORE INSERT ON channel_metrics
        FOR EACH ROW
        EXECUTE FUNCTION update_channel_growth_rate();
    `);

    await client.query('COMMIT');
    logger.info('Discovery stats tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Discovery stats tables migration failed:', error);
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
      DROP TRIGGER IF EXISTS trigger_update_growth_rate ON channel_metrics;
    `);

    // Drop functions
    await client.query(`
      DROP FUNCTION IF EXISTS update_channel_growth_rate();
      DROP FUNCTION IF EXISTS aggregate_daily_metrics();
    `);

    // Drop tables in correct order
    await client.query(`
      DROP TABLE IF EXISTS discovery_stats_archive;
      DROP TABLE IF EXISTS user_premiere_tracking;
      DROP TABLE IF EXISTS channel_metrics_daily;
      DROP TABLE IF EXISTS channel_metrics;
    `);

    await client.query('COMMIT');
    logger.info('Discovery stats tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Discovery stats tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

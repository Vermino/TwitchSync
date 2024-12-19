// Filepath: backend/src/database/migrations/016_channel_game_tracking.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Add last stream fields to channels table
    await client.query(`
      ALTER TABLE channels
      ADD COLUMN IF NOT EXISTS last_stream_game_id INTEGER REFERENCES games(id),
      ADD COLUMN IF NOT EXISTS last_stream_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_stream_duration INTERVAL;
    `);

    // Add premiere flag to existing channel_game_history table
    await client.query(`
      ALTER TABLE channel_game_history
      ADD COLUMN IF NOT EXISTS is_premiere BOOLEAN DEFAULT false;

      -- Add index for premieres if it doesn't exist
      CREATE INDEX IF NOT EXISTS idx_channel_game_history_premiere 
      ON channel_game_history(channel_id, game_id, is_premiere) 
      WHERE is_premiere = true;
    `);

    // Create channel game stats table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_game_stats (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        total_streams INTEGER DEFAULT 0,
        total_time INTERVAL DEFAULT '0'::interval,
        avg_viewers INTEGER DEFAULT 0,
        peak_viewers INTEGER DEFAULT 0,
        last_played TIMESTAMP,
        first_played TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, game_id)
      );

      CREATE INDEX IF NOT EXISTS idx_channel_game_stats_channel ON channel_game_stats(channel_id);
      CREATE INDEX IF NOT EXISTS idx_channel_game_stats_game ON channel_game_stats(game_id);
      CREATE INDEX IF NOT EXISTS idx_channel_game_stats_total_time ON channel_game_stats(total_time DESC);
    `);

    // Create function to update channel game stats
    await client.query(`
      CREATE OR REPLACE FUNCTION update_channel_game_stats()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO channel_game_stats (
          channel_id, game_id, total_streams, total_time,
          avg_viewers, peak_viewers, last_played, first_played
        )
        SELECT
          channel_id,
          game_id,
          COUNT(*),
          SUM(duration),
          AVG(avg_viewers)::integer,
          MAX(peak_viewers),
          MAX(started_at),
          MIN(started_at)
        FROM channel_game_history
        WHERE channel_id = NEW.channel_id AND game_id = NEW.game_id
        GROUP BY channel_id, game_id
        ON CONFLICT (channel_id, game_id) DO UPDATE
        SET
          total_streams = EXCLUDED.total_streams,
          total_time = EXCLUDED.total_time,
          avg_viewers = EXCLUDED.avg_viewers,
          peak_viewers = EXCLUDED.peak_viewers,
          last_played = EXCLUDED.last_played,
          first_played = EXCLUDED.first_played,
          updated_at = CURRENT_TIMESTAMP;

        -- Update channel's last stream info if this is the most recent stream
        UPDATE channels
        SET
          last_stream_game_id = NEW.game_id,
          last_stream_date = NEW.started_at,
          last_stream_duration = NEW.duration
        WHERE id = NEW.channel_id
        AND (last_stream_date IS NULL OR NEW.started_at > last_stream_date);

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger for updating stats if it doesn't exist
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_channel_game_stats ON channel_game_history;
      CREATE TRIGGER trigger_update_channel_game_stats
      AFTER INSERT OR UPDATE ON channel_game_history
      FOR EACH ROW
      EXECUTE FUNCTION update_channel_game_stats();
    `);

    // Create view for channel game premieres if it doesn't exist
    await client.query(`
      CREATE OR REPLACE VIEW channel_game_premieres AS
      SELECT 
        ch.channel_id,
        ch.game_id,
        g.name as game_name,
        g.box_art_url,
        ch.started_at as premiere_date,
        ch.duration,
        ch.peak_viewers,
        ch.avg_viewers
      FROM channel_game_history ch
      JOIN games g ON ch.game_id = g.id
      WHERE ch.is_premiere = true
      ORDER BY ch.started_at DESC;
    `);

    await client.query('COMMIT');
    logger.info('Channel game tracking migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Channel game tracking migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop trigger and function
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_channel_game_stats ON channel_game_history;
      DROP FUNCTION IF EXISTS update_channel_game_stats();
    `);

    // Drop view
    await client.query('DROP VIEW IF EXISTS channel_game_premieres;');

    // Drop stats table
    await client.query('DROP TABLE IF EXISTS channel_game_stats;');

    // Remove premiere column from channel_game_history
    await client.query(`
      ALTER TABLE channel_game_history
      DROP COLUMN IF EXISTS is_premiere;
    `);

    // Remove columns from channels table
    await client.query(`
      ALTER TABLE channels
      DROP COLUMN IF EXISTS last_stream_game_id,
      DROP COLUMN IF EXISTS last_stream_date,
      DROP COLUMN IF EXISTS last_stream_duration;
    `);

    await client.query('COMMIT');
    logger.info('Channel game tracking rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Channel game tracking rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

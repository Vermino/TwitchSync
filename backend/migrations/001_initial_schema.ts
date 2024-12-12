import { Pool } from 'pg';
import { logger } from '../src/utils/logger';  // Fixed import path

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      // Create channels table
      await client.query(`
        CREATE TABLE IF NOT EXISTS channels (
          id SERIAL PRIMARY KEY,
          twitch_id VARCHAR(50) NOT NULL,
          username VARCHAR(100) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          last_vod_check TIMESTAMP,
          last_game_check TIMESTAMP,
          current_game_id VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_channels_twitch_id ON channels(twitch_id);
        CREATE INDEX IF NOT EXISTS idx_channels_username ON channels(username);
      `);

      // Create tracked_games table
      await client.query(`
        CREATE TABLE IF NOT EXISTS tracked_games (
          id SERIAL PRIMARY KEY,
          twitch_game_id VARCHAR(50) NOT NULL,
          name VARCHAR(200) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          last_checked TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_tracked_games_twitch_id ON tracked_games(twitch_game_id);
      `);

      // Create vods table
      await client.query(`
        CREATE TABLE IF NOT EXISTS vods (
          id SERIAL PRIMARY KEY,
          twitch_vod_id VARCHAR(50) NOT NULL UNIQUE,
          channel_id INTEGER REFERENCES channels(id),
          game_id VARCHAR(50),
          title VARCHAR(500),
          duration VARCHAR(20),
          view_count INTEGER,
          created_at TIMESTAMP,
          published_at TIMESTAMP,
          type VARCHAR(20),
          url VARCHAR(500),
          thumbnail_url VARCHAR(500),
          processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_vods_twitch_id ON vods(twitch_vod_id);
        CREATE INDEX IF NOT EXISTS idx_vods_channel_id ON vods(channel_id);
        CREATE INDEX IF NOT EXISTS idx_vods_game_id ON vods(game_id);
      `);

      // Create vod_chapters table
      await client.query(`
        CREATE TABLE IF NOT EXISTS vod_chapters (
          id SERIAL PRIMARY KEY,
          vod_id INTEGER REFERENCES vods(id),
          game_id VARCHAR(50),
          title VARCHAR(200),
          start_time INTEGER,
          end_time INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_vod_chapters_vod_id ON vod_chapters(vod_id);
      `);

      // Create download_queue table
      await client.query(`
        CREATE TABLE IF NOT EXISTS download_queue (
          id SERIAL PRIMARY KEY,
          vod_id INTEGER REFERENCES vods(id),
          chapter_id INTEGER REFERENCES vod_chapters(id),
          priority INTEGER DEFAULT 1,
          status VARCHAR(20) DEFAULT 'pending',
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_download_queue_status ON download_queue(status);
        CREATE INDEX IF NOT EXISTS idx_download_queue_vod_id ON download_queue(vod_id);
      `);

      // Create vod_downloads table
      await client.query(`
        CREATE TABLE IF NOT EXISTS vod_downloads (
          id SERIAL PRIMARY KEY,
          vod_id INTEGER REFERENCES vods(id),
          download_path VARCHAR(500),
          metadata_path VARCHAR(500),
          download_status VARCHAR(20) NOT NULL,
          started_at TIMESTAMP NOT NULL,
          completed_at TIMESTAMP,
          file_size BIGINT,
          error_message TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_vod_downloads_vod_id ON vod_downloads(vod_id);
        CREATE INDEX IF NOT EXISTS idx_vod_downloads_status ON vod_downloads(download_status);
      `);

      // Create game_changes table
      await client.query(`
        CREATE TABLE IF NOT EXISTS game_changes (
          id SERIAL PRIMARY KEY,
          channel_id INTEGER REFERENCES channels(id),
          previous_game_id VARCHAR(50),
          new_game_id VARCHAR(50),
          changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_game_changes_channel_id ON game_changes(channel_id);
      `);

      await client.query('COMMIT');
      logger.info('Database migration completed successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

export async function down(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      // Drop tables in reverse order of creation
      await client.query(`
        DROP TABLE IF EXISTS game_changes;
        DROP TABLE IF EXISTS vod_downloads;
        DROP TABLE IF EXISTS download_queue;
        DROP TABLE IF EXISTS vod_chapters;
        DROP TABLE IF EXISTS vods;
        DROP TABLE IF EXISTS tracked_games;
        DROP TABLE IF EXISTS channels;
      `);

      await client.query('COMMIT');
      logger.info('Database rollback completed successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Migration rollback failed:', error);
    throw error;
  }
}

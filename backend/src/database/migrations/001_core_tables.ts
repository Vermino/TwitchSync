// backend/src/database/migrations/001_core_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Channels table
    await client.query(`
      CREATE TABLE channels (
        id SERIAL PRIMARY KEY,
        twitch_id VARCHAR(50) UNIQUE NOT NULL,
        username VARCHAR(100) NOT NULL,
        display_name VARCHAR(100),
        profile_image_url TEXT,
        description TEXT,
        follower_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        last_game_check TIMESTAMP,
        current_game_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_channels_twitch_id ON channels(twitch_id);
      CREATE INDEX idx_channels_username ON channels(username);
    `);

    // Games table
    await client.query(`
      CREATE TABLE games (
        id SERIAL PRIMARY KEY,
        twitch_game_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        box_art_url TEXT,
        is_active BOOLEAN DEFAULT true,
        last_checked TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_games_twitch_id ON games(twitch_game_id);
    `);

    // Game changes tracking
    await client.query(`
      CREATE TABLE game_changes (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        previous_game_id VARCHAR(50),
        new_game_id VARCHAR(50),
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_game_changes_channel_id ON game_changes(channel_id);
    `);

    // Updated timestamp triggers
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER update_channels_updated_at
        BEFORE UPDATE ON channels
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_games_updated_at
        BEFORE UPDATE ON games
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query('COMMIT');
    logger.info('Core tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Core tables migration failed:', error);
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
      DROP TRIGGER IF EXISTS update_games_updated_at ON games;
      DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
      DROP FUNCTION IF EXISTS update_updated_at_column();
      DROP TABLE IF EXISTS game_changes;
      DROP TABLE IF EXISTS games;
      DROP TABLE IF EXISTS channels;
    `);

    await client.query('COMMIT');
    logger.info('Core tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Core tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

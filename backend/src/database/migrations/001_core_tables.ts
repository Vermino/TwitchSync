// backend/src/database/migrations/001_core_tables.ts
import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create enum types first
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE content_status AS ENUM (
          'active', 'inactive', 'archived', 'deleted'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Channels table
    await client.query(`
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
        last_online TIMESTAMP,
        last_game_check TIMESTAMP,
        current_game_id VARCHAR(50),
        tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_channels_twitch_id ON channels(twitch_id);
      CREATE INDEX idx_channels_username ON channels(username);
      CREATE INDEX idx_channels_language ON channels(language);
      CREATE INDEX idx_channels_status ON channels(status);
      CREATE INDEX idx_channels_game ON channels(current_game_id);
    `);

    // Games table
    await client.query(`
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
    
      CREATE INDEX idx_games_twitch_id ON games(twitch_game_id);
      CREATE INDEX idx_games_name ON games(name);
      CREATE INDEX idx_games_status ON games(status);
      CREATE INDEX idx_games_category ON games(category);
      CREATE INDEX idx_games_active ON games(is_active);
    `);

    // Game changes history
    await client.query(`
      CREATE TABLE game_changes (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        previous_game_id VARCHAR(50),
        new_game_id VARCHAR(50),
        viewer_count INTEGER,
        follower_count INTEGER,
        duration_minutes INTEGER,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_game_changes_channel ON game_changes(channel_id);
      CREATE INDEX idx_game_changes_date ON game_changes(changed_at);
      CREATE INDEX idx_game_changes_games ON game_changes(previous_game_id, new_game_id);
    `);

    // Discovery preferences table
    await client.query(`
      CREATE TABLE discovery_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
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
    
      CREATE INDEX idx_discovery_prefs_user ON discovery_preferences(user_id);
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
        
      CREATE TRIGGER update_discovery_preferences_updated_at
        BEFORE UPDATE ON discovery_preferences
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

    // Drop tables
    await client.query(`
      DROP TRIGGER IF EXISTS update_discovery_preferences_updated_at ON discovery_preferences;
      DROP TRIGGER IF EXISTS update_games_updated_at ON games;
      DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
      DROP FUNCTION IF EXISTS update_updated_at_column();
      DROP TABLE IF EXISTS game_changes;
      DROP TABLE IF EXISTS discovery_preferences;
      DROP TABLE IF EXISTS games;
      DROP TABLE IF EXISTS channels;
      DROP TYPE IF EXISTS content_status;
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

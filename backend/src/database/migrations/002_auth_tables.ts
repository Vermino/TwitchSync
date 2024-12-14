// backend/src/database/migrations/002_auth_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255),
        username VARCHAR(100) NOT NULL,
        twitch_id VARCHAR(50) UNIQUE,
        access_token VARCHAR(255),
        refresh_token VARCHAR(255),
        token_expires_at TIMESTAMP,
        profile_image_url TEXT,
        broadcaster_type VARCHAR(50),
        description TEXT,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_users_twitch_id ON users(twitch_id);
      CREATE INDEX idx_users_username ON users(username);
    `);

    // Sessions table
    await client.query(`
      CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_sessions_token ON sessions(token);
      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
    `);

    // User preferences table
    await client.query(`
      CREATE TABLE user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        notification_settings JSONB DEFAULT '{"premieres": true, "rising_stars": true, "discoveries": true}'::jsonb,
        discovery_settings JSONB DEFAULT '{"auto_track": false, "min_confidence": 0.7}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_preferences UNIQUE (user_id)
      );

      CREATE TRIGGER update_user_preferences_updated_at
        BEFORE UPDATE ON user_preferences
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query('COMMIT');
    logger.info('Auth tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Auth tables migration failed:', error);
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
      DROP TABLE IF EXISTS user_preferences;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS users;
    `);

    await client.query('COMMIT');
    logger.info('Auth tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Auth tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

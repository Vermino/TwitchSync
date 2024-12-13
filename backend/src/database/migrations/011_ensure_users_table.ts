import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop existing users table if exists to avoid conflicts
    await client.query('DROP TABLE IF EXISTS users CASCADE');

    // Create fresh users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        twitch_id VARCHAR(50) UNIQUE,
        access_token VARCHAR(255),
        refresh_token VARCHAR(255),
        token_expires_at TIMESTAMP,
        profile_image_url TEXT,
        broadcaster_type VARCHAR(50),
        description TEXT,
        view_count INTEGER DEFAULT 0,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_users_twitch_id ON users(twitch_id);
      CREATE INDEX idx_users_username ON users(username);
    `);

    // Create updated_at trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
      
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await client.query('COMMIT');
    logger.info('Users table created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create users table:', error);
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
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      DROP FUNCTION IF EXISTS update_updated_at_column();
      DROP TABLE IF EXISTS users CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('Users table dropped successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to drop users table:', error);
    throw error;
  } finally {
    client.release();
  }
}

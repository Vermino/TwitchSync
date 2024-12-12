import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      // Create users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE,
          username VARCHAR(100) NOT NULL,
          password_hash VARCHAR(255),
          is_active BOOLEAN DEFAULT true,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create twitch_accounts table for OAuth integration
        CREATE TABLE IF NOT EXISTS twitch_accounts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          twitch_id VARCHAR(50) NOT NULL UNIQUE,
          username VARCHAR(100) NOT NULL,
          email VARCHAR(255),
          profile_image_url TEXT,
          access_token VARCHAR(255),
          refresh_token VARCHAR(255),
          token_expires_at TIMESTAMP,
          scope TEXT[],
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_user
            FOREIGN KEY(user_id) 
            REFERENCES users(id)
            ON DELETE CASCADE
        );

        -- Create sessions table
        CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          token VARCHAR(255) NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_user
            FOREIGN KEY(user_id) 
            REFERENCES users(id)
            ON DELETE CASCADE
        );

        -- Create function to update updated_at column
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ language 'plpgsql';

        -- Create triggers for updated_at
        CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

        CREATE TRIGGER update_twitch_accounts_updated_at
          BEFORE UPDATE ON twitch_accounts
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_twitch_accounts_twitch_id ON twitch_accounts(twitch_id);
        CREATE INDEX IF NOT EXISTS idx_twitch_accounts_user_id ON twitch_accounts(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      `);

      await client.query('COMMIT');
      logger.info('Auth tables migration completed successfully');
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
      await client.query(`
        DROP TRIGGER IF EXISTS update_twitch_accounts_updated_at ON twitch_accounts;
        DROP TRIGGER IF EXISTS update_users_updated_at ON users;
        DROP FUNCTION IF EXISTS update_updated_at_column();
        DROP TABLE IF EXISTS sessions;
        DROP TABLE IF EXISTS twitch_accounts;
        DROP TABLE IF EXISTS users;
      `);

      await client.query('COMMIT');
      logger.info('Auth tables rollback completed successfully');
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

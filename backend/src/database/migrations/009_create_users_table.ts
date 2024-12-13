import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      // Check if users table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `);

      if (!tableExists.rows[0].exists) {
        await client.query(`
          CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            email VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Check if the function exists
        const functionExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM pg_proc
            WHERE proname = 'update_updated_at_column'
          );
        `);

        if (!functionExists.rows[0].exists) {
          await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
            END;
            $$ language 'plpgsql';
          `);
        }

        // Check if trigger exists
        const triggerExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM pg_trigger
            WHERE tgname = 'update_users_updated_at'
          );
        `);

        if (!triggerExists.rows[0].exists) {
          await client.query(`
            CREATE TRIGGER update_users_updated_at
              BEFORE UPDATE ON users
              FOR EACH ROW
              EXECUTE FUNCTION update_updated_at_column();
          `);
        }

        // Create index if it doesn't exist
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `);
      } else {
        logger.info('Users table already exists, skipping creation');
      }

      await client.query('COMMIT');
      logger.info('Users table migration completed successfully');
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
        DROP TRIGGER IF EXISTS update_users_updated_at ON users;
        DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);

      await client.query('COMMIT');
      logger.info('Users table rollback completed successfully');
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

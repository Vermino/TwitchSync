import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      // Helper function to check if column exists
      const columnExists = async (columnName: string) => {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = $1
          );
        `, [columnName]);
        return result.rows[0].exists;
      };

      // Add columns if they don't exist
      const columnsToAdd = [
        { name: 'twitch_id', type: 'VARCHAR(50) UNIQUE' },
        { name: 'access_token', type: 'VARCHAR(255)' },
        { name: 'refresh_token', type: 'VARCHAR(255)' },
        { name: 'token_expires_at', type: 'TIMESTAMP' },
        { name: 'profile_image_url', type: 'TEXT' },
        { name: 'broadcaster_type', type: 'VARCHAR(50)' },
        { name: 'description', type: 'TEXT' },
        { name: 'view_count', type: 'INTEGER DEFAULT 0' },
        { name: 'last_login', type: 'TIMESTAMP' }
      ];

      for (const column of columnsToAdd) {
        if (!(await columnExists(column.name))) {
          await client.query(`
            ALTER TABLE users 
            ADD COLUMN ${column.name} ${column.type}
          `);
          logger.info(`Added column ${column.name} to users table`);
        }
      }

      // Create index if it doesn't exist
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_twitch_id ON users(twitch_id);
      `);

      await client.query('COMMIT');
      logger.info('Users table update completed successfully');
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
      // Drop added columns
      await client.query(`
        ALTER TABLE users
        DROP COLUMN IF EXISTS twitch_id,
        DROP COLUMN IF EXISTS access_token,
        DROP COLUMN IF EXISTS refresh_token,
        DROP COLUMN IF EXISTS token_expires_at,
        DROP COLUMN IF EXISTS profile_image_url,
        DROP COLUMN IF EXISTS broadcaster_type,
        DROP COLUMN IF EXISTS description,
        DROP COLUMN IF EXISTS view_count,
        DROP COLUMN IF EXISTS last_login;

        DROP INDEX IF EXISTS idx_users_twitch_id;
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

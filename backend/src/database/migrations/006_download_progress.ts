import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      // Add progress tracking columns to vod_downloads
      await client.query(`
        ALTER TABLE vod_downloads
        ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS speed VARCHAR(50),
        ADD COLUMN IF NOT EXISTS remaining VARCHAR(50),
        ADD COLUMN IF NOT EXISTS bytes_downloaded BIGINT DEFAULT 0;
      `);

      await client.query('COMMIT');
      logger.info('Download progress migration completed successfully');
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
        ALTER TABLE vod_downloads
        DROP COLUMN IF EXISTS progress,
        DROP COLUMN IF EXISTS speed,
        DROP COLUMN IF EXISTS remaining,
        DROP COLUMN IF EXISTS bytes_downloaded;
      `);

      await client.query('COMMIT');
      logger.info('Download progress rollback completed successfully');
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

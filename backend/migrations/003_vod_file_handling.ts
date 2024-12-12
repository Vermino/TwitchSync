import { Pool } from 'pg';
import { logger } from '../src/utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      // Modify vods table
      await client.query(`
        ALTER TABLE vods
        ADD COLUMN file_path VARCHAR(500),
        ADD COLUMN status VARCHAR(20) DEFAULT 'pending',
        ADD COLUMN file_size BIGINT,
        ADD COLUMN duration_seconds INTEGER;

        -- Create index for status queries
        CREATE INDEX IF NOT EXISTS idx_vods_status ON vods(status);
      `);

      // Create VOD processing history table
      await client.query(`
        CREATE TABLE IF NOT EXISTS vod_processing_history (
          id SERIAL PRIMARY KEY,
          vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL,
          error_message TEXT,
          started_at TIMESTAMP NOT NULL,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_vod_processing_history_vod_id 
        ON vod_processing_history(vod_id);
      `);

      await client.query('COMMIT');
      logger.info('VOD file handling migration completed successfully');
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
        ALTER TABLE vods
        DROP COLUMN file_path,
        DROP COLUMN status,
        DROP COLUMN file_size,
        DROP COLUMN duration_seconds;

        DROP TABLE IF EXISTS vod_processing_history;
      `);

      await client.query('COMMIT');
      logger.info('VOD file handling rollback completed successfully');
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

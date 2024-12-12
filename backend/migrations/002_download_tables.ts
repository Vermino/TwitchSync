import { Pool } from 'pg';
import { logger } from '../src/utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      // Create download_queue table
      await client.query(`
        CREATE TABLE IF NOT EXISTS download_queue (
          id SERIAL PRIMARY KEY,
          vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
          status VARCHAR(20) DEFAULT 'pending',
          priority INTEGER DEFAULT 1,
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
          vod_id INTEGER REFERENCES vods(id) ON DELETE CASCADE,
          download_path VARCHAR(500),
          download_status VARCHAR(20) NOT NULL,
          started_at TIMESTAMP NOT NULL,
          completed_at TIMESTAMP,
          file_size BIGINT,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_vod_downloads_status ON vod_downloads(download_status);
        CREATE INDEX IF NOT EXISTS idx_vod_downloads_vod_id ON vod_downloads(vod_id);
      `);

      await client.query('COMMIT');
      logger.info('Download tables migration completed successfully');
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
        DROP TABLE IF EXISTS download_queue;
        DROP TABLE IF EXISTS vod_downloads;
      `);

      await client.query('COMMIT');
      logger.info('Download tables rollback completed successfully');
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

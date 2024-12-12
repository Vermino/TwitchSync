import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_history_config (
          id SERIAL PRIMARY KEY,
          days_to_sync INTEGER NOT NULL,
          completed BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_sync_history_config_completed 
        ON sync_history_config(completed);
      `);

      await client.query('COMMIT');
      logger.info('Sync history configuration migration completed successfully');
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
        DROP TABLE IF EXISTS sync_history_config;
      `);

      await client.query('COMMIT');
      logger.info('Sync history configuration rollback completed successfully');
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

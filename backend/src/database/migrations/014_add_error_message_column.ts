// Filepath: backend/src/database/migrations/014_add_error_message_column.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add error_message column to tasks table
    await client.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS error_message TEXT;
    `);

    // Update existing task status handling
    await client.query(`
      UPDATE tasks 
      SET error_message = NULL 
      WHERE status NOT IN ('failed', 'completed_with_errors');
    `);

    await client.query('COMMIT');
    logger.info('Added error_message column successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding error_message column:', error);
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
      ALTER TABLE tasks
      DROP COLUMN IF EXISTS error_message;
    `);

    await client.query('COMMIT');
    logger.info('Removed error_message column successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error removing error_message column:', error);
    throw error;
  } finally {
    client.release();
  }
}

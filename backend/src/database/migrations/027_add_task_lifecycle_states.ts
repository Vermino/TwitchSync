// Add new task lifecycle states to support proper task workflow
import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Add new states to the task_status enum - each value must be in separate transaction
    await client.query(`ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'scanning';`);
    await client.query(`ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'ready';`);
    await client.query(`ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'downloading';`);
    
    await client.query('BEGIN');
    
    // Update any tasks that might be in old completed state to ready if they have queued VODs
    // Use text comparison to avoid enum value issues
    await client.query(`
      UPDATE tasks 
      SET status = 'ready'::task_status
      WHERE status::text = 'completed' 
      AND id IN (
        SELECT DISTINCT task_id 
        FROM vods 
        WHERE status = 'queued' AND task_id IS NOT NULL
      );
    `);

    // Set next_run for pending tasks if not set (12 hours from now for scheduled scanning)
    await client.query(`
      UPDATE tasks 
      SET next_run = NOW() + INTERVAL '12 hours'
      WHERE status::text = 'pending' 
      AND next_run IS NULL;
    `);

    await client.query('COMMIT');
    logger.info('Task lifecycle states migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Task lifecycle states migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reset tasks with new states to completed
    await client.query(`
      UPDATE tasks 
      SET status = 'completed'::task_status
      WHERE status IN ('scanning'::task_status, 'ready'::task_status, 'downloading'::task_status);
    `);

    // Note: Can't easily remove enum values in PostgreSQL, so we leave them
    // They will just be unused after rollback

    await client.query('COMMIT');
    logger.info('Task lifecycle states rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Task lifecycle states rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
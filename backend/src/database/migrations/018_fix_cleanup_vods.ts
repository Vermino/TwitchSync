// Filepath: backend/src/database/migrations/018_fix_cleanup_vods.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop existing triggers first
    await client.query(`
      DROP TRIGGER IF EXISTS cleanup_old_vods_trigger ON vods;
      DROP TRIGGER IF EXISTS trigger_cleanup_old_vods ON vods;
      DROP FUNCTION IF EXISTS trigger_cleanup_old_vods() CASCADE;
    `);

    // Recreate function with updated logic
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_vods()
      RETURNS void AS $$
      BEGIN
        -- Update status to archived for VODs that are past retention period
        UPDATE vods v
        SET 
          status = 'archived',
          deletion_scheduled_at = CURRENT_TIMESTAMP + COALESCE(
            (SELECT t.retention_days || ' days'
             FROM tasks t 
             WHERE t.id = v.task_id)::interval,
            '7 days'::interval
          )
        WHERE 
          v.status = 'completed'
          AND v.auto_delete = true
          AND v.downloaded_at < CURRENT_TIMESTAMP - COALESCE(
            (SELECT t.retention_days || ' days'
             FROM tasks t 
             WHERE t.id = v.task_id)::interval,
            '7 days'::interval
          );

        -- Delete VODs that have passed their deletion_scheduled_at date
        DELETE FROM vods
        WHERE 
          status = 'archived'
          AND deletion_scheduled_at < CURRENT_TIMESTAMP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create new trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION trigger_cleanup_old_vods()
      RETURNS trigger AS $$
      BEGIN
        PERFORM cleanup_old_vods();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create new trigger
    await client.query(`
      CREATE TRIGGER cleanup_old_vods_trigger
        AFTER UPDATE OF downloaded_at ON vods
        FOR EACH STATEMENT
        EXECUTE FUNCTION trigger_cleanup_old_vods();
    `);

    await client.query('COMMIT');
    logger.info('Successfully updated cleanup_old_vods function and trigger');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to update cleanup_old_vods function:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Remove trigger and function
    await client.query(`
      DROP TRIGGER IF EXISTS cleanup_old_vods_trigger ON vods;
      DROP TRIGGER IF EXISTS trigger_cleanup_old_vods ON vods;
      DROP FUNCTION IF EXISTS trigger_cleanup_old_vods() CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('Successfully removed cleanup_old_vods function and trigger');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to remove cleanup_old_vods function:', error);
    throw error;
  } finally {
    client.release();
  }
}

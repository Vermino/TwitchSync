// Filepath: backend/src/database/migrations/026_add_game_filter_skip_reason.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    logger.info('Adding GAME_FILTER to skip_reason_type enum');

    // Add GAME_FILTER to the existing enum
    await client.query(`
      ALTER TYPE skip_reason_type ADD VALUE IF NOT EXISTS 'GAME_FILTER';
    `);

    // Add context-aware game filtering reasons
    await client.query(`
      ALTER TYPE skip_reason_type ADD VALUE IF NOT EXISTS 'GAME_FILTER_PROMOTIONAL';
    `);

    await client.query(`
      ALTER TYPE skip_reason_type ADD VALUE IF NOT EXISTS 'GAME_FILTER_CONTEXT';
    `);

    // Remove duplicate entries first, keeping the most recent
    await client.query(`
      DELETE FROM task_skipped_vods a
      USING task_skipped_vods b
      WHERE a.id < b.id 
      AND a.task_id = b.task_id 
      AND a.vod_id = b.vod_id;
    `);

    // Add unique constraint to prevent duplicate entries for same task/vod combination
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE task_skipped_vods 
        ADD CONSTRAINT unique_task_vod_skip 
        UNIQUE (task_id, vod_id);
      EXCEPTION
        WHEN duplicate_table THEN null;
      END $$;
    `);

    // Update the comment to reflect the new reasons
    await client.query(`
      COMMENT ON COLUMN task_skipped_vods.reason IS 'Reason for skipping: VOD_NOT_FOUND, ERROR, INVALID_METADATA, GAME_FILTER, GAME_FILTER_PROMOTIONAL, or GAME_FILTER_CONTEXT';
    `);

    await client.query('COMMIT');
    logger.info('Successfully added GAME_FILTER to skip_reason_type enum');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding GAME_FILTER to skip_reason_type enum:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    logger.info('Removing GAME_FILTER records and constraint');

    // Remove the unique constraint
    await client.query(`
      ALTER TABLE task_skipped_vods 
      DROP CONSTRAINT IF EXISTS unique_task_vod_skip;
    `);

    // Remove all GAME_FILTER records
    await client.query(`
      DELETE FROM task_skipped_vods WHERE reason = 'GAME_FILTER';
    `);

    // Note: We cannot remove enum values in PostgreSQL without recreating the type
    // So we just remove the data and constraint for now
    logger.warn('Cannot remove GAME_FILTER from enum without recreating type - records removed instead');

    await client.query('COMMIT');
    logger.info('Successfully cleaned up GAME_FILTER migration changes');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error rolling back GAME_FILTER migration:', error);
    throw error;
  } finally {
    client.release();
  }
};
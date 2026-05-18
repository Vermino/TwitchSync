// Filepath: backend/src/database/migrations/029_add_paused_status_to_enums.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Adding paused status to existing enums if needed');

    // Check and add 'paused' to task_status enum if not exists
    const taskStatusCheck = await client.query(`
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'task_status' AND e.enumlabel = 'paused'
    `);
    
    if (taskStatusCheck.rows.length === 0) {
      await client.query(`ALTER TYPE task_status ADD VALUE 'paused'`);
      logger.info('Added paused status to task_status enum');
    } else {
      logger.info('Paused status already exists in task_status enum');
    }

    // Check and add 'paused' to vod_status enum if not exists
    const vodStatusCheck = await client.query(`
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'vod_status' AND e.enumlabel = 'paused'
    `);
    
    if (vodStatusCheck.rows.length === 0) {
      await client.query(`ALTER TYPE vod_status ADD VALUE 'paused'`);
      logger.info('Added paused status to vod_status enum');
    } else {
      logger.info('Paused status already exists in vod_status enum');
    }

    // Add last_paused_at column to tasks if it doesn't exist
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD COLUMN last_paused_at TIMESTAMP WITH TIME ZONE;
      EXCEPTION
        WHEN duplicate_column THEN 
          RAISE NOTICE 'Column last_paused_at already exists in tasks table';
      END $$;
    `);

    await client.query('COMMIT');
    logger.info('Successfully added paused status to enums');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding paused status to enums:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Removing paused status additions');

    // Remove last_paused_at column
    await client.query(`
      ALTER TABLE tasks DROP COLUMN IF EXISTS last_paused_at;
    `);

    // Note: We don't remove enum values as they might be in use
    // and PostgreSQL doesn't support removing enum values easily
    
    await client.query('COMMIT');
    logger.info('Paused status rollback completed (enum values preserved for safety)');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error rolling back paused status:', error);
    throw error;
  } finally {
    client.release();
  }
};
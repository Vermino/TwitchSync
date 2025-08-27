// Filepath: backend/src/database/migrations/028_add_resume_functionality.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting resume functionality migration');

    // Check and add 'paused' to task_status enum if not exists
    const taskStatusEnum = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'task_status' 
      AND enumlabel = 'paused';
    `);
    
    if (taskStatusEnum.rows.length === 0) {
      await client.query(`ALTER TYPE task_status ADD VALUE 'paused';`);
      logger.info('Added paused value to task_status enum');
    }

    // Check and add 'paused' to vod_status enum if not exists  
    const vodStatusEnum = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'vod_status' 
      AND enumlabel = 'paused';
    `);
    
    if (vodStatusEnum.rows.length === 0) {
      await client.query(`ALTER TYPE vod_status ADD VALUE 'paused';`);
      logger.info('Added paused value to vod_status enum');
    }

    // Add columns and other changes
    logger.info('Adding columns and indexes');

    // Add last_resumed_at column to tasks table
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD COLUMN last_resumed_at TIMESTAMP WITH TIME ZONE;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // Add segment_position column to vods table to track resume position
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE vods ADD COLUMN resume_segment_index INTEGER DEFAULT 0;
        ALTER TABLE vods ADD COLUMN pause_reason TEXT;
        ALTER TABLE vods ADD COLUMN paused_at TIMESTAMP WITH TIME ZONE;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // Create index on resume segment index for efficient queries (non-concurrent for transaction safety)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vods_resume_segment 
      ON vods(task_id, resume_segment_index) 
      WHERE download_status = 'paused';
    `);

    // Create function to get resumable tasks
    await client.query(`
      CREATE OR REPLACE FUNCTION get_resumable_tasks_for_user(user_id_param INTEGER)
      RETURNS TABLE (
        task_id INTEGER,
        task_name VARCHAR(255),
        paused_at TIMESTAMP WITH TIME ZONE,
        pending_vod_count INTEGER,
        paused_vod_count INTEGER
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          t.id as task_id,
          t.name as task_name,
          t.last_paused_at as paused_at,
          COUNT(CASE WHEN v.download_status = 'pending' THEN 1 END)::INTEGER as pending_vod_count,
          COUNT(CASE WHEN v.download_status = 'paused' THEN 1 END)::INTEGER as paused_vod_count
        FROM tasks t
        LEFT JOIN vods v ON t.id = v.task_id
        WHERE t.user_id = user_id_param
        AND t.status = 'paused'
        GROUP BY t.id, t.name, t.last_paused_at
        ORDER BY t.last_paused_at DESC;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create function to resume task downloads from last position
    await client.query(`
      CREATE OR REPLACE FUNCTION resume_task_downloads(task_id_param INTEGER)
      RETURNS TABLE (
        vod_id INTEGER,
        resume_segment_index INTEGER,
        total_segments INTEGER
      ) AS $$
      BEGIN
        -- Reset paused VODs to pending status with resume position
        UPDATE vods 
        SET download_status = 'pending',
            paused_at = NULL,
            updated_at = NOW()
        WHERE task_id = task_id_param 
        AND download_status = 'paused';

        -- Return VODs that need to be resumed with their positions
        RETURN QUERY
        SELECT 
          v.id as vod_id,
          COALESCE(v.resume_segment_index, 0) as resume_segment_index,
          0 as total_segments
        FROM vods v
        WHERE v.task_id = task_id_param 
        AND v.download_status IN ('pending', 'queued')
        AND v.resume_segment_index > 0
        ORDER BY v.download_priority DESC, v.created_at ASC;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('COMMIT');
    logger.info('Resume functionality migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in resume functionality migration:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop functions
    await client.query(`
      DROP FUNCTION IF EXISTS resume_task_downloads(INTEGER);
      DROP FUNCTION IF EXISTS get_resumable_tasks_for_user(INTEGER);
    `);

    // Drop indexes
    await client.query(`
      DROP INDEX IF EXISTS idx_vods_resume_segment;
    `);

    // Remove columns from vods table
    await client.query(`
      ALTER TABLE vods DROP COLUMN IF EXISTS paused_at;
      ALTER TABLE vods DROP COLUMN IF EXISTS pause_reason;
      ALTER TABLE vods DROP COLUMN IF EXISTS resume_segment_index;
    `);

    // Remove last_resumed_at column from tasks table
    await client.query(`
      ALTER TABLE tasks DROP COLUMN IF EXISTS last_resumed_at;
    `);

    // Note: We don't remove 'paused' from enum as it might break existing data
    // This is a safety measure to prevent data loss

    await client.query('COMMIT');
    logger.info('Resume functionality rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in resume functionality rollback:', error);
    throw error;
  } finally {
    client.release();
  }
};
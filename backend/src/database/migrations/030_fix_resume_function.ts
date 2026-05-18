// Filepath: backend/src/database/migrations/030_fix_resume_function.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting resume function fix migration');

    // Update the function to remove the non-existent segment_count reference
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
    logger.info('Resume function fix completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in resume function fix:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Restore the old function (with the broken segment_count reference)
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
          COALESCE(v.segment_count, 0) as total_segments
        FROM vods v
        WHERE v.task_id = task_id_param 
        AND v.download_status IN ('pending', 'queued')
        AND v.resume_segment_index > 0
        ORDER BY v.download_priority DESC, v.created_at ASC;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('COMMIT');
    logger.info('Resume function fix rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in resume function fix rollback:', error);
    throw error;
  } finally {
    client.release();
  }
};
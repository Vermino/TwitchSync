// Filepath: backend/src/database/migrations/027_queue_optimization.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting queue optimization migration');

    // Create composite indexes for queue operations (non-concurrent for transaction safety)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vods_queue_processing 
      ON vods(download_status, download_priority, created_at) 
      WHERE download_status IN ('pending', 'queued', 'downloading');
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vods_history_queries 
      ON vods(download_status, updated_at) 
      WHERE download_status IN ('completed', 'failed');
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vods_task_queue 
      ON vods(task_id, download_status, download_priority) 
      WHERE download_status IN ('pending', 'queued', 'downloading');
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vods_task_priority_order 
      ON vods(task_id, download_priority, created_at);
    `);

    // Create function for efficient queue position calculation
    await client.query(`
      CREATE OR REPLACE FUNCTION get_vod_queue_position(vod_id_param INTEGER)
      RETURNS INTEGER AS $$
      DECLARE
        position INTEGER;
        vod_priority TEXT;
        vod_created_at TIMESTAMP;
        vod_status TEXT;
      BEGIN
        -- Get VOD details
        SELECT download_priority, created_at, download_status
        INTO vod_priority, vod_created_at, vod_status
        FROM vods 
        WHERE id = vod_id_param;
        
        -- Return NULL if not in active queue
        IF vod_status NOT IN ('pending', 'queued', 'downloading') THEN
          RETURN NULL;
        END IF;
        
        -- Calculate position based on priority and creation time
        SELECT COUNT(*) + 1 INTO position
        FROM vods v
        WHERE v.download_status IN ('pending', 'queued', 'downloading')
        AND (
          -- Higher priority items
          CASE v.download_priority 
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END < 
          CASE vod_priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END
          OR (
            -- Same priority, earlier creation time
            CASE v.download_priority 
              WHEN 'critical' THEN 1
              WHEN 'high' THEN 2
              WHEN 'normal' THEN 3
              WHEN 'low' THEN 4
              ELSE 5
            END = 
            CASE vod_priority
              WHEN 'critical' THEN 1
              WHEN 'high' THEN 2
              WHEN 'normal' THEN 3
              WHEN 'low' THEN 4
              ELSE 5
            END
            AND v.created_at < vod_created_at
          )
        );
        
        RETURN position;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create function to get queue statistics efficiently
    await client.query(`
      CREATE OR REPLACE FUNCTION get_queue_stats_for_user(user_id_param INTEGER, task_id_param INTEGER DEFAULT NULL)
      RETURNS TABLE (
        pending_count INTEGER,
        queued_count INTEGER,
        downloading_count INTEGER,
        completed_count INTEGER,
        failed_count INTEGER,
        total_size_completed BIGINT,
        avg_speed DECIMAL(10,2),
        estimated_queue_time_minutes INTEGER
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          COUNT(CASE WHEN v.download_status = 'pending' THEN 1 END)::INTEGER,
          COUNT(CASE WHEN v.download_status = 'queued' THEN 1 END)::INTEGER,
          COUNT(CASE WHEN v.download_status = 'downloading' THEN 1 END)::INTEGER,
          COUNT(CASE WHEN v.download_status = 'completed' THEN 1 END)::INTEGER,
          COUNT(CASE WHEN v.download_status = 'failed' THEN 1 END)::INTEGER,
          COALESCE(SUM(CASE WHEN cv.file_size_bytes IS NOT NULL THEN cv.file_size_bytes END), 0)::BIGINT,
          COALESCE(ROUND(AVG(CASE WHEN cv.download_speed_mbps IS NOT NULL AND cv.download_speed_mbps > 0 
                               THEN cv.download_speed_mbps END), 2), 0)::DECIMAL(10,2),
          COALESCE(
            CEIL(
              (COUNT(CASE WHEN v.download_status IN ('pending', 'queued') THEN 1 END) * 
               AVG(CASE WHEN cv.download_duration_seconds IS NOT NULL AND cv.download_duration_seconds > 0 
                        THEN cv.download_duration_seconds ELSE 300 END)) / 60
            ), 0
          )::INTEGER
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        LEFT JOIN completed_vods cv ON v.id = cv.vod_id
        WHERE t.user_id = user_id_param
        AND (task_id_param IS NULL OR t.id = task_id_param);
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('COMMIT');
    logger.info('Queue optimization migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in queue optimization migration:', error);
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
      DROP FUNCTION IF EXISTS get_queue_stats_for_user(INTEGER, INTEGER);
      DROP FUNCTION IF EXISTS get_vod_queue_position(INTEGER);
    `);

    // Drop indexes
    await client.query(`
      DROP INDEX IF EXISTS idx_vods_task_priority_order;
      DROP INDEX IF EXISTS idx_vods_task_queue;
      DROP INDEX IF EXISTS idx_vods_history_queries;
      DROP INDEX IF EXISTS idx_vods_queue_processing;
    `);

    await client.query('COMMIT');
    logger.info('Queue optimization rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in queue optimization rollback:', error);
    throw error;
  } finally {
    client.release();
  }
};
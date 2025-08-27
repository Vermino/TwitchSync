// Filepath: backend/src/database/migrations/026_completed_vods_tracking.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting completed VODs tracking migration');

    // Create completed_vods table for tracking successfully downloaded VODs
    await client.query(`
      CREATE TABLE completed_vods (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER NOT NULL REFERENCES vods(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        twitch_id BIGINT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size_bytes BIGINT NOT NULL,
        download_duration_seconds INTEGER,
        download_speed_mbps DECIMAL(10,2),
        completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        checksum_md5 TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_twitch_id_task UNIQUE(twitch_id, task_id)
      );

      COMMENT ON TABLE completed_vods IS 'Tracks successfully completed VOD downloads with metadata';
      COMMENT ON COLUMN completed_vods.vod_id IS 'Reference to the VOD record in vods table';
      COMMENT ON COLUMN completed_vods.task_id IS 'Reference to the task that downloaded this VOD';
      COMMENT ON COLUMN completed_vods.twitch_id IS 'Twitch VOD ID for duplicate prevention';
      COMMENT ON COLUMN completed_vods.file_path IS 'Full path to the downloaded file';
      COMMENT ON COLUMN completed_vods.file_name IS 'Name of the downloaded file';
      COMMENT ON COLUMN completed_vods.file_size_bytes IS 'Size of the downloaded file in bytes';
      COMMENT ON COLUMN completed_vods.download_duration_seconds IS 'Time taken to download the VOD in seconds';
      COMMENT ON COLUMN completed_vods.download_speed_mbps IS 'Average download speed in Mbps';
      COMMENT ON COLUMN completed_vods.completed_at IS 'Timestamp when the download was completed';
      COMMENT ON COLUMN completed_vods.checksum_md5 IS 'MD5 checksum for file integrity verification';
      COMMENT ON COLUMN completed_vods.metadata IS 'Additional metadata about the download (quality, format, etc.)';
    `);

    // Create performance indexes
    await client.query(`
      -- Index on twitch_id for duplicate prevention
      CREATE INDEX idx_completed_vods_twitch_id ON completed_vods(twitch_id);
      
      -- Index on task_id for task-specific queries
      CREATE INDEX idx_completed_vods_task_id ON completed_vods(task_id);
      
      -- Index on completed_at for time-based queries
      CREATE INDEX idx_completed_vods_completed_at ON completed_vods(completed_at);
      
      -- Index on vod_id for joining with vods table
      CREATE INDEX idx_completed_vods_vod_id ON completed_vods(vod_id);
      
      -- Composite index for checking task completion status
      CREATE INDEX idx_completed_vods_task_twitch ON completed_vods(task_id, twitch_id);
      
      -- Index on file_size for storage analytics
      CREATE INDEX idx_completed_vods_file_size ON completed_vods(file_size_bytes);
    `);

    // Create function to automatically mark VOD as completed when inserted into completed_vods
    await client.query(`
      CREATE OR REPLACE FUNCTION mark_vod_completed()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Update the main vods table to mark as completed
        UPDATE vods 
        SET 
          download_status = 'completed',
          downloaded_at = NEW.completed_at,
          file_size = NEW.file_size_bytes,
          download_progress = 100.0,
          checksum = NEW.checksum_md5,
          updated_at = NOW()
        WHERE id = NEW.vod_id;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger to automatically update vods table
      CREATE TRIGGER trigger_mark_vod_completed
        AFTER INSERT ON completed_vods
        FOR EACH ROW
        EXECUTE FUNCTION mark_vod_completed();
    `);

    // Create function to get completion statistics for a task
    await client.query(`
      CREATE OR REPLACE FUNCTION get_task_completion_stats(task_id_param INTEGER)
      RETURNS TABLE (
        total_vods INTEGER,
        completed_vods INTEGER,
        completion_percentage DECIMAL(5,2),
        total_size_bytes BIGINT,
        avg_download_speed_mbps DECIMAL(10,2),
        avg_download_duration_seconds INTEGER
      ) AS $$
      DECLARE
        total_count INTEGER;
        completed_count INTEGER;
      BEGIN
        -- Get total VODs for this task
        SELECT COUNT(*)::INTEGER INTO total_count
        FROM vods WHERE task_id = task_id_param;
        
        -- Get completed VODs count and aggregated data
        SELECT 
          COUNT(cv.id)::INTEGER,
          COALESCE(SUM(cv.file_size_bytes), 0)::BIGINT,
          COALESCE(ROUND(AVG(cv.download_speed_mbps), 2), 0)::DECIMAL(10,2),
          COALESCE(ROUND(AVG(cv.download_duration_seconds)), 0)::INTEGER
        INTO completed_count, total_size_bytes, avg_download_speed_mbps, avg_download_duration_seconds
        FROM completed_vods cv
        WHERE cv.task_id = task_id_param;
        
        -- Calculate completion percentage
        completion_percentage := CASE 
          WHEN total_count > 0 
          THEN ROUND((completed_count::DECIMAL / total_count) * 100, 2)
          ELSE 0.00
        END;
        
        -- Return the results
        total_vods := total_count;
        completed_vods := completed_count;
        
        RETURN NEXT;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create function to check if a VOD is already completed for a task
    await client.query(`
      CREATE OR REPLACE FUNCTION is_vod_completed(twitch_id_param BIGINT, task_id_param INTEGER)
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN EXISTS (
          SELECT 1 FROM completed_vods 
          WHERE twitch_id = twitch_id_param 
          AND task_id = task_id_param
        );
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('COMMIT');
    logger.info('Completed VODs tracking migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in completed VODs tracking migration:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove functions
    await client.query(`
      DROP FUNCTION IF EXISTS is_vod_completed(BIGINT, INTEGER);
      DROP FUNCTION IF EXISTS get_task_completion_stats(INTEGER);
      DROP TRIGGER IF EXISTS trigger_mark_vod_completed ON completed_vods;
      DROP FUNCTION IF EXISTS mark_vod_completed();
    `);

    // Drop the completed_vods table
    await client.query(`
      DROP TABLE IF EXISTS completed_vods CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('Completed VODs tracking rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in completed VODs tracking rollback:', error);
    throw error;
  } finally {
    client.release();
  }
};
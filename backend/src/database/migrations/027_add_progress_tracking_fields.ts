// Filepath: backend/src/database/migrations/027_add_progress_tracking_fields.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    logger.info('Running migration 027: Add progress tracking fields');

    // Add current_segment and total_segments columns to vods table if they don't exist
    await client.query(`
      DO $$ BEGIN
        -- Add current_segment column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'current_segment') THEN
          ALTER TABLE vods ADD COLUMN current_segment INTEGER DEFAULT 0;
        END IF;
        
        -- Add total_segments column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'total_segments') THEN
          ALTER TABLE vods ADD COLUMN total_segments INTEGER DEFAULT 0;
        END IF;
        
        -- Add download_speed column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'download_speed') THEN
          ALTER TABLE vods ADD COLUMN download_speed DECIMAL(10,2) DEFAULT 0;
        END IF;
        
        -- Add eta_seconds column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'eta_seconds') THEN
          ALTER TABLE vods ADD COLUMN eta_seconds INTEGER DEFAULT 0;
        END IF;
        
        -- Add resume_segment_index column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'resume_segment_index') THEN
          ALTER TABLE vods ADD COLUMN resume_segment_index INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);

    // Add indexes for better query performance on progress tracking
    await client.query(`
      DO $$ BEGIN
        -- Index on download_status for queue operations
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vods' AND indexname = 'idx_vods_download_status') THEN
          CREATE INDEX idx_vods_download_status ON vods(download_status);
        END IF;
        
        -- Index on task_id and download_status combination
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vods' AND indexname = 'idx_vods_task_status') THEN
          CREATE INDEX idx_vods_task_status ON vods(task_id, download_status);
        END IF;
        
        -- Index on download_progress for progress queries
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vods' AND indexname = 'idx_vods_download_progress') THEN
          CREATE INDEX idx_vods_download_progress ON vods(download_progress);
        END IF;
      END $$;
    `);

    logger.info('Migration 027 completed: Progress tracking fields added');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration 027 failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    logger.info('Rolling back migration 027: Remove progress tracking fields');

    // Remove added columns
    await client.query(`
      DO $$ BEGIN
        -- Remove indexes
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vods' AND indexname = 'idx_vods_download_progress') THEN
          DROP INDEX idx_vods_download_progress;
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vods' AND indexname = 'idx_vods_task_status') THEN
          DROP INDEX idx_vods_task_status;
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vods' AND indexname = 'idx_vods_download_status') THEN
          DROP INDEX idx_vods_download_status;
        END IF;
        
        -- Remove columns
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'resume_segment_index') THEN
          ALTER TABLE vods DROP COLUMN resume_segment_index;
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'eta_seconds') THEN
          ALTER TABLE vods DROP COLUMN eta_seconds;
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'download_speed') THEN
          ALTER TABLE vods DROP COLUMN download_speed;
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'total_segments') THEN
          ALTER TABLE vods DROP COLUMN total_segments;
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vods' AND column_name = 'current_segment') THEN
          ALTER TABLE vods DROP COLUMN current_segment;
        END IF;
      END $$;
    `);

    logger.info('Migration 027 rollback completed');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration 027 rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
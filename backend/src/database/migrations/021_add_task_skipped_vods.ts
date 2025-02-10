// Filepath: backend/src/database/migrations/021_add_task_skipped_vods.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    logger.info('Starting task_skipped_vods migration');

    // Create enum type for skip reasons
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE skip_reason_type AS ENUM ('VOD_NOT_FOUND', 'ERROR', 'INVALID_METADATA');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create task_skipped_vods table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_skipped_vods (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        vod_id BIGINT NOT NULL,
        reason skip_reason_type NOT NULL,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Add indexes for better query performance
      CREATE INDEX IF NOT EXISTS idx_task_skipped_vods_task_id ON task_skipped_vods(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_skipped_vods_vod_id ON task_skipped_vods(vod_id);
      CREATE INDEX IF NOT EXISTS idx_task_skipped_vods_reason ON task_skipped_vods(reason);
      CREATE INDEX IF NOT EXISTS idx_task_skipped_vods_created_at ON task_skipped_vods(created_at);

      -- Add comments
      COMMENT ON TABLE task_skipped_vods IS 'Tracks VODs that were skipped during task processing';
      COMMENT ON COLUMN task_skipped_vods.task_id IS 'Reference to the task that encountered the skipped VOD';
      COMMENT ON COLUMN task_skipped_vods.vod_id IS 'Twitch VOD ID that was skipped';
      COMMENT ON COLUMN task_skipped_vods.reason IS 'Reason for skipping: VOD_NOT_FOUND, ERROR, or INVALID_METADATA';
      COMMENT ON COLUMN task_skipped_vods.error_message IS 'Detailed error message if applicable';
      COMMENT ON COLUMN task_skipped_vods.created_at IS 'Timestamp when the VOD was skipped';
    `);

    await client.query('COMMIT');
    logger.info('Successfully created task_skipped_vods table and indexes');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating task_skipped_vods table:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop table and indexes
    await client.query(`
      DROP TABLE IF EXISTS task_skipped_vods CASCADE;
    `);

    // Drop enum type
    await client.query(`
      DROP TYPE IF EXISTS skip_reason_type CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('Successfully removed task_skipped_vods table and related objects');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error removing task_skipped_vods table:', error);
    throw error;
  } finally {
    client.release();
  }
};

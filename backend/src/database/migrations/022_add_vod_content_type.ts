// Filepath: backend/src/database/migrations/022_add_vod_content_type.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting add_vod_content_type migration');

    // Create enum types if they don't exist
    await client.query(`
      DO $$ 
      BEGIN
        CREATE TYPE vod_content_type AS ENUM (
          'stream', 'highlight', 'upload', 'clip', 'premiere'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await client.query(`
      DO $$ 
      BEGIN
        CREATE TYPE vod_status AS ENUM (
          'pending', 'queued', 'downloading', 'processing', 'completed', 
          'failed', 'cancelled', 'archived', 'deleted'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add new columns
    await client.query(`
      ALTER TABLE vods
      ADD COLUMN IF NOT EXISTS content_type vod_content_type NOT NULL DEFAULT 'stream',
      ADD COLUMN IF NOT EXISTS status vod_status NOT NULL DEFAULT 'pending';
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vods_content_type ON vods(content_type);
      CREATE INDEX IF NOT EXISTS idx_vods_status ON vods(status);
    `);

    // Add column comments
    await client.query(`
      COMMENT ON COLUMN vods.content_type IS 'Type of VOD content: stream, highlight, upload, clip, or premiere';
      COMMENT ON COLUMN vods.status IS 'Current status of the VOD: pending, queued, downloading, etc.';
    `);

    await client.query('COMMIT');
    logger.info('Successfully added VOD content_type and status columns');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding VOD content_type and status:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop columns
    await client.query(`
      ALTER TABLE vods 
      DROP COLUMN IF EXISTS content_type,
      DROP COLUMN IF EXISTS status;
    `);

    // Drop enum types
    await client.query(`
      DROP TYPE IF EXISTS vod_content_type CASCADE;
      DROP TYPE IF EXISTS vod_status CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('Successfully removed VOD content_type and status columns');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error removing VOD content_type and status:', error);
    throw error;
  } finally {
    client.release();
  }
};

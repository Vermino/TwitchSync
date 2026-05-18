// Filepath: backend/src/database/migrations/023_add_vod_events.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting vod_events table migration');

    // Create enum type for event types
    await client.query(`
      DO $$ 
      BEGIN
        CREATE TYPE vod_event_type AS ENUM (
          'error', 'download_start', 'download_complete', 'download_progress',
          'processing_start', 'processing_complete', 'deletion'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create vod_events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vod_events (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER NOT NULL REFERENCES vods(id) ON DELETE CASCADE,
        event_type vod_event_type NOT NULL,
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Add indexes for better query performance
      CREATE INDEX IF NOT EXISTS idx_vod_events_vod_id ON vod_events(vod_id);
      CREATE INDEX IF NOT EXISTS idx_vod_events_event_type ON vod_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_vod_events_created_at ON vod_events(created_at);

      -- Add comments
      COMMENT ON TABLE vod_events IS 'Tracks events and status changes for VODs';
      COMMENT ON COLUMN vod_events.vod_id IS 'Reference to the VOD this event belongs to';
      COMMENT ON COLUMN vod_events.event_type IS 'Type of event that occurred';
      COMMENT ON COLUMN vod_events.details IS 'Additional event-specific details stored as JSON';
      COMMENT ON COLUMN vod_events.created_at IS 'Timestamp when the event was recorded';
    `);

    await client.query('COMMIT');
    logger.info('Successfully created vod_events table and indexes');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating vod_events table:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop table and enum type
    await client.query(`
      DROP TABLE IF EXISTS vod_events CASCADE;
      DROP TYPE IF EXISTS vod_event_type CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('Successfully removed vod_events table and related objects');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error removing vod_events table:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Filepath: backend/src/database/migrations/012_add_vod_constraints.ts

import { Client } from 'pg';
import { logger } from '../../utils/logger';

export async function up(client: Client): Promise<void> {
  try {
    await client.query('BEGIN');

    // Add unique constraint for task_id, channel_id, and twitch_vod_id
    await client.query(`
      ALTER TABLE vods
      ADD COLUMN IF NOT EXISTS twitch_vod_id VARCHAR(255);
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vods_unique_download 
      ON vods(task_id, channel_id, twitch_vod_id)
      WHERE twitch_vod_id IS NOT NULL;
    `);

    await client.query('COMMIT');
    logger.info('Added vod constraints');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding vod constraints:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  try {
    await client.query('BEGIN');

    await client.query('DROP INDEX IF EXISTS idx_vods_unique_download;');
    await client.query('ALTER TABLE vods DROP COLUMN IF EXISTS twitch_vod_id;');

    await client.query('COMMIT');
    logger.info('Removed vod constraints');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error removing vod constraints:', error);
    throw error;
  }
}

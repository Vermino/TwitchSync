// Filepath: backend/src/database/migrations/017_add_channel_live_status.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE channel_game_history
      ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false;
    `);

    // Index for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_channel_game_history_is_live 
      ON channel_game_history(is_live) 
      WHERE is_live = true;
    `);

    await client.query('COMMIT');
    logger.info('Added is_live column to channel_game_history');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to add is_live column:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      DROP INDEX IF EXISTS idx_channel_game_history_is_live;
      
      ALTER TABLE channel_game_history
      DROP COLUMN IF EXISTS is_live;
    `);

    await client.query('COMMIT');
    logger.info('Removed is_live column from channel_game_history');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to remove is_live column:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Filepath: backend/src/database/migrations/020_fix_vod_id_type.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Alter vods table to use bigint
    await client.query(`
      ALTER TABLE vods
      ALTER COLUMN twitch_id TYPE BIGINT USING twitch_id::bigint;
    `);

    await client.query('COMMIT');
    logger.info('Successfully updated VOD ID column type');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating VOD ID column type:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Convert back to integer (may fail if values are too large)
    await client.query(`
      ALTER TABLE vods
      ALTER COLUMN twitch_id TYPE INTEGER USING 
        CASE 
          WHEN twitch_id > 2147483647 THEN NULL 
          ELSE twitch_id::integer 
        END;
    `);

    await client.query('COMMIT');
    logger.info('Successfully reverted VOD ID column type');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error reverting VOD ID column type:', error);
    throw error;
  } finally {
    client.release();
  }
};

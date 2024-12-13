// backend/src/database/migrations/012_update_channels_metadata.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      -- Add new columns for channel metadata
      ALTER TABLE channels
      ADD COLUMN IF NOT EXISTS display_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS follower_count INTEGER;

      -- Update display_name for existing records
      UPDATE channels 
      SET display_name = username 
      WHERE display_name IS NULL;

      -- Add indexes for new searchable columns
      CREATE INDEX IF NOT EXISTS idx_channels_display_name ON channels(display_name);
      CREATE INDEX IF NOT EXISTS idx_channels_follower_count ON channels(follower_count);
    `);

    logger.info('Successfully added channel metadata columns');
  } catch (error) {
    logger.error('Error adding channel metadata columns:', error);
    throw error;
  }
}

export async function down(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      -- Remove indexes
      DROP INDEX IF EXISTS idx_channels_display_name;
      DROP INDEX IF EXISTS idx_channels_follower_count;

      -- Remove columns
      ALTER TABLE channels
      DROP COLUMN IF EXISTS display_name,
      DROP COLUMN IF EXISTS profile_image_url,
      DROP COLUMN IF EXISTS description,
      DROP COLUMN IF EXISTS follower_count;
    `);

    logger.info('Successfully removed channel metadata columns');
  } catch (error) {
    logger.error('Error removing channel metadata columns:', error);
    throw error;
  }
}

import { PoolClient } from 'pg';
import logger from '../../utils/logger';

export async function up(client: PoolClient): Promise<void> {
    logger.info('Running migration 035: Add global quality setting');

    try {
        // Insert default quality setting if it doesn't exist
        await client.query(`
      INSERT INTO system_settings (category, key, value, description)
      VALUES (
        'downloads', 
        'default_quality', 
        '"source"', 
        'Global default video quality for downloads (e.g., source, 1080p60, 720p)'
      )
      ON CONFLICT (category, key) DO NOTHING;
    `);

        logger.info('Successfully added global quality setting');
    } catch (error) {
        logger.error('Failed to run migration 035:', error);
        throw error;
    }
}

export async function down(client: PoolClient): Promise<void> {
    logger.info('Reverting migration 035: Remove global quality setting');

    try {
        await client.query(`
      DELETE FROM system_settings 
      WHERE category = 'downloads' AND key = 'default_quality';
    `);

        logger.info('Successfully reverted migration 035');
    } catch (error) {
        logger.error('Failed to revert migration 035:', error);
        throw error;
    }
}

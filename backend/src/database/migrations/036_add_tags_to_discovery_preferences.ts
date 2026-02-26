import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add tags array to discovery_preferences
        await client.query(`
      ALTER TABLE discovery_preferences 
      ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT NULL;
    `);

        await client.query('COMMIT');
        logger.info('Migration 036 (Add tags to discovery preferences) applied.');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Failed to apply migration 036:', error);
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
      ALTER TABLE discovery_preferences 
      DROP COLUMN IF EXISTS tags;
    `);

        await client.query('COMMIT');
        logger.info('Migration 036 rolled back.');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Failed to rollback migration 036:', error);
        throw error;
    } finally {
        client.release();
    }
}

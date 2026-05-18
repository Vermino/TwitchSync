import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add quality column to tasks table
        await client.query(`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS quality VARCHAR(50);
    `);

        logger.info('Successfully added quality column to tasks table');

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error adding quality column to tasks table:', error);
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
      ALTER TABLE tasks 
      DROP COLUMN IF EXISTS quality;
    `);

        logger.info('Successfully removed quality column from tasks table');

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error removing quality column from tasks table:', error);
        throw error;
    } finally {
        client.release();
    }
}

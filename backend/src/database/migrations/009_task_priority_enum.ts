// Filepath: backend/src/database/migrations/009_task_priority_enum.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create the enum type
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE task_priority_level AS ENUM ('low', 'medium', 'high');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Simply drop and recreate the column since it's dev
        await client.query(`
            ALTER TABLE tasks 
            DROP COLUMN IF EXISTS priority;
        `);

        await client.query(`
            ALTER TABLE tasks 
            ADD COLUMN priority task_priority_level NOT NULL DEFAULT 'low';
        `);

        await client.query('COMMIT');
        logger.info('Priority enum migration completed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error during priority enum migration:', error);
        throw error;
    } finally {
        client.release();
    }
}

export async function down(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Drop the enum column and create integer column
        await client.query(`
            ALTER TABLE tasks 
            DROP COLUMN IF EXISTS priority;
        `);

        await client.query(`
            ALTER TABLE tasks 
            ADD COLUMN priority integer NOT NULL DEFAULT 1;
        `);

        // Drop the enum type
        await client.query(`
            DROP TYPE IF EXISTS task_priority_level;
        `);

        await client.query('COMMIT');
        logger.info('Priority enum rollback completed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error during priority enum rollback:', error);
        throw error;
    } finally {
        client.release();
    }
}

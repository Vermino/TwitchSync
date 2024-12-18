// Filepath: backend/src/database/migrations/011_add_task_id_to_vods.ts

import { Client } from 'pg';
import { logger } from '../../utils/logger';

export async function up(client: Client): Promise<void> {
  try {
    await client.query('BEGIN');

    // Add task_id column to vods table
    await client.query(`
      ALTER TABLE vods
      ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
    `);

    // Create an index for task_id for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vods_task_id ON vods(task_id);
    `);

    await client.query('COMMIT');
    logger.info('Added task_id column to vods table');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error adding task_id to vods table:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  try {
    await client.query('BEGIN');

    // Remove the index first
    await client.query('DROP INDEX IF EXISTS idx_vods_task_id;');

    // Remove the task_id column
    await client.query(`
      ALTER TABLE vods
      DROP COLUMN IF EXISTS task_id;
    `);

    await client.query('COMMIT');
    logger.info('Removed task_id column from vods table');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error removing task_id from vods table:', error);
    throw error;
  }
}

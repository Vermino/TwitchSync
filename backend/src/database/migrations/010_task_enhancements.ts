// Filepath: backend/src/database/migrations/010_task_enhancements.ts

import { Client } from 'pg';
import { logger } from '../../utils/logger';

export async function up(client: Client): Promise<void> {
  try {
    // Start transaction
    await client.query('BEGIN');

    // Add new columns to tasks table
    await client.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}' NOT NULL,
      ADD COLUMN IF NOT EXISTS restrictions JSONB DEFAULT '{}' NOT NULL;
    `);

    // Create indexes for improved query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_min_followers 
      ON tasks ((conditions->>'minFollowers'))
      WHERE conditions->>'minFollowers' IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_min_views 
      ON tasks ((conditions->>'minViews'))
      WHERE conditions->>'minViews' IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_languages 
      ON tasks USING GIN ((conditions->'languages'))
      WHERE conditions->>'languages' IS NOT NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_max_storage 
      ON tasks ((restrictions->>'maxTotalStorage'))
      WHERE restrictions->>'maxTotalStorage' IS NOT NULL;
    `);

    await client.query('COMMIT');
    logger.info('Task enhancements migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in task enhancements migration:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  try {
    // Start transaction
    await client.query('BEGIN');

    // Drop indexes
    await client.query('DROP INDEX IF EXISTS idx_tasks_min_followers;');
    await client.query('DROP INDEX IF EXISTS idx_tasks_min_views;');
    await client.query('DROP INDEX IF EXISTS idx_tasks_languages;');
    await client.query('DROP INDEX IF EXISTS idx_tasks_max_storage;');

    // Remove columns
    await client.query(`
      ALTER TABLE tasks
      DROP COLUMN IF EXISTS conditions,
      DROP COLUMN IF EXISTS restrictions;
    `);

    await client.query('COMMIT');
    logger.info('Task enhancements rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in task enhancements rollback:', error);
    throw error;
  }
}

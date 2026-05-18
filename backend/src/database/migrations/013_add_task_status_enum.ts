// Filepath: backend/src/database/migrations/013_add_task_status_enum.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create the task_status enum type with all possible values
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE task_status AS ENUM (
          'pending',
          'running',
          'completed',
          'completed_with_errors',
          'failed',
          'success',
          'cancelled',
          'paused'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add error_message column first
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD COLUMN error_message TEXT;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // Create temporary status column
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD COLUMN status_new task_status;
        ALTER TABLE task_history ADD COLUMN status_new task_status;
      EXCEPTION
        WHEN duplicate_column THEN null;
      END $$;
    `);

    // Migrate data with explicit mapping
    await client.query(`
      UPDATE tasks 
      SET status_new = (
        CASE COALESCE(status, 'pending')
          WHEN 'pending' THEN 'pending'::task_status
          WHEN 'running' THEN 'running'::task_status
          WHEN 'completed' THEN 'completed'::task_status
          WHEN 'completed_with_errors' THEN 'completed_with_errors'::task_status
          WHEN 'failed' THEN 'failed'::task_status
          WHEN 'success' THEN 'completed'::task_status
          WHEN 'cancelled' THEN 'cancelled'::task_status
          ELSE 'pending'::task_status
        END
      )
      WHERE status_new IS NULL;
    `);

    await client.query(`
      UPDATE task_history 
      SET status_new = (
        CASE COALESCE(status, 'pending')
          WHEN 'pending' THEN 'pending'::task_status
          WHEN 'running' THEN 'running'::task_status
          WHEN 'completed' THEN 'completed'::task_status
          WHEN 'completed_with_errors' THEN 'completed_with_errors'::task_status
          WHEN 'failed' THEN 'failed'::task_status
          WHEN 'success' THEN 'completed'::task_status
          WHEN 'cancelled' THEN 'cancelled'::task_status
          ELSE 'pending'::task_status
        END
      )
      WHERE status_new IS NULL;
    `);

    // Drop old status column and rename new one
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks DROP COLUMN status;
        ALTER TABLE task_history DROP COLUMN status;
      EXCEPTION
        WHEN undefined_column THEN null;
      END $$;
    `);

    await client.query(`
      ALTER TABLE tasks RENAME COLUMN status_new TO status;
      ALTER TABLE task_history RENAME COLUMN status_new TO status;
    `);

    // Set defaults
    await client.query(`
      ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'pending'::task_status;
      ALTER TABLE task_history ALTER COLUMN status SET DEFAULT 'pending'::task_status;
    `);

    // Create new indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_task_history_status ON task_history(status);
    `);

    await client.query('COMMIT');
    logger.info('Task status enum and error message migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Task status enum migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create temporary text columns
    await client.query(`
      ALTER TABLE tasks ADD COLUMN status_old text;
      ALTER TABLE task_history ADD COLUMN status_old text;
    `);

    // Copy data back to text
    await client.query(`
      UPDATE tasks 
      SET status_old = CASE status::text
        WHEN 'completed' THEN 'success'
        ELSE status::text
      END;
    `);

    await client.query(`
      UPDATE task_history 
      SET status_old = CASE status::text
        WHEN 'completed' THEN 'success'
        ELSE status::text
      END;
    `);

    // Drop enum columns
    await client.query(`
      ALTER TABLE tasks DROP COLUMN status;
      ALTER TABLE task_history DROP COLUMN status;
    `);

    // Rename text columns
    await client.query(`
      ALTER TABLE tasks RENAME COLUMN status_old TO status;
      ALTER TABLE task_history RENAME COLUMN status_old TO status;
    `);

    // Drop error_message column
    await client.query(`
      ALTER TABLE tasks DROP COLUMN IF EXISTS error_message;
    `);

    // Drop the enum type
    await client.query(`
      DROP TYPE IF EXISTS task_status CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('Task status enum rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Task status enum rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Filepath: backend/src/database/migrations/024_fix_task_monitoring_constraints.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    logger.info('Starting task monitoring constraints fix migration');

    // Drop the existing unique constraint
    await client.query(`
      ALTER TABLE task_monitoring
      DROP CONSTRAINT IF EXISTS task_monitoring_task_id_unique;
    `);

    // Drop any existing task monitoring entries for non-existent tasks
    await client.query(`
      DELETE FROM task_monitoring tm
      WHERE NOT EXISTS (
        SELECT 1 FROM tasks t WHERE t.id = tm.task_id
      );
    `);

    // Add back the constraint as a foreign key with CASCADE
    await client.query(`
      ALTER TABLE task_monitoring
      ADD CONSTRAINT task_monitoring_task_id_fk
      FOREIGN KEY (task_id)
      REFERENCES tasks(id)
      ON DELETE CASCADE;
    `);

    // Create function to maintain single monitoring entry per task
    await client.query(`
      CREATE OR REPLACE FUNCTION maintain_single_task_monitoring()
      RETURNS TRIGGER AS $$
      BEGIN
        DELETE FROM task_monitoring
        WHERE task_id = NEW.task_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to enforce single monitoring entry
    await client.query(`
      DROP TRIGGER IF EXISTS ensure_single_task_monitoring ON task_monitoring;
      
      CREATE TRIGGER ensure_single_task_monitoring
      BEFORE INSERT ON task_monitoring
      FOR EACH ROW
      EXECUTE FUNCTION maintain_single_task_monitoring();
    `);

    await client.query('COMMIT');
    logger.info('Task monitoring constraints fix completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in task monitoring constraints fix:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove trigger and function
    await client.query(`
      DROP TRIGGER IF EXISTS ensure_single_task_monitoring ON task_monitoring;
      DROP FUNCTION IF EXISTS maintain_single_task_monitoring();
    `);

    // Remove foreign key constraint
    await client.query(`
      ALTER TABLE task_monitoring
      DROP CONSTRAINT IF EXISTS task_monitoring_task_id_fk;
    `);

    // Add back original unique constraint
    await client.query(`
      ALTER TABLE task_monitoring
      ADD CONSTRAINT task_monitoring_task_id_unique
      UNIQUE (task_id);
    `);

    await client.query('COMMIT');
    logger.info('Task monitoring constraints rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in task monitoring constraints rollback:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Filepath: backend/src/database/migrations/025_add_task_events.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting task events migration');

    // Create task history table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_history (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        error_message TEXT,
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_history_created_at ON task_history(created_at);
    `);

    // Create task events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_events (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_events_event_type ON task_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON task_events(created_at);

      COMMENT ON TABLE task_events IS 'Stores detailed event history for tasks';
      COMMENT ON COLUMN task_events.event_type IS 'Type of event (e.g., created, started, completed, failed, warning)';
      COMMENT ON COLUMN task_events.details IS 'JSON object containing event-specific details';
    `);

    // Create timestamp update trigger for task_history
    await client.query(`
      CREATE OR REPLACE FUNCTION update_task_history_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_task_history_timestamp ON task_history;
      
      CREATE TRIGGER update_task_history_timestamp
          BEFORE UPDATE ON task_history
          FOR EACH ROW
          EXECUTE FUNCTION update_task_history_timestamp();
    `);

    // Create function to automatically create history entry when task status changes
    await client.query(`
      CREATE OR REPLACE FUNCTION create_task_event()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (TG_OP = 'INSERT' OR NEW.status <> OLD.status) THEN
          INSERT INTO task_events (task_id, event_type, details)
          VALUES (
            NEW.task_id,
            CASE 
              WHEN NEW.status = 'running' THEN 'started'
              WHEN NEW.status = 'completed' THEN 'completed'
              WHEN NEW.status = 'failed' THEN 'failed'
              ELSE 'status_changed'
            END,
            jsonb_build_object(
              'status', NEW.status,
              'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
              'message', NEW.status_message
            )
          );
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS log_task_status_change ON task_monitoring;
      
      CREATE TRIGGER log_task_status_change
        AFTER INSERT OR UPDATE ON task_monitoring
        FOR EACH ROW
        EXECUTE FUNCTION create_task_event();
    `);

    await client.query('COMMIT');
    logger.info('Task events migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in task events migration:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove triggers and functions
    await client.query(`
      DROP TRIGGER IF EXISTS log_task_status_change ON task_monitoring;
      DROP FUNCTION IF EXISTS create_task_event();
      DROP TRIGGER IF EXISTS update_task_history_timestamp ON task_history;
      DROP FUNCTION IF EXISTS update_task_history_timestamp();
    `);

    // Drop tables
    await client.query(`
      DROP TABLE IF EXISTS task_events CASCADE;
      DROP TABLE IF EXISTS task_history CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('Task events rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in task events rollback:', error);
    throw error;
  } finally {
    client.release();
  }
};

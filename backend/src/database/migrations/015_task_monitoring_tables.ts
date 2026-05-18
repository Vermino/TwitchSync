// Filepath: backend/src/database/migrations/015_task_monitoring_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create task monitoring status enum if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_monitoring_status') THEN
          CREATE TYPE task_monitoring_status AS ENUM (
            'created',
            'pending',
            'running',
            'paused',
            'completed',
            'failed',
            'cancelled'
          );
        END IF;
      END $$;
    `);

    // Create task_monitoring table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_monitoring (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'created',
        status_message TEXT,
        progress_percentage FLOAT DEFAULT 0,
        items_total INTEGER DEFAULT 0,
        items_completed INTEGER DEFAULT 0,
        items_failed INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'::jsonb,
        last_check_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT task_monitoring_task_id_unique UNIQUE (task_id)
      );

      CREATE INDEX IF NOT EXISTS idx_task_monitoring_task_id ON task_monitoring(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_monitoring_status ON task_monitoring(status);
      CREATE INDEX IF NOT EXISTS idx_task_monitoring_created_at ON task_monitoring(created_at);
    `);

    // Create task_statistics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_statistics (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        total_vods INTEGER NOT NULL DEFAULT 0,
        successful_downloads INTEGER NOT NULL DEFAULT 0,
        failed_downloads INTEGER NOT NULL DEFAULT 0,
        total_storage_bytes BIGINT NOT NULL DEFAULT 0,
        avg_download_speed FLOAT NOT NULL DEFAULT 0,
        last_execution_time INTEGER,
        total_executions INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT task_statistics_task_id_unique UNIQUE (task_id)
      );

      CREATE INDEX IF NOT EXISTS idx_task_statistics_task_id ON task_statistics(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_statistics_created_at ON task_statistics(created_at);
    `);

    // Create vod_language_stats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vod_language_stats (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        language VARCHAR(10) NOT NULL,
        vod_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT vod_language_stats_task_lang_unique UNIQUE (task_id, language)
      );

      CREATE INDEX IF NOT EXISTS idx_vod_language_stats_task_id ON vod_language_stats(task_id);
      CREATE INDEX IF NOT EXISTS idx_vod_language_stats_updated ON vod_language_stats(updated_at);
    `);

    // Create task_performance_metrics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_performance_metrics (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        execution_time FLOAT NOT NULL DEFAULT 0,
        success_rate FLOAT NOT NULL DEFAULT 0,
        failure_rate FLOAT NOT NULL DEFAULT 0,
        avg_download_speed FLOAT NOT NULL DEFAULT 0,
        vod_count INTEGER NOT NULL DEFAULT 0,
        storage_used BIGINT NOT NULL DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        warning_count INTEGER DEFAULT 0,
        measured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT task_performance_metrics_task_measured_unique UNIQUE (task_id, measured_at)
      );

      CREATE INDEX IF NOT EXISTS idx_task_performance_metrics_task_id ON task_performance_metrics(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_performance_metrics_measured ON task_performance_metrics(measured_at);
    `);

    // Create task_monitoring update trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_task_monitoring_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_task_monitoring_timestamp ON task_monitoring;
      
      CREATE TRIGGER update_task_monitoring_timestamp
          BEFORE UPDATE ON task_monitoring
          FOR EACH ROW
          EXECUTE FUNCTION update_task_monitoring_timestamp();
    `);

    // Create task creation trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION create_task_monitoring_record()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO task_monitoring (
          task_id,
          status,
          status_message,
          progress_percentage,
          items_total,
          items_completed,
          items_failed,
          created_at,
          updated_at
        ) VALUES (
          NEW.id,
          'created',
          'Task created',
          0,
          0,
          0,
          0,
          NOW(),
          NOW()
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS create_task_monitoring ON tasks;
      
      CREATE TRIGGER create_task_monitoring
          AFTER INSERT ON tasks
          FOR EACH ROW
          EXECUTE FUNCTION create_task_monitoring_record();
    `);

    // Add notification_settings to user_preferences
    await client.query(`
      ALTER TABLE user_preferences
      ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{
        "task_started": true,
        "task_completed": true,
        "task_failed": true,
        "storage_warning": true,
        "error_threshold": 20,
        "notification_channels": ["app", "email"],
        "digest_enabled": false,
        "digest_frequency": "daily"
      }'::jsonb;
    `);

    // Add monitoring columns to tasks table
    await client.query(`
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS last_monitoring_check TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS alert_thresholds JSONB NOT NULL DEFAULT '{
          "errorRate": 20,
          "storageUsage": 85,
          "executionTime": 3600,
          "warningThreshold": 5,
          "criticalThreshold": 10
        }'::jsonb;
    `);

    await client.query('COMMIT');
    logger.info('Successfully created task monitoring tables and columns');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating task monitoring tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop triggers first
    await client.query(`
      DROP TRIGGER IF EXISTS update_task_monitoring_timestamp ON task_monitoring;
      DROP TRIGGER IF EXISTS create_task_monitoring ON tasks;
      DROP FUNCTION IF EXISTS update_task_monitoring_timestamp();
      DROP FUNCTION IF EXISTS create_task_monitoring_record();
    `);

    // Drop all tables
    await client.query(`
      DROP TABLE IF EXISTS task_performance_metrics CASCADE;
      DROP TABLE IF EXISTS vod_language_stats CASCADE;
      DROP TABLE IF EXISTS task_statistics CASCADE;
      DROP TABLE IF EXISTS task_monitoring CASCADE;
    `);

    // Drop enum type
    await client.query(`
      DROP TYPE IF EXISTS task_monitoring_status CASCADE;
    `);

    // Remove columns from tasks table
    await client.query(`
      ALTER TABLE tasks
        DROP COLUMN IF EXISTS last_monitoring_check,
        DROP COLUMN IF EXISTS monitoring_enabled,
        DROP COLUMN IF EXISTS alert_thresholds;
    `);

    // Remove column from user_preferences
    await client.query(`
      ALTER TABLE user_preferences
        DROP COLUMN IF EXISTS notification_settings;
    `);

    await client.query('COMMIT');
    logger.info('Successfully rolled back task monitoring tables and columns');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error rolling back task monitoring tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

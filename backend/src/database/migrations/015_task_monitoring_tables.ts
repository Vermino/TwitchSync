// Filepath: backend/src/database/migrations/015_task_monitoring_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create task_statistics table
    await client.query(`
      CREATE TABLE task_statistics (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        total_vods INTEGER NOT NULL DEFAULT 0,
        successful_downloads INTEGER NOT NULL DEFAULT 0,
        failed_downloads INTEGER NOT NULL DEFAULT 0,
        total_storage_bytes BIGINT NOT NULL DEFAULT 0,
        avg_download_speed FLOAT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Add unique constraint on task_id
    await client.query(`
      ALTER TABLE task_statistics 
      ADD CONSTRAINT task_statistics_task_id_unique 
      UNIQUE (task_id)
    `);

    // Create vod_language_stats table
    await client.query(`
      CREATE TABLE vod_language_stats (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        language VARCHAR(10) NOT NULL,
        vod_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Add unique constraint on task_id and language combination
    await client.query(`
      ALTER TABLE vod_language_stats 
      ADD CONSTRAINT vod_language_stats_task_language_unique 
      UNIQUE (task_id, language)
    `);

    // Create task_performance_metrics table
    await client.query(`
      CREATE TABLE task_performance_metrics (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        execution_time FLOAT NOT NULL DEFAULT 0,
        success_rate FLOAT NOT NULL DEFAULT 0,
        failure_rate FLOAT NOT NULL DEFAULT 0,
        avg_download_speed FLOAT NOT NULL DEFAULT 0,
        vod_count INTEGER NOT NULL DEFAULT 0,
        storage_used BIGINT NOT NULL DEFAULT 0,
        measured_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create task_alerts table
    await client.query(`
      CREATE TABLE task_alerts (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        alert_type TEXT NOT NULL CHECK (alert_type IN ('error', 'warning', 'info')),
        message TEXT NOT NULL,
        details JSONB,
        acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
        acknowledged_at TIMESTAMP,
        acknowledged_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create user_notifications table
    await client.query(`
      CREATE TABLE user_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        details JSONB,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Add notification_settings to user_preferences
    await client.query(`
      ALTER TABLE user_preferences
      ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{
        "task_started": true,
        "task_completed": true,
        "task_failed": true,
        "storage_warning": true,
        "error_threshold": 20
      }'
    `);

    // Add new columns to tasks table
    await client.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS last_monitoring_check TIMESTAMP,
      ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS alert_thresholds JSONB NOT NULL DEFAULT '{
        "errorRate": 20,
        "storageUsage": 85,
        "executionTime": 3600
      }'
    `);

    // Add new columns to vods table
    await client.query(`
      ALTER TABLE vods
      ADD COLUMN IF NOT EXISTS download_speed FLOAT,
      ADD COLUMN IF NOT EXISTS checksum TEXT,
      ADD COLUMN IF NOT EXISTS processing_metadata JSONB
    `);

    // Create indexes
    await client.query('CREATE INDEX idx_task_statistics_created_at ON task_statistics(created_at)');
    await client.query('CREATE INDEX idx_vod_language_stats_updated_at ON vod_language_stats(updated_at)');
    await client.query('CREATE INDEX idx_task_performance_metrics_task_measured ON task_performance_metrics(task_id, measured_at)');
    await client.query('CREATE INDEX idx_task_alerts_created_at ON task_alerts(created_at)');
    await client.query('CREATE INDEX idx_user_notifications_user_created ON user_notifications(user_id, created_at)');
    await client.query('CREATE INDEX idx_user_notifications_task ON user_notifications(task_id)');
    await client.query('CREATE INDEX idx_vods_download_speed ON vods(download_speed)');

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

    // Drop indexes
    await client.query('DROP INDEX IF EXISTS idx_vods_download_speed');
    await client.query('DROP INDEX IF EXISTS idx_user_notifications_task');
    await client.query('DROP INDEX IF EXISTS idx_user_notifications_user_created');
    await client.query('DROP INDEX IF EXISTS idx_task_alerts_created_at');
    await client.query('DROP INDEX IF EXISTS idx_task_performance_metrics_task_measured');
    await client.query('DROP INDEX IF EXISTS idx_vod_language_stats_updated_at');
    await client.query('DROP INDEX IF EXISTS idx_task_statistics_created_at');

    // Drop columns from vods table
    await client.query(`
      ALTER TABLE vods
      DROP COLUMN IF EXISTS download_speed,
      DROP COLUMN IF EXISTS checksum,
      DROP COLUMN IF EXISTS processing_metadata
    `);

    // Drop columns from tasks table
    await client.query(`
      ALTER TABLE tasks
      DROP COLUMN IF EXISTS last_monitoring_check,
      DROP COLUMN IF EXISTS monitoring_enabled,
      DROP COLUMN IF EXISTS alert_thresholds
    `);

    // Drop notification_settings from user_preferences
    await client.query(`
      ALTER TABLE user_preferences
      DROP COLUMN IF EXISTS notification_settings
    `);

    // Drop tables
    await client.query('DROP TABLE IF EXISTS user_notifications');
    await client.query('DROP TABLE IF EXISTS task_alerts');
    await client.query('DROP TABLE IF EXISTS task_performance_metrics');
    await client.query('DROP TABLE IF EXISTS vod_language_stats');
    await client.query('DROP TABLE IF EXISTS task_statistics');

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

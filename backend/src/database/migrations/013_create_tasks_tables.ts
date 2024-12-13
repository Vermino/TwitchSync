// backend/src/database/migrations/013_create_tasks_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('channel', 'game', 'combined')),
        channel_ids INTEGER[] DEFAULT '{}',
        game_ids INTEGER[] DEFAULT '{}',
        schedule_type VARCHAR(50) NOT NULL CHECK (schedule_type IN ('interval', 'cron', 'manual')),
        schedule_value TEXT NOT NULL,
        storage_limit_gb INTEGER,
        retention_days INTEGER,
        auto_delete BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 1,
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);
      CREATE INDEX IF NOT EXISTS idx_tasks_is_active ON tasks(is_active);
      CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run);

      CREATE TABLE IF NOT EXISTS task_history (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed', 'cancelled')),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        error_message TEXT,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_history_status ON task_history(status);
    `);

    logger.info('Successfully created tasks tables');
  } catch (error) {
    logger.error('Error creating tasks tables:', error);
    throw error;
  }
}

export async function down(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      DROP TABLE IF EXISTS task_history;
      DROP TABLE IF EXISTS tasks;
    `);

    logger.info('Successfully dropped tasks tables');
  } catch (error) {
    logger.error('Error dropping tasks tables:', error);
    throw error;
  }
}

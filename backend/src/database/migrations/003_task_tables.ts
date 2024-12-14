// backend/src/database/migrations/003_task_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Tasks table
    await client.query(`
      CREATE TABLE tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        task_type VARCHAR(50) CHECK (task_type IN ('channel', 'game', 'combined')),
        channel_ids INTEGER[] DEFAULT '{}',
        game_ids INTEGER[] DEFAULT '{}',
        schedule_type VARCHAR(50) CHECK (schedule_type IN ('interval', 'cron', 'manual')),
        schedule_value TEXT NOT NULL,
        storage_limit_gb INTEGER,
        retention_days INTEGER,
        auto_delete BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'failed')),
        priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_tasks_user_id ON tasks(user_id);
      CREATE INDEX idx_tasks_task_type ON tasks(task_type);
      CREATE INDEX idx_tasks_status ON tasks(status);
      CREATE INDEX idx_tasks_next_run ON tasks(next_run);
    `);

    // Task history table
    await client.query(`
      CREATE TABLE task_history (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        status VARCHAR(50) CHECK (status IN ('success', 'failed', 'cancelled')),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        error_message TEXT,
        metrics JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_task_history_task_id ON task_history(task_id);
      CREATE INDEX idx_task_history_status ON task_history(status);
    `);

    // Task notifications table
    await client.query(`
      CREATE TABLE task_notifications (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_task_notifications_user ON task_notifications(user_id);
      CREATE INDEX idx_task_notifications_task ON task_notifications(task_id);
    `);

    await client.query('COMMIT');
    logger.info('Task tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Task tables migration failed:', error);
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
      DROP TABLE IF EXISTS task_notifications;
      DROP TABLE IF EXISTS task_history;
      DROP TABLE IF EXISTS tasks;
    `);

    await client.query('COMMIT');
    logger.info('Task tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Task tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

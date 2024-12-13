// backend/src/database/migrations/schemas/tasks.ts

import { Pool } from 'pg';
import {CreateTaskDTO, Task} from '../../../types/database';

export const taskQueries = {
    CREATE_TABLE: `
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

        CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);
        CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(is_active);
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
    `,

    getAllTasks: async (pool: Pool): Promise<Task[]> => {
        const result = await pool.query<Task>(
            'SELECT * FROM tasks ORDER BY created_at DESC'
        );
        return result.rows;
    },

    getTaskById: async (pool: Pool, id: number): Promise<Task | null> => {
        const result = await pool.query<Task>(
            'SELECT * FROM tasks WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    createTask: async (
        pool: Pool,
        data: CreateTaskDTO
    ): Promise<Task> => {
        const result = await pool.query<Task>(
            `INSERT INTO tasks (
                name,
                description,
                task_type,
                channel_ids,
                game_ids,
                schedule_type,
                schedule_value,
                storage_limit_gb,
                retention_days,
                auto_delete,
                is_active,
                priority
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                data.name,
                data.description,
                data.task_type,
                data.channel_ids,
                data.game_ids,
                data.schedule_type,
                data.schedule_value,
                data.storage_limit_gb,
                data.retention_days,
                data.auto_delete,
                data.is_active,
                data.priority
            ]
        );
        return result.rows[0];
    },

    updateTask: async (
        pool: Pool,
        id: number,
        data: Partial<Task>
    ): Promise<Task | null> => {
        const setClause = Object.keys(data)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');

        const values = Object.values(data);
        const result = await pool.query<Task>(
            `UPDATE tasks 
            SET ${setClause} 
            WHERE id = $1 
            RETURNING *`,
            [id, ...values]
        );
        return result.rows[0] || null;
    },

    deleteTask: async (pool: Pool, id: number): Promise<boolean> => {
        const result = await pool.query(
            'DELETE FROM tasks WHERE id = $1',
            [id]
        );
        return (result.rowCount ?? 0) > 0;
    },

    addTaskHistory: async (
        pool: Pool,
        data: {
            task_id: number;
            status: 'success' | 'failed' | 'cancelled';
            start_time: Date;
            end_time?: Date;
            error_message?: string;
            details?: Record<string, unknown>;
        }
    ): Promise<void> => {
        await pool.query(
            `INSERT INTO task_history (
                task_id,
                status,
                start_time,
                end_time,
                error_message,
                details
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                data.task_id,
                data.status,
                data.start_time,
                data.end_time,
                data.error_message,
                data.details
            ]
        );
    },

    getTaskHistory: async (
        pool: Pool,
        taskId: number,
        limit: number = 10
    ): Promise<any[]> => {
        const result = await pool.query(
            `SELECT * FROM task_history 
            WHERE task_id = $1 
            ORDER BY start_time DESC 
            LIMIT $2`,
            [taskId, limit]
        );
        return result.rows;
    },

    updateNextRun: async (
        pool: Pool,
        taskId: number,
        nextRun: Date
    ): Promise<void> => {
        await pool.query(
            `UPDATE tasks 
            SET next_run = $2, 
                last_run = CURRENT_TIMESTAMP 
            WHERE id = $1`,
            [taskId, nextRun]
        );
    }
};

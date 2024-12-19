// Filepath: backend/src/services/taskMonitor.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import {
  TaskVODStats,
  TaskProgressInfo,
  TaskStorageInfo,
  TaskStatus
} from '../types/database';

interface PerformanceMetrics {
  executionTime: number;
  successRate: number;
  failureRate: number;
  avgDownloadSpeed: number;
  vodCount: number;
  storageUsed: number;
}

interface TaskAlert {
  type: 'error' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export class TaskMonitor {
  private static instance: TaskMonitor;
  private pool: Pool;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertThresholds: {
    errorRate: number;
    storageUsage: number;
    executionTime: number;
  };

  private constructor(pool: Pool) {
    this.pool = pool;
    this.alertThresholds = {
      errorRate: 20, // 20% error rate threshold
      storageUsage: 85, // 85% storage usage threshold
      executionTime: 3600 // 1 hour execution time threshold
    };
  }

  public static getInstance(pool: Pool): TaskMonitor {
    if (!TaskMonitor.instance) {
      TaskMonitor.instance = new TaskMonitor(pool);
    }
    return TaskMonitor.instance;
  }

  private async updateTaskStats(taskId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update VOD statistics
      const vodStats = await client.query(`
        WITH task_vods AS (
          SELECT v.*
          FROM vods v
          WHERE v.task_id = $1
        )
        INSERT INTO task_statistics (
          task_id,
          total_vods,
          successful_downloads,
          failed_downloads,
          total_storage_bytes,
          avg_download_speed,
          created_at,
          updated_at
        )
        SELECT
          $1 as task_id,
          COUNT(*) as total_vods,
          COUNT(CASE WHEN download_status = 'completed' THEN 1 END) as successful_downloads,
          COUNT(CASE WHEN download_status = 'failed' THEN 1 END) as failed_downloads,
          COALESCE(SUM(file_size), 0) as total_storage_bytes,
          COALESCE(AVG(download_speed), 0) as avg_download_speed,
          NOW(),
          NOW()
        FROM task_vods
        ON CONFLICT (task_id) 
        DO UPDATE SET
          total_vods = EXCLUDED.total_vods,
          successful_downloads = EXCLUDED.successful_downloads,
          failed_downloads = EXCLUDED.failed_downloads,
          total_storage_bytes = EXCLUDED.total_storage_bytes,
          avg_download_speed = EXCLUDED.avg_download_speed,
          updated_at = NOW()
      `, [taskId]);

      // Update performance metrics
      await client.query(`
        INSERT INTO task_performance_metrics (
          task_id,
          execution_time,
          success_rate,
          failure_rate,
          avg_download_speed,
          vod_count,
          storage_used,
          measured_at
        )
        SELECT
          $1 as task_id,
          EXTRACT(EPOCH FROM (NOW() - t.last_run)) as execution_time,
          CASE 
            WHEN ts.total_vods > 0 
            THEN (ts.successful_downloads::float / ts.total_vods::float) * 100 
            ELSE 0 
          END as success_rate,
          CASE 
            WHEN ts.total_vods > 0 
            THEN (ts.failed_downloads::float / ts.total_vods::float) * 100 
            ELSE 0 
          END as failure_rate,
          ts.avg_download_speed,
          ts.total_vods,
          ts.total_storage_bytes,
          NOW()
        FROM tasks t
        LEFT JOIN task_statistics ts ON t.id = ts.task_id
        WHERE t.id = $1
      `, [taskId]);

      // Update language statistics
      await client.query(`
        WITH task_vods AS (
          SELECT v.*
          FROM vods v
          WHERE v.task_id = $1
        )
        INSERT INTO vod_language_stats (
          task_id,
          language,
          vod_count,
          updated_at
        )
        SELECT
          $1 as task_id,
          language,
          COUNT(*) as vod_count,
          NOW()
        FROM task_vods
        WHERE language IS NOT NULL
        GROUP BY language
        ON CONFLICT (task_id, language) 
        DO UPDATE SET
          vod_count = EXCLUDED.vod_count,
          updated_at = NOW()
      `, [taskId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error updating task statistics for task ${taskId}:`, error);
    } finally {
      client.release();
    }
  }

  public async getPerformanceMetrics(taskId: number): Promise<PerformanceMetrics> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          execution_time,
          success_rate,
          failure_rate,
          avg_download_speed,
          vod_count,
          storage_used
        FROM task_performance_metrics
        WHERE task_id = $1
        ORDER BY measured_at DESC
        LIMIT 1
      `, [taskId]);

      return result.rows[0] || {
        executionTime: 0,
        successRate: 0,
        failureRate: 0,
        avgDownloadSpeed: 0,
        vodCount: 0,
        storageUsed: 0
      };
    } finally {
      client.release();
    }
  }

  public async getTaskPerformanceHistory(
    taskId: number,
    timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<Array<PerformanceMetrics & { timestamp: Date }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          execution_time,
          success_rate,
          failure_rate,
          avg_download_speed,
          vod_count,
          storage_used,
          measured_at as timestamp
        FROM task_performance_metrics
        WHERE task_id = $1
        AND measured_at > NOW() - interval '1 ${timeRange}'
        ORDER BY measured_at ASC
      `, [taskId]);

      return result.rows;
    } finally {
      client.release();
    }
  }

  public async checkTaskAlerts(taskId: number): Promise<TaskAlert[]> {
    const alerts: TaskAlert[] = [];
    const metrics = await this.getPerformanceMetrics(taskId);
    const client = await this.pool.connect();

    try {
      // Check error rate
      if (metrics.failureRate > this.alertThresholds.errorRate) {
        alerts.push({
          type: 'error',
          message: `High failure rate: ${metrics.failureRate.toFixed(2)}%`,
          timestamp: new Date(),
          details: {
            metric: 'failure_rate',
            value: metrics.failureRate,
            threshold: this.alertThresholds.errorRate
          }
        });
      }

      // Check storage usage
      const storageResult = await client.query(`
        SELECT 
          COALESCE(SUM(file_size), 0) as used_space,
          t.storage_limit_gb * 1024 * 1024 * 1024 as storage_limit
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        WHERE t.id = $1
        GROUP BY t.storage_limit_gb
      `, [taskId]);

      if (storageResult.rows.length > 0) {
        const { used_space, storage_limit } = storageResult.rows[0];
        const usagePercent = (used_space / storage_limit) * 100;

        if (usagePercent > this.alertThresholds.storageUsage) {
          alerts.push({
            type: 'warning',
            message: `High storage usage: ${usagePercent.toFixed(2)}%`,
            timestamp: new Date(),
            details: {
              metric: 'storage_usage',
              value: usagePercent,
              threshold: this.alertThresholds.storageUsage
            }
          });
        }
      }

      // Check execution time
      if (metrics.executionTime > this.alertThresholds.executionTime) {
        alerts.push({
          type: 'warning',
          message: `Long execution time: ${(metrics.executionTime / 60).toFixed(2)} minutes`,
          timestamp: new Date(),
          details: {
            metric: 'execution_time',
            value: metrics.executionTime,
            threshold: this.alertThresholds.executionTime
          }
        });
      }

      // Log alerts
      if (alerts.length > 0) {
        await client.query(`
          INSERT INTO task_alerts (
            task_id,
            alert_type,
            message,
            details,
            created_at
          )
          SELECT * FROM UNNEST ($1::int[], $2::text[], $3::text[], $4::jsonb[], $5::timestamp[])
        `, [
          alerts.map(() => taskId),
          alerts.map(a => a.type),
          alerts.map(a => a.message),
          alerts.map(a => JSON.stringify(a.details)),
          alerts.map(a => a.timestamp)
        ]);
      }

      return alerts;
    } finally {
      client.release();
    }
  }

  public async startMonitoring(intervalMinutes: number = 5): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        const result = await this.pool.query(
          'SELECT id FROM tasks WHERE is_active = true'
        );

        for (const task of result.rows) {
          await this.updateTaskStats(task.id);
          await this.checkTaskAlerts(task.id);
        }
      } catch (error) {
        logger.error('Error in monitoring interval:', error);
      }
    }, intervalMinutes * 60 * 1000);

    logger.info(`Task monitoring started with ${intervalMinutes} minute interval`);
  }

  public async stopMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  public async setAlertThresholds(thresholds: Partial<typeof TaskMonitor.prototype.alertThresholds>): Promise<void> {
    this.alertThresholds = {
      ...this.alertThresholds,
      ...thresholds
    };
  }

  public destroy(): void {
    this.stopMonitoring();
  }
}

export const createTaskMonitor = (pool: Pool) =>
  TaskMonitor.getInstance(pool);

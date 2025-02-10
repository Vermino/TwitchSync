// Filepath: backend/src/services/downloadManager/index.ts

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { ResourceMonitor } from './utils/resourceMonitor';
import { FileSystemManager } from './utils/fileSystem';
import { DownloadHandler } from './handlers/downloadHandler';
import { TaskHandler } from './handlers/taskHandler';
import { QueueProcessor } from './queue/queueProcessor';
import {
  DownloadManagerConfig,
  QueueStatus,
  DownloadState,
  SystemResources,
  DownloadMetrics
} from './types';

export class DownloadManager extends EventEmitter {
  private static instance: DownloadManager | null = null;
  private isShuttingDown: boolean = false;

  // Initialize properties with default values
  private resourceMonitor: ResourceMonitor = new ResourceMonitor('');
  private fileSystem: FileSystemManager = new FileSystemManager('');
  private downloadHandler: DownloadHandler = new DownloadHandler(this.pool, '', 3);
  private taskHandler: TaskHandler = new TaskHandler(this.pool, this.downloadHandler);
  private queueProcessor: QueueProcessor = new QueueProcessor(
    this.pool,
    this.downloadHandler,
    this.resourceMonitor,
    3
  );
  private metrics: DownloadMetrics = {
    totalBytesDownloaded: 0,
    totalDownloads: 0,
    failedDownloads: 0,
    averageSpeed: 0,
    peakMemoryUsage: 0,
    startTime: Date.now()
  };

  private constructor(
    private pool: Pool,
    private config: DownloadManagerConfig
  ) {
    super();
    this.initializeComponents();
    this.setupEventListeners();
    this.initializeMetrics();
  }

  public static getInstance(
    pool: Pool,
    config: DownloadManagerConfig
  ): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager(pool, config);
    }
    return DownloadManager.instance;
  }

  private initializeComponents(): void {
    // Initialize utility components
    this.resourceMonitor = new ResourceMonitor(this.config.tempDir);
    this.fileSystem = new FileSystemManager(this.config.tempDir);

    // Initialize core components
    this.downloadHandler = new DownloadHandler(
      this.pool,
      this.config.tempDir,
      this.config.maxConcurrent
    );

    this.taskHandler = new TaskHandler(
      this.pool,
      this.downloadHandler
    );

    this.queueProcessor = new QueueProcessor(
      this.pool,
      this.downloadHandler,
      this.resourceMonitor,
      this.config.maxConcurrent
    );
  }

  private setupEventListeners(): void {
    // Resource monitoring events
    this.resourceMonitor.on('warning', (warning) => {
      this.emit('resource:warning', warning);
      logger.warn('Resource warning:', warning);
    });

    this.resourceMonitor.on('critical', (critical) => {
      this.emit('resource:critical', critical);
      logger.error('Resource critical:', critical);

      if (critical.action === 'shutdown') {
        this.stopProcessing().catch(err => {
          logger.error('Error during emergency shutdown:', err);
        });
      }
    });

    // Download events
    this.downloadHandler.on('download:start', (vodId) => {
      this.emit('download:start', vodId);
    });

    this.downloadHandler.on('download:complete', (vodId) => {
      this.emit('download:complete', vodId);
      this.updateMetrics({ totalDownloads: this.metrics.totalDownloads + 1 });
    });

    this.downloadHandler.on('download:error', (error) => {
      this.emit('download:error', error);
      this.updateMetrics({ failedDownloads: this.metrics.failedDownloads + 1 });
    });

    // Task events
    this.taskHandler.on('task:progress', (progress) => {
      this.emit('task:progress', progress);
    });

    this.taskHandler.on('task:complete', (result) => {
      this.emit('task:complete', result);
    });

    this.taskHandler.on('task:error', (error) => {
      this.emit('task:error', error);
    });
  }

  private initializeMetrics(): void {
    this.metrics = {
      totalBytesDownloaded: 0,
      totalDownloads: 0,
      failedDownloads: 0,
      averageSpeed: 0,
      peakMemoryUsage: 0,
      startTime: Date.now()
    };
  }

  // Public API methods
  public async startProcessing(intervalSeconds: number = 30): Promise<void> {
    logger.info('Starting download manager...');

    await this.queueProcessor.startProcessing(intervalSeconds);
    this.resourceMonitor.startMonitoring();

    logger.info('Download manager started successfully');
  }

  public async stopProcessing(): Promise<void> {
    logger.info('Stopping download manager...');
    this.isShuttingDown = true;

    try {
      await this.queueProcessor.stopProcessing();
      this.resourceMonitor.stopMonitoring();

      logger.info('Download manager stopped successfully');
    } catch (error) {
      logger.error('Error stopping download manager:', error);
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  public async executeTask(taskId: number): Promise<void> {
    return this.taskHandler.executeTask(taskId);
  }

  public async getTaskDetails(taskId: number): Promise<any> {
    // Directly fetch task details from the database instead of delegating
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT t.*, 
               COUNT(v.id) as total_vods,
               SUM(v.file_size) as total_storage_used
        FROM tasks t
        LEFT JOIN vods v ON v.task_id = t.id
        WHERE t.id = $1
        GROUP BY t.id
      `, [taskId]);

      if (result.rows.length === 0) {
        throw new Error(`Task not found with ID ${taskId}`);
      }

      return {
        ...result.rows[0],
        progress: await this.getTaskProgress(taskId)
      };
    } finally {
      client.release();
    }
  }

  private async getTaskProgress(taskId: number): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT status, progress_percentage, items_completed, items_total
        FROM task_monitoring
        WHERE task_id = $1
      `, [taskId]);

      return result.rows[0] || {
        status: 'pending',
        progress_percentage: 0,
        items_completed: 0,
        items_total: 0
      };
    } finally {
      client.release();
    }
  }

  public async getQueueStatus(): Promise<QueueStatus> {
    return this.queueProcessor.getQueueStatus();
  }

  public async getSystemResources(): Promise<SystemResources> {
    return this.resourceMonitor.getSystemResources();
  }

  public getMetrics(): DownloadMetrics {
    return { ...this.metrics };
  }

  private updateMetrics(update: Partial<DownloadMetrics>): void {
    Object.assign(this.metrics, update);
    this.emit('metrics:update', this.metrics);
  }

  public async destroy(): Promise<void> {
    logger.info('Destroying download manager...');

    await this.stopProcessing();
    this.removeAllListeners();
    DownloadManager.instance = null;

    logger.info('Download manager destroyed');
  }
}

export default DownloadManager;

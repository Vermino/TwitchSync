// Filepath: backend/src/services/healthMonitor.ts

import { Pool } from 'pg';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { config } from '../config';
import * as os from 'os';
import { constants } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  checks: {
    database: HealthCheck;
    diskSpace: HealthCheck;
    memory: HealthCheck;
    downloadManager: HealthCheck;
    taskQueue: HealthCheck;
  };
  uptime: number;
  timestamp: Date;
  version: string;
}

export interface HealthCheck {
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: any;
  lastChecked: Date;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  network: {
    interfaces: any;
  };
  processes: {
    activeDownloads: number;
    queuedTasks: number;
    runningTasks: number;
  };
}

export class HealthMonitorService extends EventEmitter {
  private pool: Pool;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastHealth: HealthStatus | null = null;
  private metrics: SystemMetrics;

  // Thresholds for health checks
  private thresholds = {
    diskSpace: {
      warning: 10 * 1024 * 1024 * 1024, // 10GB
      critical: 5 * 1024 * 1024 * 1024   // 5GB
    },
    memory: {
      warning: 80, // 80%
      critical: 90  // 90%
    },
    dbConnection: {
      timeout: 5000 // 5 seconds
    }
  };

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): SystemMetrics {
    return {
      cpu: { usage: 0, cores: os.cpus().length },
      memory: { total: 0, free: 0, used: 0, usagePercent: 0 },
      disk: { total: 0, free: 0, used: 0, usagePercent: 0 },
      network: { interfaces: os.networkInterfaces() },
      processes: { activeDownloads: 0, queuedTasks: 0, runningTasks: 0 }
    };
  }

  /**
   * Start continuous health monitoring
   */
  public async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.isRunning) {
      logger.warn('Health monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting health monitor with ${intervalMs}ms interval`);

    // Run initial health check
    await this.performHealthCheck();

    // Schedule regular health checks
    this.checkInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, intervalMs);

    this.emit('monitoring:started');
  }

  /**
   * Stop health monitoring
   */
  public stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
    logger.info('Health monitor stopped');
    this.emit('monitoring:stopped');
  }

  /**
   * Perform comprehensive health check
   */
  public async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      // Update system metrics first
      await this.updateSystemMetrics();

      // Perform all health checks in parallel
      const [
        databaseCheck,
        diskSpaceCheck,
        memoryCheck,
        downloadManagerCheck,
        taskQueueCheck
      ] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkDiskSpace(),
        this.checkMemory(),
        this.checkDownloadManager(),
        this.checkTaskQueue()
      ]);

      // Build health status
      this.lastHealth = {
        status: 'healthy',
        checks: {
          database: this.getCheckResult(databaseCheck),
          diskSpace: this.getCheckResult(diskSpaceCheck),
          memory: this.getCheckResult(memoryCheck),
          downloadManager: this.getCheckResult(downloadManagerCheck),
          taskQueue: this.getCheckResult(taskQueueCheck)
        },
        uptime: process.uptime(),
        timestamp: new Date(),
        version: process.env.npm_package_version || '1.0.0'
      };

      // Determine overall status
      this.lastHealth.status = this.calculateOverallStatus(this.lastHealth.checks);

      // Emit status change events
      this.emitStatusEvents(this.lastHealth);

      const checkDuration = Date.now() - startTime;
      logger.debug(`Health check completed in ${checkDuration}ms`);

      return this.lastHealth;
    } catch (error) {
      logger.error('Health check error:', error);

      this.lastHealth = {
        status: 'critical',
        checks: {
          database: { status: 'critical', message: 'Health check failed', lastChecked: new Date() },
          diskSpace: { status: 'critical', message: 'Health check failed', lastChecked: new Date() },
          memory: { status: 'critical', message: 'Health check failed', lastChecked: new Date() },
          downloadManager: { status: 'critical', message: 'Health check failed', lastChecked: new Date() },
          taskQueue: { status: 'critical', message: 'Health check failed', lastChecked: new Date() }
        },
        uptime: process.uptime(),
        timestamp: new Date(),
        version: process.env.npm_package_version || '1.0.0'
      };

      return this.lastHealth;
    }
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      const client = await this.pool.connect();

      try {
        // Test basic connectivity
        await client.query('SELECT 1');

        // Check connection pool status
        const poolStats = {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        };

        const responseTime = Date.now() - startTime;

        if (responseTime > this.thresholds.dbConnection.timeout) {
          return {
            status: 'warning',
            message: `Database response slow: ${responseTime}ms`,
            details: { responseTime, poolStats },
            lastChecked: new Date()
          };
        }

        if (this.pool.idleCount === 0 && this.pool.waitingCount > 0) {
          return {
            status: 'warning',
            message: 'Database connection pool under pressure',
            details: poolStats,
            lastChecked: new Date()
          };
        }

        return {
          status: 'healthy',
          message: `Database responsive (${responseTime}ms)`,
          details: { responseTime, poolStats },
          lastChecked: new Date()
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        status: 'critical',
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check available disk space
   */
  private async checkDiskSpace(): Promise<HealthCheck> {
    try {
      // Use statvfs for better cross-platform compatibility
      let freeBytes: number, totalBytes: number;

      try {
        if (fs.statfs) {
          const stats = await fs.statfs(config.storage.storagePath) as any;
          freeBytes = (stats.bavail || 0) * (stats.bsize || 1);
          totalBytes = (stats.blocks || 0) * (stats.bsize || 1);
        } else {
          throw new Error('statfs not available');
        }
      } catch {
        // Fallback approach
        const fallback = await this.getFallbackDiskSpace(config.storage.storagePath);
        freeBytes = fallback.free;
        totalBytes = fallback.total;
      }

      const usedBytes = totalBytes - freeBytes;
      const usagePercent = (usedBytes / totalBytes) * 100;

      const details = {
        total: totalBytes,
        free: freeBytes,
        used: usedBytes,
        usagePercent: Math.round(usagePercent * 100) / 100
      };

      if (freeBytes < this.thresholds.diskSpace.critical) {
        return {
          status: 'critical',
          message: `Critical: Only ${Math.round(freeBytes / (1024 * 1024 * 1024) * 100) / 100}GB free`,
          details,
          lastChecked: new Date()
        };
      }

      if (freeBytes < this.thresholds.diskSpace.warning) {
        return {
          status: 'warning',
          message: `Low disk space: ${Math.round(freeBytes / (1024 * 1024 * 1024) * 100) / 100}GB free`,
          details,
          lastChecked: new Date()
        };
      }

      return {
        status: 'healthy',
        message: `Sufficient disk space: ${Math.round(freeBytes / (1024 * 1024 * 1024) * 100) / 100}GB free`,
        details,
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        status: 'critical',
        message: `Cannot check disk space: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheck> {
    const memoryUsage = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem()
    };

    const processMemoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
    const systemUsagePercent = ((systemMemory.total - systemMemory.free) / systemMemory.total) * 100;

    const details = {
      process: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      },
      system: systemMemory,
      systemUsagePercent: Math.round(systemUsagePercent * 100) / 100
    };

    if (systemUsagePercent > this.thresholds.memory.critical) {
      return {
        status: 'critical',
        message: `Critical memory usage: ${Math.round(systemUsagePercent)}%`,
        details,
        lastChecked: new Date()
      };
    }

    if (systemUsagePercent > this.thresholds.memory.warning) {
      return {
        status: 'warning',
        message: `High memory usage: ${Math.round(systemUsagePercent)}%`,
        details,
        lastChecked: new Date()
      };
    }

    return {
      status: 'healthy',
      message: `Memory usage normal: ${Math.round(systemUsagePercent)}% system, ${processMemoryMB}MB process`,
      details,
      lastChecked: new Date()
    };
  }

  /**
   * Check download manager health
   */
  private async checkDownloadManager(): Promise<HealthCheck> {
    try {
      const client = await this.pool.connect();

      try {
        // Check active downloads
        const activeResult = await client.query(`
          SELECT COUNT(*) as count
          FROM vods
          WHERE download_status = 'downloading'
        `);

        // Check queued downloads
        const queuedResult = await client.query(`
          SELECT COUNT(*) as count
          FROM vods
          WHERE download_status = 'queued'
        `);

        // Check failed downloads in last hour
        const failedResult = await client.query(`
          SELECT COUNT(*) as count
          FROM vods
          WHERE download_status = 'failed'
          AND updated_at > NOW() - INTERVAL '1 hour'
        `);

        const activeCount = parseInt(activeResult.rows[0].count);
        const queuedCount = parseInt(queuedResult.rows[0].count);
        const recentFailures = parseInt(failedResult.rows[0].count);

        const details = {
          activeDownloads: activeCount,
          queuedDownloads: queuedCount,
          recentFailures
        };

        if (recentFailures > 10) {
          return {
            status: 'critical',
            message: `High failure rate: ${recentFailures} failures in last hour`,
            details,
            lastChecked: new Date()
          };
        }

        if (recentFailures > 5) {
          return {
            status: 'warning',
            message: `Elevated failures: ${recentFailures} failures in last hour`,
            details,
            lastChecked: new Date()
          };
        }

        return {
          status: 'healthy',
          message: `Download manager healthy: ${activeCount} active, ${queuedCount} queued`,
          details,
          lastChecked: new Date()
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        status: 'critical',
        message: `Cannot check download manager: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Check task queue health
   */
  private async checkTaskQueue(): Promise<HealthCheck> {
    try {
      const client = await this.pool.connect();

      try {
        // Check running tasks
        const runningResult = await client.query(`
          SELECT COUNT(*) as count
          FROM tasks
          WHERE status = 'running'
        `);

        // Check stuck tasks
        const stuckResult = await client.query(`
          SELECT COUNT(*) as count
          FROM tasks
          WHERE status = 'running'
          AND updated_at < NOW() - INTERVAL '1 hour'
        `);

        // Check failed tasks in last hour
        const failedResult = await client.query(`
          SELECT COUNT(*) as count
          FROM tasks
          WHERE status = 'failed'
          AND updated_at > NOW() - INTERVAL '1 hour'
        `);

        const runningCount = parseInt(runningResult.rows[0].count);
        const stuckCount = parseInt(stuckResult.rows[0].count);
        const recentFailures = parseInt(failedResult.rows[0].count);

        const details = {
          runningTasks: runningCount,
          stuckTasks: stuckCount,
          recentFailures
        };

        if (stuckCount > 0) {
          return {
            status: 'critical',
            message: `${stuckCount} stuck tasks detected`,
            details,
            lastChecked: new Date()
          };
        }

        if (recentFailures > 3) {
          return {
            status: 'warning',
            message: `${recentFailures} task failures in last hour`,
            details,
            lastChecked: new Date()
          };
        }

        return {
          status: 'healthy',
          message: `Task queue healthy: ${runningCount} running tasks`,
          details,
          lastChecked: new Date()
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        status: 'critical',
        message: `Cannot check task queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Update system metrics
   */
  private async updateSystemMetrics(): Promise<void> {
    // Memory metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    this.metrics.memory = {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usagePercent: (usedMem / totalMem) * 100
    };

    // CPU metrics (simplified - would need monitoring over time for accurate usage)
    this.metrics.cpu = {
      usage: os.loadavg()[0], // 1-minute load average as proxy for CPU usage
      cores: os.cpus().length
    };

    // Disk metrics
    try {
      let totalBytes: number, freeBytes: number;

      try {
        if (fs.statfs) {
          const stats = await fs.statfs(config.storage.storagePath) as any;
          totalBytes = (stats.blocks || 0) * (stats.bsize || 1);
          freeBytes = (stats.bavail || 0) * (stats.bsize || 1);
        } else {
          throw new Error('statfs not available');
        }
      } catch {
        const fallback = await this.getFallbackDiskSpace(config.storage.storagePath);
        totalBytes = fallback.total;
        freeBytes = fallback.free;
      }

      this.metrics.disk = {
        total: totalBytes,
        free: freeBytes,
        used: totalBytes - freeBytes,
        usagePercent: ((totalBytes - freeBytes) / totalBytes) * 100
      };
    } catch (error) {
      logger.debug('Could not get disk metrics:', error);
    }
  }

  /**
   * Get the result of a settled promise
   */
  private getCheckResult(settledResult: PromiseSettledResult<HealthCheck>): HealthCheck {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    } else {
      return {
        status: 'critical',
        message: `Health check failed: ${settledResult.reason}`,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Calculate overall system status
   */
  private calculateOverallStatus(checks: HealthStatus['checks']): 'healthy' | 'warning' | 'critical' {
    const statuses = Object.values(checks).map(check => check.status);

    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    return 'healthy';
  }

  /**
   * Emit status change events
   */
  private emitStatusEvents(health: HealthStatus): void {
    this.emit('health:update', health);

    // Emit specific events for status changes
    if (health.status === 'critical') {
      this.emit('health:critical', health);
    } else if (health.status === 'warning') {
      this.emit('health:warning', health);
    } else {
      this.emit('health:healthy', health);
    }
  }

  /**
   * Get current health status
   */
  public getCurrentHealth(): HealthStatus | null {
    return this.lastHealth || null;
  }

  /**
   * Get current system metrics
   */
  public getSystemMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  /**
   * Fallback disk space calculation using wmic on Windows
   */
  private async getFallbackDiskSpace(checkPath: string): Promise<{ total: number; free: number }> {
    try {
      if (process.platform === 'win32') {
        const driveLetter = path.resolve(checkPath).split(':')[0] + ':';
        const { stdout } = await execAsync(
          `wmic logicaldisk where "DeviceID='${driveLetter}'" get Size,FreeSpace /Format:csv`
        );
        const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));
        if (lines.length > 0) {
          const parts = lines[0].trim().split(',');
          if (parts.length >= 3) {
            const free = parseInt(parts[1], 10);
            const total = parseInt(parts[2], 10);
            if (!isNaN(total) && !isNaN(free)) {
              return { total, free };
            }
          }
        }
      }
      logger.warn('Could not determine real disk space via fallback');
      return { total: 0, free: 0 };
    } catch (error) {
      logger.debug('Fallback disk space check failed:', error);
      return { total: 0, free: 0 };
    }
  }
}

export const createHealthMonitorService = (pool: Pool) =>
  new HealthMonitorService(pool);
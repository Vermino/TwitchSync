// Filepath: backend/src/services/reliabilityManager.ts

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { config } from '../config';

import { StartupRecoveryService } from './startupRecovery';
import { HealthMonitorService } from './healthMonitor';
import { CleanupService } from './cleanupService';
import { ErrorRecoveryService } from './errorRecovery';
import { ChannelPersistenceService } from './channelPersistenceService';
import DownloadManager from './downloadManager';

export interface ReliabilityConfig {
  healthMonitoring: {
    enabled: boolean;
    intervalMs: number;
  };
  cleanup: {
    enabled: boolean;
    intervalMs: number;
    tempFileMaxAge: number;
    logFileMaxAge: number;
    emergencyCleanup: boolean;
    diskSpaceThresholdGB: number;
  };
  recovery: {
    performStartupRecovery: boolean;
    retryConfigs: {
      maxRetries: number;
      baseDelayMs: number;
    };
  };
}

/**
 * Centralized reliability manager that coordinates all reliability services
 */
export class ReliabilityManager extends EventEmitter {
  private static instance: ReliabilityManager | null = null;
  private pool: Pool;
  private config: ReliabilityConfig;
  private downloadManager: DownloadManager;

  // Service instances
  private startupRecovery!: StartupRecoveryService;
  private healthMonitor!: HealthMonitorService;
  private cleanupService!: CleanupService;
  private errorRecovery!: ErrorRecoveryService;
  private channelPersistence!: ChannelPersistenceService;

  private isInitialized: boolean = false;
  private isRunning: boolean = false;

  private constructor(
    pool: Pool, 
    downloadManager: DownloadManager,
    reliabilityConfig?: Partial<ReliabilityConfig>
  ) {
    super();
    this.pool = pool;
    this.downloadManager = downloadManager;

    // Default configuration
    this.config = {
      healthMonitoring: {
        enabled: true,
        intervalMs: 30000 // 30 seconds
      },
      cleanup: {
        enabled: true,
        intervalMs: 60 * 60 * 1000, // 1 hour
        tempFileMaxAge: 24 * 60 * 60 * 1000, // 24 hours
        logFileMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        emergencyCleanup: true,
        diskSpaceThresholdGB: 5
      },
      recovery: {
        performStartupRecovery: true,
        retryConfigs: {
          maxRetries: 3,
          baseDelayMs: 1000
        }
      },
      ...reliabilityConfig
    };

    this.initializeServices();
  }

  public static getInstance(
    pool: Pool,
    downloadManager: DownloadManager,
    config?: Partial<ReliabilityConfig>
  ): ReliabilityManager {
    if (!ReliabilityManager.instance) {
      ReliabilityManager.instance = new ReliabilityManager(pool, downloadManager, config);
    }
    return ReliabilityManager.instance;
  }

  /**
   * Initialize all reliability services
   */
  private initializeServices(): void {
    logger.info('Initializing reliability services...');

    // Initialize startup recovery
    this.startupRecovery = new StartupRecoveryService(
      this.pool,
      config.storage.tempPath
    );

    // Initialize health monitor
    this.healthMonitor = new HealthMonitorService(this.pool);

    // Initialize cleanup service
    this.cleanupService = new CleanupService(this.pool, {
      tempFileMaxAge: this.config.cleanup.tempFileMaxAge,
      logFileMaxAge: this.config.cleanup.logFileMaxAge,
      emergencyCleanupEnabled: this.config.cleanup.emergencyCleanup,
      diskSpaceThresholdGB: this.config.cleanup.diskSpaceThresholdGB,
      regularCleanupInterval: this.config.cleanup.intervalMs
    });

    // Initialize error recovery
    this.errorRecovery = new ErrorRecoveryService(this.pool);

    // Initialize channel persistence service
    this.channelPersistence = new ChannelPersistenceService(this.pool);

    // Set up cross-service event handling
    this.setupEventHandlers();

    this.isInitialized = true;
    logger.info('Reliability services initialized successfully');
  }

  /**
   * Set up event handlers between services
   */
  private setupEventHandlers(): void {
    // Health monitor events
    this.healthMonitor.on('health:critical', (health) => {
      logger.error('System health critical:', health);
      this.emit('system:critical', health);
      
      // Trigger emergency cleanup if disk space is critical
      if (health.checks.diskSpace.status === 'critical') {
        this.triggerEmergencyCleanup();
      }
    });

    this.healthMonitor.on('health:warning', (health) => {
      logger.warn('System health warning:', health);
      this.emit('system:warning', health);
    });

    // Cleanup service events
    this.cleanupService.on('cleanup:emergency', (data) => {
      logger.warn('Emergency cleanup triggered:', data);
      this.emit('cleanup:emergency', data);
    });

    this.cleanupService.on('cleanup:completed', (stats) => {
      logger.info('Cleanup completed:', {
        tempFiles: `${stats.tempFiles.deleted}/${stats.tempFiles.scanned}`,
        spaceFreed: `${Math.round((stats.tempFiles.spaceFreed + stats.logFiles.spaceFreed) / 1024 / 1024)}MB`
      });
    });

    // Channel persistence events
    this.channelPersistence.on('channel:loss_detected', (data) => {
      logger.error('CRITICAL: Channel loss detected!', data);
      this.emit('channel:loss_detected', data);
    });

    this.channelPersistence.on('recovery:completed', (stats) => {
      logger.info('Channel recovery completed:', stats);
      this.emit('channel:recovery_completed', stats);
    });

    this.channelPersistence.on('backup:completed', (data) => {
      logger.debug('Channel backup completed:', data);
    });

    // Error recovery events
    this.errorRecovery.on('circuit:opened', (data) => {
      logger.warn('Circuit breaker opened:', data);
      this.emit('circuit:opened', data);
      
      // Enable graceful degradation
      this.errorRecovery.enableGracefulDegradation(data.operationId);
    });

    this.errorRecovery.on('circuit:reset', (data) => {
      logger.info('Circuit breaker reset:', data);
      this.emit('circuit:reset', data);
      
      // Disable graceful degradation
      this.errorRecovery.disableGracefulDegradation(data.operationId);
    });

    // Download manager integration
    this.downloadManager.on('download:error', (error) => {
      this.errorRecovery.recordErrorPattern('download_manager', error);
    });

    this.downloadManager.on('resource:critical', (critical) => {
      logger.error('Download manager resource critical:', critical);
      if (critical.action === 'cleanup') {
        this.triggerEmergencyCleanup();
      }
    });
  }

  /**
   * Start all reliability services
   */
  public async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Reliability manager not initialized');
    }

    if (this.isRunning) {
      logger.warn('Reliability manager is already running');
      return;
    }

    logger.info('Starting reliability manager...');

    try {
      // Perform startup recovery if enabled
      if (this.config.recovery.performStartupRecovery) {
        logger.info('Performing startup recovery...');
        await this.startupRecovery.performStartupRecovery();
        logger.info('Startup recovery completed');
      }

      // Start health monitoring
      if (this.config.healthMonitoring.enabled) {
        await this.healthMonitor.startMonitoring(this.config.healthMonitoring.intervalMs);
        logger.info('Health monitoring started');
      }

      // Start cleanup service
      if (this.config.cleanup.enabled) {
        await this.cleanupService.startCleanupService();
        logger.info('Cleanup service started');
      }

      // Start channel persistence service
      await this.channelPersistence.start();
      logger.info('Channel persistence service started');

      this.isRunning = true;
      logger.info('Reliability manager started successfully');
      this.emit('reliability:started');
    } catch (error) {
      logger.error('Failed to start reliability manager:', error);
      throw error;
    }
  }

  /**
   * Stop all reliability services
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Reliability manager is not running');
      return;
    }

    logger.info('Stopping reliability manager...');

    try {
      // Stop health monitoring
      if (this.healthMonitor) {
        this.healthMonitor.stopMonitoring();
      }

      // Stop cleanup service
      if (this.cleanupService) {
        this.cleanupService.stopCleanupService();
      }

      // Stop channel persistence service
      if (this.channelPersistence) {
        this.channelPersistence.stop();
      }

      this.isRunning = false;
      logger.info('Reliability manager stopped');
      this.emit('reliability:stopped');
    } catch (error) {
      logger.error('Error stopping reliability manager:', error);
      throw error;
    }
  }

  /**
   * Get current system health status
   */
  public async getSystemHealth(): Promise<any> {
    return this.healthMonitor.performHealthCheck();
  }

  /**
   * Get system metrics
   */
  public getSystemMetrics(): any {
    return this.healthMonitor.getSystemMetrics();
  }

  /**
   * Trigger emergency cleanup
   */
  public async triggerEmergencyCleanup(): Promise<void> {
    logger.warn('Triggering emergency cleanup...');
    try {
      await this.cleanupService.forceCleanup();
    } catch (error) {
      logger.error('Emergency cleanup failed:', error);
    }
  }

  /**
   * Execute operation with error recovery
   */
  public async executeWithRecovery<T>(
    operation: () => Promise<T>,
    operationId: string,
    customRetryConfig?: any
  ): Promise<T> {
    return this.errorRecovery.executeWithRetry(operation, operationId, customRetryConfig);
  }

  /**
   * Execute operation with graceful degradation
   */
  public async executeWithGracefulDegradation<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    serviceName: string,
    operationId: string
  ): Promise<T> {
    return this.errorRecovery.executeWithGracefulDegradation(
      operation,
      fallback,
      serviceName,
      operationId
    );
  }

  /**
   * Get reliability statistics
   */
  public async getReliabilityStats(): Promise<{
    health: any;
    cleanup: any;
    errors: any;
    channelPersistence: any;
    isRunning: boolean;
    uptime: number;
  }> {
    return {
      health: this.healthMonitor.getCurrentHealth(),
      cleanup: this.cleanupService.getLastCleanupStats(),
      errors: this.errorRecovery.getErrorStats(),
      channelPersistence: await this.channelPersistence.getStats(),
      isRunning: this.isRunning,
      uptime: process.uptime()
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<ReliabilityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Reliability manager configuration updated');
    this.emit('config:updated', this.config);
  }

  /**
   * Force recovery process
   */
  public async forceRecovery(): Promise<void> {
    logger.info('Manual recovery process triggered');
    await this.startupRecovery.performStartupRecovery();
    this.emit('recovery:forced');
  }

  /**
   * Force channel backup
   */
  public async forceChannelBackup(): Promise<void> {
    logger.info('Manual channel backup triggered');
    await this.channelPersistence.triggerBackup();
    this.emit('channel:backup_forced');
  }

  /**
   * Force channel recovery
   */
  public async forceChannelRecovery(): Promise<{ recovered: number; failed: number }> {
    logger.info('Manual channel recovery triggered');
    const result = await this.channelPersistence.triggerRecovery();
    this.emit('channel:recovery_forced', result);
    return result;
  }

  /**
   * Get current configuration
   */
  public getConfig(): ReliabilityConfig {
    return { ...this.config };
  }

  /**
   * Check if services are healthy
   */
  public async isSystemHealthy(): Promise<boolean> {
    try {
      const health = await this.getSystemHealth();
      return health.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  /**
   * Destroy reliability manager and clean up resources
   */
  public async destroy(): Promise<void> {
    logger.info('Destroying reliability manager...');

    await this.stop();
    this.removeAllListeners();
    ReliabilityManager.instance = null;

    logger.info('Reliability manager destroyed');
  }
}

export const createReliabilityManager = (
  pool: Pool,
  downloadManager: DownloadManager,
  config?: Partial<ReliabilityConfig>
) => ReliabilityManager.getInstance(pool, downloadManager, config);
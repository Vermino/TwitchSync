// Filepath: backend/src/routes/health/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { HealthMonitorService } from '../../services/healthMonitor';
import { CleanupService } from '../../services/cleanupService';
import { ErrorRecoveryService } from '../../services/errorRecovery';
import { StartupRecoveryService } from '../../services/startupRecovery';

export const createHealthRoutes = (pool: Pool): Router => {
  const router = Router();
  
  // Initialize services
  const healthMonitor = new HealthMonitorService(pool);
  const cleanupService = new CleanupService(pool);
  const errorRecovery = new ErrorRecoveryService(pool);
  const startupRecovery = new StartupRecoveryService(pool);

  /**
   * GET /api/health - Basic health check
   */
  router.get('/', async (req, res) => {
    try {
      const health = await healthMonitor.performHealthCheck();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'warning' ? 200 : 503;
      
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'critical',
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /api/health/detailed - Comprehensive health and system status
   */
  router.get('/detailed', async (req, res) => {
    try {
      const [health, metrics, errorStats, cleanupStats] = await Promise.allSettled([
        healthMonitor.performHealthCheck(),
        healthMonitor.getSystemMetrics(),
        errorRecovery.getErrorStats(),
        cleanupService.getLastCleanupStats()
      ]);

      const response = {
        health: health.status === 'fulfilled' ? health.value : null,
        metrics: metrics.status === 'fulfilled' ? metrics.value : null,
        errorRecovery: errorStats.status === 'fulfilled' ? errorStats.value : null,
        lastCleanup: cleanupStats.status === 'fulfilled' ? cleanupStats.value : null,
        timestamp: new Date()
      };

      const statusCode = response.health?.status === 'healthy' ? 200 : 
                        response.health?.status === 'warning' ? 200 : 503;
      
      res.status(statusCode).json(response);
    } catch (error) {
      logger.error('Detailed health check failed:', error);
      res.status(503).json({
        status: 'critical',
        message: 'Detailed health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /api/health/status - Simple status endpoint for load balancers
   */
  router.get('/status', async (req, res) => {
    try {
      // Quick database connectivity check
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        res.status(200).json({ 
          status: 'healthy',
          timestamp: new Date().toISOString()
        });
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Status check failed:', error);
      res.status(503).json({ 
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/health/metrics - System metrics endpoint
   */
  router.get('/metrics', async (req, res) => {
    try {
      const metrics = healthMonitor.getSystemMetrics();
      res.json({
        metrics,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Metrics endpoint failed:', error);
      res.status(500).json({
        error: 'Failed to retrieve metrics',
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /api/health/database - Database-specific health check
   */
  router.get('/database', async (req, res) => {
    const client = await pool.connect();
    
    try {
      const startTime = Date.now();
      
      // Test basic connectivity
      await client.query('SELECT 1');
      
      // Test table accessibility
      const tableCheck = await client.query(`
        SELECT COUNT(*) as table_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      
      // Check active connections
      const connectionCheck = await client.query(`
        SELECT COUNT(*) as active_connections
        FROM pg_stat_activity
        WHERE state = 'active'
      `);
      
      const responseTime = Date.now() - startTime;
      
      res.json({
        status: 'healthy',
        database: {
          responseTime,
          tables: parseInt(tableCheck.rows[0].table_count),
          activeConnections: parseInt(connectionCheck.rows[0].active_connections),
          poolStats: {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
          }
        },
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Database health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/health/downloads - Download system health
   */
  router.get('/downloads', async (req, res) => {
    const client = await pool.connect();
    
    try {
      // Get download statistics
      const downloadStats = await client.query(`
        SELECT 
          download_status,
          COUNT(*) as count
        FROM vods
        WHERE updated_at > NOW() - INTERVAL '24 hours'
        GROUP BY download_status
      `);

      // Get recent failures
      const recentFailures = await client.query(`
        SELECT 
          error_message,
          COUNT(*) as count
        FROM vods
        WHERE download_status = 'failed'
        AND updated_at > NOW() - INTERVAL '1 hour'
        GROUP BY error_message
        ORDER BY count DESC
        LIMIT 5
      `);

      // Get queue status
      const queueStatus = await client.query(`
        SELECT COUNT(*) as queued_count
        FROM vods
        WHERE download_status = 'queued'
      `);

      const stats = downloadStats.rows.reduce((acc, row) => {
        acc[row.download_status] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);

      res.json({
        status: stats.failed > 10 ? 'warning' : 'healthy',
        downloads: {
          stats,
          queuedCount: parseInt(queueStatus.rows[0].queued_count),
          recentFailures: recentFailures.rows
        },
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Download health check failed:', error);
      res.status(500).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/health/cleanup - Trigger manual cleanup
   */
  router.post('/cleanup', async (req, res) => {
    try {
      logger.info('Manual cleanup triggered via API');
      const stats = await cleanupService.forceCleanup();
      
      res.json({
        message: 'Cleanup completed successfully',
        stats,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Manual cleanup failed:', error);
      res.status(500).json({
        error: 'Cleanup failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /api/health/recovery - Trigger manual recovery
   */
  router.post('/recovery', async (req, res) => {
    try {
      logger.info('Manual recovery triggered via API');
      await startupRecovery.performStartupRecovery();
      
      res.json({
        message: 'Recovery completed successfully',
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Manual recovery failed:', error);
      res.status(500).json({
        error: 'Recovery failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /api/health/errors - Error recovery statistics
   */
  router.get('/errors', async (req, res) => {
    try {
      const errorStats = errorRecovery.getErrorStats();
      res.json({
        errorRecovery: errorStats,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error stats retrieval failed:', error);
      res.status(500).json({
        error: 'Failed to retrieve error statistics',
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /api/health/errors/clear - Clear error recovery history
   */
  router.post('/errors/clear', async (req, res) => {
    try {
      errorRecovery.clearErrorHistory();
      res.json({
        message: 'Error recovery history cleared',
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Clear error history failed:', error);
      res.status(500).json({
        error: 'Failed to clear error history',
        timestamp: new Date()
      });
    }
  });

  return router;
};
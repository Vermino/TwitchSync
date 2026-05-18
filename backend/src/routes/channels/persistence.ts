// Filepath: backend/src/routes/channels/persistence.ts

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { ChannelPersistenceService } from '../../services/channelPersistenceService';

export function createChannelPersistenceRoutes(pool: Pool): Router {
  const router = Router();
  const persistenceService = new ChannelPersistenceService(pool);

  /**
   * GET /api/channels/persistence/stats - Get channel persistence statistics
   */
  router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await persistenceService.getStats();
      
      res.json({
        success: true,
        data: {
          ...stats,
          status: 'active',
          lastCheck: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error getting channel persistence stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get persistence statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/channels/persistence/backup - Trigger manual channel backup
   */
  router.post('/backup', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await persistenceService.triggerBackup();
      
      logger.info('Manual channel backup completed via API');
      
      res.json({
        success: true,
        message: 'Channel backup completed successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Manual channel backup failed:', error);
      res.status(500).json({
        success: false,
        error: 'Channel backup failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/channels/persistence/recover - Trigger manual channel recovery
   */
  router.post('/recover', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await persistenceService.triggerRecovery();
      
      logger.info(`Manual channel recovery completed via API: ${result.recovered} recovered, ${result.failed} failed`);
      
      res.json({
        success: true,
        message: 'Channel recovery completed',
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Manual channel recovery failed:', error);
      res.status(500).json({
        success: false,
        error: 'Channel recovery failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/channels/persistence/health - Get channel persistence health status
   */
  router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await persistenceService.getStats();
      
      // Determine health status
      const isHealthy = stats.activeChannels > 0 && 
                       stats.backedUpChannels >= stats.activeChannels &&
                       stats.lastBackup &&
                       (Date.now() - new Date(stats.lastBackup).getTime()) < 2 * 60 * 60 * 1000; // Less than 2 hours ago
      
      res.json({
        success: true,
        data: {
          status: isHealthy ? 'healthy' : 'warning',
          activeChannels: stats.activeChannels,
          backedUpChannels: stats.backedUpChannels,
          lastBackup: stats.lastBackup,
          backupAge: stats.lastBackup ? 
            Math.floor((Date.now() - new Date(stats.lastBackup).getTime()) / 1000 / 60) : null, // minutes
          issues: !isHealthy ? [
            ...(stats.activeChannels === 0 ? ['No active channels found'] : []),
            ...(stats.backedUpChannels < stats.activeChannels ? ['Some channels not backed up'] : []),
            ...(!stats.lastBackup ? ['No backup found'] : []),
            ...(stats.lastBackup && (Date.now() - new Date(stats.lastBackup).getTime()) > 2 * 60 * 60 * 1000 ? 
                ['Backup is older than 2 hours'] : [])
          ] : []
        }
      });
    } catch (error) {
      logger.error('Error getting channel persistence health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get persistence health',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

export default createChannelPersistenceRoutes;
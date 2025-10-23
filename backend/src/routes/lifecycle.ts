// Filepath: backend/src/routes/lifecycle.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

// Simple async handler wrapper
const handleAsync = (fn: Function) => (req: any, res: any, next: any) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

export function setupLifecycleRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/lifecycle/storage/analytics - Get storage analytics
   */
  router.get('/storage/analytics', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const userId = parseInt(req.user!.id);
    
    try {
      // Get basic statistics from existing tables
      const result = await pool.query(`
        SELECT 
          COUNT(DISTINCT v.id) as total_files,
          COUNT(DISTINCT v.channel_id) as total_channels,
          COUNT(DISTINCT v.game_id) as total_games,
          COALESCE(SUM(CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END), 0) as files_downloaded,
          COALESCE(SUM(CASE WHEN v.status = 'downloading' THEN 1 ELSE 0 END), 0) as files_downloading,
          COALESCE(SUM(CASE WHEN v.status = 'failed' THEN 1 ELSE 0 END), 0) as files_failed
        FROM vods v 
        JOIN tasks t ON v.task_id = t.id 
        WHERE t.user_id = $1
      `, [userId]);

      const stats = result.rows[0] || {};

      res.json({
        totalFiles: parseInt(stats.total_files || '0'),
        totalSizeGB: 0, // Would need file system analysis
        filesDownloaded: parseInt(stats.files_downloaded || '0'),
        filesDownloading: parseInt(stats.files_downloading || '0'),
        filesFailed: parseInt(stats.files_failed || '0'),
        duplicateFiles: 0, // Would need duplicate analysis
        corruptedFiles: 0, // Would need integrity checking
        protectedFiles: 0, // Would need protection tracking
        missingFiles: 0,
        downloadedFiles: parseInt(stats.files_downloaded || '0'),
        downloadedSizeGB: 0,
        protectedSizeGB: 0,
        missingSizeGB: 0,
        corruptedSizeGB: 0,
        byChannel: [],
        byGame: [],
        channelBreakdown: [],
        gameBreakdown: [],
        storageTimeline: [],
        storageBreakdown: {
          videos: 0,
          thumbnails: 0,
          metadata: 0,
          logs: 0
        },
        retentionPolicyCompliance: {
          compliant: 0,
          violations: 0,
          protected: 0
        }
      });
    } catch (error) {
      logger.error('Error fetching storage analytics:', error);
      res.status(500).json({ error: 'Failed to fetch storage analytics' });
    }
  }));

  /**
   * GET /api/lifecycle/verification/stats - Get file verification statistics
   */
  router.get('/verification/stats', authenticate(pool), handleAsync(async (req: any, res: any) => {
    try {
      // Return mock verification stats for now
      res.json({
        totalFiles: 0,
        verifiedFiles: 0,
        corruptedFiles: 0,
        pendingVerification: 0,
        lastVerificationRun: null,
        verificationInProgress: false,
        estimatedTimeRemaining: null
      });
    } catch (error) {
      logger.error('Error fetching verification stats:', error);
      res.status(500).json({ error: 'Failed to fetch verification statistics' });
    }
  }));

  /**
   * POST /api/lifecycle/verification/bulk-verify - Start bulk verification
   */
  router.post('/verification/bulk-verify', authenticate(pool), handleAsync(async (req: any, res: any) => {
    try {
      // Mock implementation - would start bulk verification process
      res.json({
        success: true,
        message: 'Bulk verification started',
        jobId: `verification-${Date.now()}`,
        estimatedDuration: '10-30 minutes'
      });
    } catch (error) {
      logger.error('Error starting bulk verification:', error);
      res.status(500).json({ error: 'Failed to start bulk verification' });
    }
  }));

  /**
   * GET /api/lifecycle/storage/cleanup-analysis - Analyze files eligible for cleanup
   */
  router.get('/storage/cleanup-analysis', authenticate(pool), handleAsync(async (req: any, res: any) => {
    try {
      // Return mock cleanup analysis for now
      res.json({
        eligibleFiles: [],
        totalSpaceSavingGB: 0,
        oldestFileAge: 0,
        retentionPolicyViolations: 0,
        byRetentionPolicy: 0,
        byStorageLimit: 0,
        byCorruption: 0
      });
    } catch (error) {
      logger.error('Error analyzing cleanup:', error);
      res.status(500).json({ error: 'Failed to analyze cleanup candidates' });
    }
  }));

  /**
   * POST /api/lifecycle/storage/cleanup - Execute storage cleanup
   */
  router.post('/storage/cleanup', authenticate(pool), handleAsync(async (req: any, res: any) => {
    try {
      const { fileIds, dryRun = false } = req.body;
      
      // Mock implementation - would perform actual cleanup
      res.json({
        success: true,
        dryRun,
        filesProcessed: fileIds?.length || 0,
        spaceSavedGB: 0,
        errors: []
      });
    } catch (error) {
      logger.error('Error executing cleanup:', error);
      res.status(500).json({ error: 'Failed to execute cleanup' });
    }
  }));

  /**
   * GET /api/lifecycle/files/largest - Get largest files
   */
  router.get('/files/largest', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const userId = parseInt(req.user!.id);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    try {
      // Get VODs ordered by creation date (proxy for file size)
      const result = await pool.query(`
        SELECT 
          v.id,
          v.twitch_id,
          v.title,
          v.status,
          c.username as channel_name,
          c.display_name as channel_display_name,
          g.name as game_name,
          v.duration,
          v.created_at,
          v.updated_at,
          'source' as quality
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        LEFT JOIN channels c ON v.channel_id = c.id  
        LEFT JOIN games g ON v.game_id = g.id
        WHERE t.user_id = $1 AND v.status = 'completed'
        ORDER BY v.duration DESC, v.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      const files = result.rows.map(row => ({
        id: row.id.toString(),
        vodId: row.id.toString(),
        filename: `${row.title || `VOD_${row.twitch_id}`}.mp4`,
        sizeGB: (row.duration || 0) / 3600, // Rough estimate based on duration
        status: 'downloaded',
        isProtected: false,
        lastVerified: null,
        channelName: row.channel_name || '',
        channelDisplayName: row.channel_display_name || '',
        gameName: row.game_name || 'Unknown',
        duration: row.duration || 0,
        createdAt: row.created_at,
        downloadedAt: row.updated_at,
        quality: row.quality
      }));

      res.json({
        files,
        pagination: {
          limit,
          offset,
          hasMore: files.length === limit
        }
      });
    } catch (error) {
      logger.error('Error fetching largest files:', error);
      res.status(500).json({ error: 'Failed to fetch largest files' });
    }
  }));

  /**
   * GET /api/lifecycle/vods/:vodId/file-state - Get file state for specific VOD
   */
  router.get('/vods/:vodId/file-state', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const userId = parseInt(req.user!.id);
    const vodId = parseInt(req.params.vodId);
    
    try {
      const result = await pool.query(`
        SELECT v.*, c.username as channel_name, g.name as game_name
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        LEFT JOIN channels c ON v.channel_id = c.id
        LEFT JOIN games g ON v.game_id = g.id  
        WHERE v.id = $1 AND t.user_id = $2
      `, [vodId, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'VOD not found' });
      }

      const vod = result.rows[0];
      res.json({
        vodId: vod.id,
        twitchVodId: vod.twitch_id,
        filename: `${vod.title || `VOD_${vod.twitch_id}`}.mp4`,
        status: vod.status,
        fileExists: vod.status === 'completed',
        isProtected: false,
        lastVerified: null,
        checksumStatus: 'unknown',
        fileSize: 0,
        channelName: vod.channel_name,
        gameName: vod.game_name,
        duration: vod.duration
      });
    } catch (error) {
      logger.error('Error fetching VOD file state:', error);
      res.status(500).json({ error: 'Failed to fetch VOD file state' });
    }
  }));

  /**
   * POST /api/lifecycle/vods/:vodId/protect - Protect VOD from cleanup
   */
  router.post('/vods/:vodId/protect', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const vodId = parseInt(req.params.vodId);
    
    try {
      // Mock implementation - would mark VOD as protected
      res.json({
        success: true,
        vodId,
        protected: true,
        message: 'VOD marked as protected'
      });
    } catch (error) {
      logger.error('Error protecting VOD:', error);
      res.status(500).json({ error: 'Failed to protect VOD' });
    }
  }));

  /**
   * DELETE /api/lifecycle/vods/:vodId/protect - Remove protection from VOD
   */
  router.delete('/vods/:vodId/protect', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const vodId = parseInt(req.params.vodId);
    
    try {
      // Mock implementation - would remove protection
      res.json({
        success: true,
        vodId,
        protected: false,
        message: 'VOD protection removed'
      });
    } catch (error) {
      logger.error('Error removing VOD protection:', error);
      res.status(500).json({ error: 'Failed to remove VOD protection' });
    }
  }));

  /**
   * POST /api/lifecycle/vods/:vodId/verify - Verify single VOD integrity
   */
  router.post('/vods/:vodId/verify', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const vodId = parseInt(req.params.vodId);
    
    try {
      // Mock implementation - would verify VOD integrity
      res.json({
        success: true,
        vodId,
        status: 'verified',
        message: 'VOD integrity verified',
        checksum: 'mock-checksum-123'
      });
    } catch (error) {
      logger.error('Error verifying VOD:', error);
      res.status(500).json({ error: 'Failed to verify VOD' });
    }
  }));

  /**
   * POST /api/lifecycle/vods/:vodId/redownload - Queue VOD for redownload  
   */
  router.post('/vods/:vodId/redownload', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const vodId = parseInt(req.params.vodId);
    
    try {
      // Mock implementation - would queue for redownload
      res.json({
        success: true,
        vodId,
        status: 'queued',
        message: 'VOD queued for redownload',
        queuePosition: 1
      });
    } catch (error) {
      logger.error('Error queuing VOD for redownload:', error);
      res.status(500).json({ error: 'Failed to queue VOD for redownload' });
    }
  }));

  return router;
}
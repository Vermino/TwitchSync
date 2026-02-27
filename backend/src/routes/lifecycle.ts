// Filepath: backend/src/routes/lifecycle.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { VODLifecycleManager } from '../services/vodLifecycleManager';

// Simple async handler wrapper
const handleAsync = (fn: Function) => (req: any, res: any, next: any) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

export function setupLifecycleRoutes(pool: Pool): Router {
  const router = Router();
  const lifecycleManager = new VODLifecycleManager(pool);

  /**
   * GET /api/lifecycle/storage/analytics - Get storage analytics
   */
  router.get('/storage/analytics', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const userId = parseInt(req.user!.id);

    try {
      const analytics = await lifecycleManager.generateStorageAnalytics(userId);
      res.json(analytics);
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
    const userId = parseInt(req.user!.id);

    try {
      const analysis = await lifecycleManager.analyzeCleanupCandidates(userId);
      res.json(analysis);
    } catch (error) {
      logger.error('Error analyzing cleanup:', error);
      res.status(500).json({ error: 'Failed to analyze cleanup candidates' });
    }
  }));

  /**
   * POST /api/lifecycle/storage/cleanup - Execute storage cleanup
   */
  router.post('/storage/cleanup', authenticate(pool), handleAsync(async (req: any, res: any) => {
    const userId = parseInt(req.user!.id);

    try {
      const { fileIds, dryRun = false } = req.body;

      const result = await lifecycleManager.executeCleanup(userId, fileIds, dryRun);
      res.json(result);
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
      // Get VODs ordered by actual file size
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
          v.preferred_quality as quality,
          v.thumbnail_url,
          vfs.file_size_bytes,
          vfs.is_user_protected,
          fvh.created_at as last_verified_at
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        LEFT JOIN channels c ON v.channel_id = c.id  
        LEFT JOIN games g ON v.game_id = g.id
        LEFT JOIN vod_file_states vfs ON v.id = vfs.vod_id
        LEFT JOIN file_verification_history fvh ON vfs.id = fvh.file_state_id
        WHERE t.user_id = $1 AND v.download_status = 'completed' AND vfs.file_state = 'present'
        ORDER BY CAST(COALESCE(vfs.file_size_bytes, '0') AS BIGINT) DESC, v.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]);

      const files = result.rows.map(row => ({
        id: row.id.toString(),
        vodId: row.id.toString(),
        filename: `${row.title || `VOD_${row.twitch_id}`}.mp4`,
        sizeGB: parseInt(row.file_size_bytes || '0') / (1024 * 1024 * 1024),
        status: 'downloaded',
        isProtected: row.is_user_protected || false,
        lastVerified: row.last_verified_at || row.created_at || null,
        channelName: row.channel_name || '',
        channelDisplayName: row.channel_display_name || '',
        gameName: row.game_name || 'Unknown',
        duration: row.duration || 0,
        createdAt: row.created_at,
        downloadedAt: row.updated_at,
        quality: row.quality,
        thumbnailUrl: row.thumbnail_url
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
        SELECT 
          v.*, 
          c.username as channel_name, 
          g.name as game_name,
          vfs.file_size_bytes,
          vfs.is_protected,
          vfs.checksum_md5,
          fvh.last_verified_at,
          fvh.status as verification_status
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        LEFT JOIN channels c ON v.channel_id = c.id
        LEFT JOIN games g ON v.game_id = g.id  
        LEFT JOIN vod_file_states vfs ON v.id = vfs.vod_id
        LEFT JOIN file_verification_history fvh ON v.id = fvh.vod_id
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
        isProtected: vod.is_protected || false,
        lastVerified: vod.last_verified_at || null,
        checksumStatus: vod.verification_status || 'unknown',
        fileSize: parseInt(vod.file_size_bytes || '0'),
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
      await pool.query(`
        INSERT INTO vod_file_states (vod_id, is_protected, file_state)
        VALUES ($1, true, 'missing')
        ON CONFLICT (vod_id) 
        DO UPDATE SET is_protected = true, updated_at = NOW()
      `, [vodId]);

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
      await pool.query(`
        UPDATE vod_file_states 
        SET is_protected = false, updated_at = NOW() 
        WHERE vod_id = $1
      `, [vodId]);

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
      const result = await lifecycleManager.verifyVodFile(vodId, true);

      res.json({
        success: true,
        vodId,
        status: result.status,
        message: result.status === 'verified' ? 'VOD integrity verified' : (result.error || 'Verification failed'),
        checksum: result.checksum
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
      await pool.query(`
        UPDATE vods 
        SET status = 'downloading', retry_count = 0, updated_at = NOW() 
        WHERE id = $1
      `, [vodId]);

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
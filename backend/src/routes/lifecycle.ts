// Filepath: backend/src/routes/lifecycle.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { VODLifecycleManager } from '../services/vodLifecycleManager';
import FileVerificationService from '../services/fileVerificationService';

// Simple async handler wrapper
const handleAsync = (fn: Function) => (req: any, res: any, next: any) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

export function setupLifecycleRoutes(pool: Pool): Router {
  const router = Router();
  const lifecycleManager = new VODLifecycleManager(pool);
  const verificationService = new FileVerificationService(pool);
  const dayMs = 24 * 60 * 60 * 1000;

  const getUserOwnedVod = async (vodId: number, userId: number) => {
    const result = await pool.query(`
      SELECT v.id, v.task_id, v.twitch_id, v.download_status
      FROM vods v
      JOIN tasks t ON v.task_id = t.id
      WHERE v.id = $1 AND t.user_id = $2
    `, [vodId, userId]);

    return result.rows[0] || null;
  };

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
      const userId = parseInt(req.user!.id);
      const stateResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE vfs.file_state != 'deleted')::INTEGER as total_files,
          COUNT(*) FILTER (WHERE vfs.verification_status = 'verified' AND vfs.file_state != 'deleted')::INTEGER as verified_files,
          COUNT(*) FILTER (WHERE vfs.file_state = 'corrupted')::INTEGER as corrupted_files,
          COUNT(*) FILTER (
            WHERE vfs.file_state != 'deleted'
              AND (vfs.verification_status = 'pending' OR vfs.last_verified_at IS NULL)
          )::INTEGER as pending_files,
          MAX(vfs.last_verified_at) as last_verification_date
        FROM vod_file_states vfs
        JOIN vods v ON vfs.vod_id = v.id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1
      `, [userId]);

      const row = stateResult.rows[0] || {};
      const totalFiles = Number(row.total_files) || 0;
      const verifiedFiles = Number(row.verified_files) || 0;
      const corruptedFiles = Number(row.corrupted_files) || 0;
      const pendingFiles = Number(row.pending_files) || 0;
      const isRunning = verificationService.isVerificationRunning();

      res.json({
        totalFiles,
        verifiedFiles,
        corruptedFiles,
        pendingFiles,
        lastVerificationDate: row.last_verification_date ? new Date(row.last_verification_date).toISOString() : null,
        verificationProgress: totalFiles > 0 ? Number(((verifiedFiles / totalFiles) * 100).toFixed(1)) : 0,
        estimatedTimeRemaining: isRunning ? pendingFiles * 5 : 0,
        isRunning,
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
      const userId = parseInt(req.user!.id);

      if (verificationService.isVerificationRunning()) {
        return res.status(409).json({ error: 'File verification is already running' });
      }

      void verificationService.bulkVerifyUserFiles(userId).catch((error) => {
        logger.error(`Background verification failed for user ${userId}:`, error);
      });

      res.status(202).json({
        success: true,
        message: 'Bulk verification started',
        jobId: `verification-${Date.now()}`,
        estimatedDuration: 'Background task started'
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
      res.json({
        ...analysis,
        oldestFileAge: analysis.oldestFileAge
          ? Math.max(0, Math.floor((Date.now() - new Date(analysis.oldestFileAge).getTime()) / dayMs))
          : 0,
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
    const userId = parseInt(req.user!.id);

    try {
      const dryRun = Boolean(req.body?.dryRun);
      const requestedFileIds = Array.isArray(req.body?.fileIds)
        ? req.body.fileIds.map((value: unknown) => parseInt(String(value), 10)).filter((value: number) => !Number.isNaN(value))
        : [];

      const analysis = await lifecycleManager.analyzeCleanupCandidates(userId);
      const fileIds = requestedFileIds.length > 0
        ? requestedFileIds
        : analysis.eligibleFiles
            .map((file: any) => parseInt(String(file.vodId), 10))
            .filter((value: number) => !Number.isNaN(value));

      const result = await lifecycleManager.executeCleanup(userId, fileIds, dryRun);
      res.json({
        success: result.success,
        dryRun: result.dryRun,
        deletedFiles: result.filesProcessed,
        spaceSavedGB: result.spaceSavedGB,
        errors: result.errors.map((error: { vodId: number; error: string }) => `VOD ${error.vodId}: ${error.error}`),
        summary: {
          byRetentionPolicy: analysis.byRetentionPolicy,
          byStorageLimit: analysis.byStorageLimit,
          byCorruption: analysis.byCorruption,
        },
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
    const { promises: fsPromises } = await import('fs');

    try {
      // Get VODs ordered by actual file size, including file_path for verification
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
          vfs.file_path,
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

      // Verify each file actually exists on disk — mark missing ones in DB
      const missingIds: number[] = [];
      const verifiedRows = await Promise.all(result.rows.map(async (row) => {
        if (!row.file_path) return null; // no path recorded, skip
        try {
          await fsPromises.access(row.file_path);
          return row; // file exists
        } catch {
          missingIds.push(row.id);
          return null; // file doesn't exist
        }
      }));

      // Update missing files in DB so they don't show again
      if (missingIds.length > 0) {
        await pool.query(`
          UPDATE vod_file_states SET file_state = 'missing', updated_at = NOW()
          WHERE vod_id = ANY($1::int[])
        `, [missingIds]);
        logger.info(`Marked ${missingIds.length} VOD file(s) as missing after filesystem check`);
      }

      const files = verifiedRows
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .map(row => ({
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
          vfs.file_state,
          vfs.file_path,
          vfs.is_user_protected,
          vfs.checksum_md5,
          vfs.last_verified_at,
          vfs.verification_status
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        LEFT JOIN channels c ON v.channel_id = c.id
        LEFT JOIN games g ON v.game_id = g.id  
        LEFT JOIN vod_file_states vfs ON v.id = vfs.vod_id
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
        status: vod.download_status,
        fileExists: ['present', 'archived'].includes(vod.file_state),
        isProtected: vod.is_user_protected || false,
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
    const userId = parseInt(req.user!.id);
    const vodId = parseInt(req.params.vodId);

    try {
      const vod = await getUserOwnedVod(vodId, userId);
      if (!vod) {
        return res.status(404).json({ error: 'VOD not found' });
      }

      await pool.query(`
        INSERT INTO vod_file_states (vod_id, task_id, twitch_vod_id, is_user_protected, file_state)
        VALUES (
          $1,
          $2,
          $3,
          true,
          CASE WHEN $4 = 'completed' THEN 'present'::file_state ELSE 'not_downloaded'::file_state END
        )
        ON CONFLICT (vod_id) 
        DO UPDATE SET is_user_protected = true, updated_at = NOW()
      `, [vodId, vod.task_id, vod.twitch_id, vod.download_status]);

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
    const userId = parseInt(req.user!.id);
    const vodId = parseInt(req.params.vodId);

    try {
      const vod = await getUserOwnedVod(vodId, userId);
      if (!vod) {
        return res.status(404).json({ error: 'VOD not found' });
      }

      await pool.query(`
        UPDATE vod_file_states 
        SET is_user_protected = false, updated_at = NOW()
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
    const userId = parseInt(req.user!.id);
    const vodId = parseInt(req.params.vodId);

    try {
      const vod = await getUserOwnedVod(vodId, userId);
      if (!vod) {
        return res.status(404).json({ error: 'VOD not found' });
      }

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
    const userId = parseInt(req.user!.id);
    const vodId = parseInt(req.params.vodId);

    try {
      const ownershipResult = await pool.query(`
        SELECT v.id, v.task_id, v.twitch_id
        FROM vods v
        JOIN tasks t ON v.task_id = t.id
        WHERE v.id = $1 AND t.user_id = $2
      `, [vodId, userId]);

      if (ownershipResult.rows.length === 0) {
        return res.status(404).json({ error: 'VOD not found' });
      }

      const vod = ownershipResult.rows[0];

      await pool.query(`
        DELETE FROM completed_vods
        WHERE vod_id = $1 AND task_id = $2
      `, [vodId, vod.task_id]);

      await pool.query(`
        UPDATE vods 
        SET status = 'queued',
            download_status = 'queued',
            retry_count = 0,
            error_message = NULL,
            download_progress = 0,
            download_speed = NULL,
            downloaded_size = NULL,
            estimated_size = NULL,
            file_size = NULL,
            download_path = NULL,
            checksum = NULL,
            current_segment = NULL,
            total_segments = NULL,
            eta_seconds = NULL,
            resume_segment_index = 0,
            pause_reason = NULL,
            paused_at = NULL,
            started_at = NULL,
            downloaded_at = NULL,
            processed_at = NULL,
            updated_at = NOW()
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

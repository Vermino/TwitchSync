// Filepath: backend/src/services/downloadManager/handlers/downloadHandler.ts

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import axios from 'axios';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { logger } from '../../../utils/logger';
import { FileSystemManager } from '../utils/fileSystem';
import { BandwidthThrottler } from '../utils/throttle';
import { Checksums } from '../utils/checksums';
import { TwitchService } from '../../twitch/service';
import { CompletedVodService } from '../../completedVodService';
import { WebSocketService } from '../../websocketService';
import {
  DownloadState,
  SegmentInfo,
  SegmentedPlaylist,
  VideoQuality,
  PlaylistQuality,
  VodPlaylist
} from '../types';
import * as crypto from 'crypto';

const MAX_VODS = 50;  // Increased to allow more VODs in queue
const MAX_CONCURRENT_DOWNLOADS = 3;  // Allow 3 concurrent downloads

export class DownloadHandler extends EventEmitter {
  private activeDownloads: Map<number, DownloadState>;
  private fileSystem: FileSystemManager;
  private twitchService: TwitchService;
  private completedVodService: CompletedVodService;
  private webSocketService: WebSocketService;

  constructor(
    private pool: Pool,
    private tempDir: string,
    private maxConcurrent: number = 3
  ) {
    super();
    this.activeDownloads = new Map();
    this.fileSystem = new FileSystemManager(tempDir);
    this.twitchService = TwitchService.getInstance();
    this.completedVodService = new CompletedVodService(pool);
    this.webSocketService = WebSocketService.getInstance();
  }

  public getActiveDownloads(): Map<number, DownloadState> {
    return this.activeDownloads;
  }

  private createDownloadState(vodId: number, totalSegments: number): DownloadState {
    return {
      vodId,
      progress: {
        vodId,
        segmentIndex: 0,
        totalSegments,
        bytesDownloaded: 0,
        totalBytes: 0,
        speed: 0,
        eta: 0,
        status: 'downloading'
      },
      activeSegments: new Set(),
      completedSegments: new Set(),
      failedSegments: new Set(),
      checksums: new Map(),
      resumePosition: 0,
      throttle: {
        enabled: false,
        bytesPerSecond: 0,
        lastCheck: Date.now(),
        bytesSinceLastCheck: 0
      },
      resources: {
        startMemory: process.memoryUsage().heapUsed,
        peakMemory: process.memoryUsage().heapUsed,
        startTime: Date.now(),
        diskUsage: 0
      }
    };
  }

  async downloadSegmentsInParallel(
    vodId: number,
    segments: SegmentInfo[],
    tempDir: string,
    maxConcurrent: number = this.maxConcurrent,
    throttleSpeed?: number
  ): Promise<void> {
    const state = this.activeDownloads.get(vodId);
    if (!state) throw new Error(`No download state found for VOD ${vodId}`);

    // Check for existing segments and database resume position
    const existingSegments = new Set<number>();
    let resumeSegmentIndex = 0;

    // Check database for resume position
    try {
      const client = await this.pool.connect();
      try {
        const resumeResult = await client.query(`
          SELECT resume_segment_index, download_status
          FROM vods 
          WHERE id = $1
        `, [vodId]);

        if (resumeResult.rows.length > 0) {
          resumeSegmentIndex = resumeResult.rows[0].resume_segment_index || 0;
          const downloadStatus = resumeResult.rows[0].download_status;

          if (resumeSegmentIndex > 0) {
            logger.info(`VOD ${vodId}: Database indicates resume from segment ${resumeSegmentIndex} (status: ${downloadStatus})`);
          }
        }
      } finally {
        client.release();
      }
    } catch (err) {
      logger.warn(`Error checking database resume position for VOD ${vodId}:`, err);
    }

    // Check for existing segment files on disk
    try {
      const files = await fs.readdir(tempDir);
      files.forEach(file => {
        const match = file.match(/^segment-(\d+)\.ts$/);
        if (match) {
          const segmentIndex = parseInt(match[1]);
          existingSegments.add(segmentIndex);
          state.completedSegments.add(segmentIndex);
        }
      });

      // Use the higher value between database resume position and existing files
      const fileBasedResume = existingSegments.size > 0 ? Math.max(...Array.from(existingSegments)) + 1 : 0;
      const actualResumePosition = Math.max(resumeSegmentIndex, fileBasedResume);

      if (actualResumePosition > 0) {
        logger.info(`VOD ${vodId}: Resuming from segment ${actualResumePosition} (DB: ${resumeSegmentIndex}, Files: ${fileBasedResume})`);

        // Mark all segments before resume position as completed
        for (let i = 0; i < actualResumePosition; i++) {
          existingSegments.add(i);
          state.completedSegments.add(i);
        }

        // Update download state
        state.resumePosition = actualResumePosition;
        state.progress.segmentIndex = actualResumePosition;

        // Update progress immediately to reflect existing segments
        await this.updateDownloadProgress(vodId, segments.length);
      }
    } catch (err) {
      logger.debug(`No existing segments found for VOD ${vodId}`);
    }

    const queue = segments.filter(s => !existingSegments.has(s.index));
    const inProgress = new Set<Promise<void>>();

    while (queue.length > 0 || inProgress.size > 0) {
      while (queue.length > 0 && inProgress.size < maxConcurrent) {
        const segment = queue.shift();
        if (!segment) continue;

        const outputPath = path.join(tempDir, `segment-${segment.index}.ts`);
        const downloadPromise = this.downloadSegment(vodId, segment, outputPath, throttleSpeed)
          .then(() => {
            inProgress.delete(downloadPromise);
            // Update progress after each segment completes (don't await to avoid blocking)
            this.updateDownloadProgress(vodId, segments.length).catch(err => {
              logger.error(`Error updating progress for VOD ${vodId}:`, err);
            });
          })
          .catch((error) => {
            logger.error(`Error downloading segment ${segment.index}:`, error);
            inProgress.delete(downloadPromise);
            if (state.failedSegments.size < 3) { // Allow 3 retries
              queue.push(segment);
            }
          });

        inProgress.add(downloadPromise);
      }

      if (inProgress.size > 0) {
        await Promise.race(Array.from(inProgress));
      }
    }
  }

  async downloadSegment(
    vodId: number,
    segment: SegmentInfo,
    outputPath: string,
    throttleSpeed?: number
  ): Promise<void> {
    const state = this.activeDownloads.get(vodId);
    if (!state) throw new Error(`No download state found for VOD ${vodId}`);

    state.activeSegments.add(segment.index);

    try {
      const response = await axios({
        method: 'GET',
        url: segment.url,
        responseType: 'stream',
        headers: { 'Range': `bytes=${state.resumePosition}-` }
      });

      const writer = fsSync.createWriteStream(outputPath, { flags: 'a' });
      let downloadedBytes = 0;
      const startTime = Date.now();

      const progressStream = new Transform({
        transform(chunk: Buffer, encoding: BufferEncoding, callback) {
          downloadedBytes += chunk.length;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = downloadedBytes / elapsed;

          if (state) {
            state.progress.bytesDownloaded += chunk.length;
            state.progress.speed = speed;
            state.progress.eta = (state.progress.totalBytes - state.progress.bytesDownloaded) / speed;
          }

          callback(null, chunk);
        }
      });

      let downloadStream: NodeJS.ReadableStream = response.data;
      downloadStream = downloadStream.pipe(progressStream);

      if (throttleSpeed) {
        downloadStream = BandwidthThrottler.applyThrottling(downloadStream, throttleSpeed);
      }

      await pipeline(downloadStream, writer);

      const checksum = await Checksums.calculateMD5(outputPath);
      if (segment.checksum && checksum !== segment.checksum) {
        throw new Error(`Checksum mismatch for segment ${segment.index}`);
      }

      state.checksums.set(segment.index, checksum);
      state.completedSegments.add(segment.index);
      state.activeSegments.delete(segment.index);

    } catch (error) {
      state.failedSegments.add(segment.index);
      state.activeSegments.delete(segment.index);
      throw error;
    }
  }

  async processVOD(vod: any): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Check if VOD is already completed before starting download
      const isCompleted = await this.completedVodService.isVodCompleted(vod.twitch_id, vod.task_id);
      if (isCompleted) {
        logger.info(`Skipping VOD ${vod.twitch_id} - already completed for task ${vod.task_id}`);
        // Ensure the tracking table reflects this so it doesn't loop in queued state forever
        await client.query(`
          UPDATE vods 
          SET download_status = 'completed', updated_at = NOW(), download_progress = 100
          WHERE id = $1
        `, [vod.id]);
        return;
      }
      // Get download path from user settings with new fields
      const settingsResult = await client.query(`
        SELECT 
          us.settings->'downloads'->>'downloadPath' as download_path,
          us.settings->'downloads'->>'tempStorageLocation' as temp_path,
          (us.settings->'downloads'->>'concurrentDownloadLimit')::int as concurrent_limit,
          (us.settings->'downloads'->>'bandwidthThrottle')::int as bandwidth_limit,
          us.settings as user_settings
        FROM user_settings us
        INNER JOIN tasks t ON t.user_id = us.user_id
        WHERE t.id = $1
      `, [vod.task_id]);

      const settings = settingsResult.rows[0];
      const downloadPath = settings?.download_path || 'C:\\Users\\jesse\\TwitchSync\\Downloads';
      const tempPath = settings?.temp_path || this.tempDir;
      const bandwidthLimit = settings?.bandwidth_limit || 0;
      const concurrentLimit = settings?.concurrent_limit || 3;
      const userSettings = settings?.user_settings || {};

      // Ensure download directory exists
      await fs.mkdir(downloadPath, { recursive: true });

      // Check current active downloads
      const activeDownloads = await client.query(`
        SELECT COUNT(*) as count
        FROM vods
        WHERE download_status = 'downloading'
      `);

      if (activeDownloads.rows[0].count >= MAX_CONCURRENT_DOWNLOADS) {
        logger.info(`Another download is in progress. Queuing VOD ${vod.id}`);
        await client.query(`
          UPDATE vods
          SET download_status = 'queued',
              updated_at      = NOW()
          WHERE id = $1
        `, [vod.id]);
        return;
      }

      // Check active VOD count before proceeding (only count actually downloading VODs)
      const totalActiveVods = await client.query(`
        SELECT COUNT(*) as count
        FROM vods
        WHERE download_status = 'downloading'
      `);

      if (totalActiveVods.rows[0].count >= MAX_VODS) {
        logger.warn(`Maximum VOD limit (${MAX_VODS}) reached. Skipping VOD ${vod.id}`);
        await client.query(`
          UPDATE vods
          SET download_status = 'pending',
              error_message   = 'Maximum concurrent VOD limit reached',
              updated_at      = NOW()
          WHERE id = $1
        `, [vod.id]);
        return;
      }

      await client.query(`
        UPDATE vods
        SET download_status   = 'downloading',
            started_at        = NOW(),
            updated_at        = NOW(),
            download_progress = 0
        WHERE id = $1
      `, [vod.id]);

      // Emit WebSocket update for status change
      this.webSocketService.emitDownloadStatusChange(vod.id, vod.task_id, 'downloading', 0);

      // Update task progress
      await client.query(`
        UPDATE task_monitoring
        SET status              = 'running',
            status_message      = 'Starting download',
            progress_percentage = 0,
            items_total         = 1,
            items_completed     = 0,
            updated_at          = NOW()
        WHERE task_id = $1
      `, [vod.task_id]);

      const workingDir = await this.fileSystem.createTempDirectory(vod.twitch_id);
      const state = this.createDownloadState(vod.id, 0);
      this.activeDownloads.set(vod.id, state);

      try {
        // Add retries for VOD info fetch with proper validation
        let vodInfo = null;
        let attempts = 0;
        const maxAttempts = 3;
        let lastError: Error | null = null;

        while (attempts < maxAttempts) {
          try {
            vodInfo = await this.twitchService.getVODInfo(vod.twitch_id);

            // Validate VOD info
            if (vodInfo && vodInfo.id && vodInfo.user_id) {
              break;
            }

            // If VOD info is invalid, treat as an error
            throw new Error('Invalid VOD info received');
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            logger.warn(`Attempt ${attempts + 1} to fetch VOD info failed:`, error);

            // Check if VOD is permanently unavailable
            if (error instanceof Error && error.message.includes('404')) {
              throw new Error('VOD no longer available');
            }

            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
          }
          attempts++;
        }

        if (!vodInfo) {
          throw new Error(lastError?.message || `Failed to get VOD info after ${maxAttempts} attempts`);
        }

        // Add similar error handling for playlist fetch
        attempts = 0;
        lastError = null;
        let playlist = null;

        while (attempts < maxAttempts) {
          try {
            playlist = await this.getVODPlaylist(vod.twitch_id, vod.preferred_quality || 'source');
            if (playlist && playlist.segments && playlist.segments.length > 0) {
              break;
            }
            throw new Error('Invalid playlist data received');
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            logger.warn(`Attempt ${attempts + 1} to fetch playlist failed:`, error);
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
          }
          attempts++;
        }

        if (!playlist) {
          throw new Error(lastError?.message || `Failed to get playlist after ${maxAttempts} attempts`);
        }

        // Process segments
        await this.downloadSegmentsInParallel(
          vod.id,
          playlist.segments,
          workingDir,
          MAX_CONCURRENT_DOWNLOADS,
          bandwidthLimit
        );

        // Combine segments into final video file
        logger.info(`Combining ${playlist.segments.length} segments for VOD ${vod.id}`);
        const downloadStartTime = new Date(state.resources.startTime);
        const finalVideoPath = await this.combineSegments(vod, workingDir, downloadPath, playlist.segments.length);

        // Calculate download metrics for completion tracking
        const downloadEndTime = new Date();
        const downloadDurationSeconds = Math.round(
          (downloadEndTime.getTime() - downloadStartTime.getTime()) / 1000
        );

        // Get file stats
        const fileStats = await fs.stat(finalVideoPath);
        const fileSizeBytes = fileStats.size;
        const fileName = require('path').basename(finalVideoPath);

        // Calculate download speed in Mbps
        const downloadSpeedMbps = downloadDurationSeconds > 0
          ? Number(((fileSizeBytes * 8) / (downloadDurationSeconds * 1000000)).toFixed(2))
          : null;

        // Calculate MD5 checksum for integrity verification
        const checksum = await this.calculateMD5(finalVideoPath);

        // Update VOD status to completed with file path
        await client.query(`
          UPDATE vods
          SET download_status   = 'completed',
              downloaded_at     = NOW(),
              updated_at        = NOW(),
              download_progress = 100,
              download_path     = $2,
              file_size         = $3,
              checksum          = $4
          WHERE id = $1
        `, [vod.id, finalVideoPath, fileSizeBytes, checksum]);

        // Emit WebSocket update for completion
        this.webSocketService.emitDownloadStatusChange(vod.id, vod.task_id, 'completed', 100);

        // Use safe upsert function to mark VOD as completed (handles concurrency)
        await client.query(`
          SELECT upsert_completed_vod($1::integer, $2::integer, $3::bigint, $4::text, $5::text, $6::bigint, $7::integer, $8::numeric, $9::text, $10::jsonb)
        `, [
          vod.id,
          vod.task_id,
          vod.twitch_id,
          finalVideoPath,
          fileName,
          fileSizeBytes,
          downloadDurationSeconds,
          downloadSpeedMbps ?? null,
          checksum,
          JSON.stringify({
            quality: vod.preferred_quality || 'source',
            format: 'ts',
            duration: vod.duration,
            title: vod.title,
            channel_name: vod.channel_name || 'unknown',
            completed_timestamp: downloadEndTime.toISOString()
          })
        ]);

        await client.query(`
          SELECT safe_release_vod_lock($1::bigint, $2::integer, $3::text, $4::text, $5::text, $6::text, $7::bigint)
        `, [
          vod.twitch_id,
          vod.task_id,
          'download_handler',
          'completed',
          'present',
          finalVideoPath,
          fileSizeBytes
        ]);

        // Fallback upsert for vod_file_states to guarantee it exists for UI, even if lock release failed
        await client.query(`
          INSERT INTO vod_file_states (
            vod_id, task_id, twitch_vod_id, file_path, file_size_bytes, 
            file_state, operation_status, checksum_md5, first_downloaded_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'present', 'completed', $6, NOW(), NOW())
          ON CONFLICT (twitch_vod_id, task_id) DO UPDATE SET
            file_path = EXCLUDED.file_path,
            file_size_bytes = EXCLUDED.file_size_bytes,
            file_state = 'present',
            operation_status = 'completed',
            checksum_md5 = EXCLUDED.checksum_md5,
            updated_at = NOW()
        `, [
          vod.id,
          vod.task_id,
          vod.twitch_id,
          finalVideoPath,
          fileSizeBytes,
          checksum
        ]);

        // Get updated completion statistics for task progress
        const completionStats = await this.completedVodService.getTaskCompletionStats(vod.task_id);

        // Ensure proper typing for PostgreSQL parameters
        const completedVods = completionStats.completed_vods || 0;
        const totalVods = completionStats.total_vods || 0;
        const completionPercentage = Math.round(completionStats.completion_percentage || 0);

        // Update task progress with actual completion data
        await client.query(`
          UPDATE task_monitoring
          SET status              = CASE 
                                      WHEN $3::int >= $4::int THEN 'completed'
                                      ELSE 'running'
                                    END,
              status_message      = CONCAT('Downloaded: ', $3::int, '/', $4::int, ' VODs completed'),
              progress_percentage = $5::int,
              items_completed     = $3::int,
              items_total         = $4::int,
              updated_at          = NOW()
          WHERE task_id = $1
        `, [
          vod.task_id,
          vod.id,
          completedVods,
          totalVods,
          completionPercentage
        ]);

        logger.info(`Successfully completed and tracked VOD download`, {
          vod_id: vod.id,
          task_id: vod.task_id,
          twitch_id: vod.twitch_id,
          file_size: fileSizeBytes,
          download_duration: downloadDurationSeconds,
          download_speed: downloadSpeedMbps,
          completion_percentage: completionPercentage
        });

        // Note: user_settings update removed as completed_at column doesn't exist

      } catch (error) {
        // Update VOD status based on error type
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isPermanentError = errorMessage.includes('404') ||
          errorMessage.includes('no longer available') ||
          errorMessage.includes('Invalid VOD');

        const newStatus = isPermanentError ? 'failed' : 'pending';
        await client.query(`
          UPDATE vods
          SET download_status = $2::vod_status,
            error_message = $3,
            updated_at = NOW()
          WHERE id = $1
        `, [vod.id, newStatus, errorMessage]);

        // Use safe release function to unlock VOD and record error
        try {
          await client.query(`
            SELECT safe_release_vod_lock($1::bigint, $2, $3, $4, $5, NULL, NULL, $6)
          `, [
            vod.twitch_id,
            vod.task_id,
            'download_handler',
            isPermanentError ? 'failed' : 'failed',
            isPermanentError ? 'missing' : 'partial',
            JSON.stringify({ error: errorMessage, timestamp: new Date().toISOString() })
          ]);
        } catch (releaseError) {
          logger.warn(`Could not release VOD lock for ${vod.twitch_id}:`, releaseError);
        }

        // Emit WebSocket update for error status
        this.webSocketService.emitDownloadStatusChange(vod.id, vod.task_id, newStatus, 0);

        // Update task monitoring with completion statistics
        try {
          const completionStats = await this.completedVodService.getTaskCompletionStats(vod.task_id);
          const completedVods = completionStats.completed_vods || 0;
          const totalVods = completionStats.total_vods || 0;
          const completionPercentage = Math.round(completionStats.completion_percentage || 0);

          await client.query(`
            UPDATE task_monitoring
            SET status         = 'running',
                status_message = CONCAT('Error with VOD download - Downloaded: ', $3::int, '/', $4::int, ' VODs | Error: ', $2),
                progress_percentage = $5::int,
                items_completed = $3::int,
                items_total = $4::int,
                updated_at     = NOW()
            WHERE task_id = $1
          `, [vod.task_id, errorMessage, completedVods, totalVods, completionPercentage]);
        } catch (statsError) {
          // Fallback to simple error message if stats retrieval fails
          await client.query(`
            UPDATE task_monitoring
            SET status         = 'failed',
                status_message = $2,
                updated_at     = NOW()
            WHERE task_id = $1
          `, [vod.task_id, errorMessage]);
        }

        throw error;
      } finally {
        await this.fileSystem.cleanupDirectory(workingDir);
        this.activeDownloads.delete(vod.id);
      }

      // Process next queued VOD if any
      const nextVod = await client.query(`
        SELECT id
        FROM vods
        WHERE download_status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
      `);

      if (nextVod.rows.length > 0) {
        // Process next VOD asynchronously
        setTimeout(() => {
          this.processVOD({ id: nextVod.rows[0].id }).catch(err => {
            logger.error(`Error processing next VOD:`, err);
          });
        }, 1000); // Small delay before starting next download
      }

    } catch (error) {
      logger.error(`Error processing VOD ${vod.id}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async handleDownloadError(vodId: number, error: Error): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const vodResult = await client.query(`
        SELECT retry_count, max_retries
        FROM vods
        WHERE id = $1
      `, [vodId]);

      if (vodResult.rows.length === 0) {
        throw new Error(`VOD ${vodId} not found`);
      }

      const vod = vodResult.rows[0];
      const retryCount = parseInt(String(vod.retry_count || '0')) + 1;
      const maxRetries = parseInt(String(vod.max_retries || '3'));

      // Pre-calculate the status so we don't need complex CASE statements that confuse pg's type inference
      const nextStatus = retryCount < maxRetries ? 'pending' : 'failed';

      await client.query(`
      UPDATE vods
      SET download_status = $2::vod_status,
          retry_count     = $3::integer,
          error_message   = $4,
          updated_at      = NOW()
      WHERE id = $1
    `, [vodId, nextStatus, retryCount, error.message]);

      await client.query(`
        INSERT INTO vod_events (vod_id,
                                event_type,
                                details,
                                created_at)
        VALUES ($1, 'error', $2, NOW())
      `, [vodId, JSON.stringify({
        error: error.message,
        retry_count: retryCount,
        max_retries: maxRetries,
        will_retry: retryCount < maxRetries,
        stack: error.stack
      })]);

      await client.query('COMMIT');

      this.emit('download:error', {
        vodId,
        error,
        retryCount,
        maxRetries,
        willRetry: retryCount < maxRetries
      });

      if (retryCount < maxRetries) {
        const retryDelay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => {
          this.processVOD({ id: vodId }).catch(err => {
            logger.error(`Retry failed for VOD ${vodId}:`, err);
          });
        }, retryDelay);
      }

    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Error handling download failure for VOD ${vodId}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  private async getVODPlaylist(vodId: string, preferredQuality: string): Promise<SegmentedPlaylist> {
    const rawPlaylist = await this.twitchService.getVODPlaylist(vodId);
    if (!rawPlaylist) {
      throw new Error(`Failed to get playlist for VOD ${vodId}`);
    }

    let selectedQuality = preferredQuality;
    let selectedSegments = null;

    if (rawPlaylist.qualities[preferredQuality]) {
      selectedSegments = rawPlaylist.qualities[preferredQuality].segments;
    } else {
      const availableQualities = Object.keys(rawPlaylist.qualities);
      if (availableQualities.length === 0) {
        throw new Error(`No qualities available for VOD ${vodId}`);
      }
      selectedQuality = availableQualities[0];
      selectedSegments = rawPlaylist.qualities[selectedQuality].segments;
    }

    if (!selectedSegments || selectedSegments.length === 0) {
      throw new Error(`No segments available for VOD ${vodId}`);
    }

    // Apply type assertion to tell TypeScript that `selectedSegments` contains `checksum` property
    return {
      segments: selectedSegments.map((s, index) => ({
        index,
        url: s.url,
        duration: s.duration,
        checksum: (s as { checksum?: string }).checksum ?? undefined // Type assertion here
      })),
      duration: rawPlaylist.duration || selectedSegments.reduce((sum, s) => sum + s.duration, 0),
      quality: selectedQuality
    };
  }

  public async toggleTaskState(taskId: number, active: boolean): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (active) {
        // Activate task - update status to watching
        await client.query(`
          UPDATE tasks
          SET status     = 'running',
              is_active  = true,
              updated_at = NOW()
          WHERE id = $1
        `, [taskId]);

        // Initialize task monitoring
        await client.query(`
          INSERT INTO task_monitoring (task_id,
                                       status,
                                       status_message,
                                       progress_percentage,
                                       items_total,
                                       items_completed,
                                       items_failed,
                                       last_check_at,
                                       created_at,
                                       updated_at)
          VALUES ($1, 'watching', 'Watching for new VODs', 0, 0, 0, 0, NOW(), NOW(), NOW())
          ON CONFLICT (task_id)
            DO UPDATE SET status              = 'watching',
                          status_message      = 'Watching for new VODs',
                          progress_percentage = 0,
                          items_completed     = 0,
                          items_failed        = 0,
                          last_check_at       = NOW(),
                          updated_at          = NOW()
        `, [taskId]);
      } else {
        // Deactivate task
        await client.query(`
          UPDATE tasks
          SET status     = 'inactive',
              is_active  = false,
              updated_at = NOW()
          WHERE id = $1
        `, [taskId]);

        // Update task monitoring
        await client.query(`
          UPDATE task_monitoring
          SET status         = 'inactive',
              status_message = 'Task deactivated',
              updated_at     = NOW()
          WHERE task_id = $1
        `, [taskId]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async combineSegments(vod: any, tempDir: string, outputDir: string, segmentCount: number): Promise<string> {
    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Create output file path
      const sanitizedTitle = vod.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
      const outputFileName = `${vod.twitch_id}_${sanitizedTitle}.ts`;
      const outputPath = path.join(outputDir, outputFileName);

      logger.info(`Combining segments to: ${outputPath}`);

      // Create file list for ffmpeg concat
      const fileListPath = path.join(tempDir, 'filelist.txt');
      let fileListContent = '';

      for (let i = 0; i < segmentCount; i++) {
        const segmentPath = path.join(tempDir, `segment-${i}.ts`);
        if (fsSync.existsSync(segmentPath)) {
          fileListContent += `file '${segmentPath.replace(/\\/g, '/')}'\n`;
        }
      }

      await fs.writeFile(fileListPath, fileListContent);

      // Use simple concatenation for .ts files (they can be concatenated directly)
      // For better compatibility, we'll just concatenate the files directly
      const writeStream = fsSync.createWriteStream(outputPath);

      for (let i = 0; i < segmentCount; i++) {
        const segmentPath = path.join(tempDir, `segment-${i}.ts`);
        if (fsSync.existsSync(segmentPath)) {
          const readStream = fsSync.createReadStream(segmentPath);
          await new Promise((resolve, reject) => {
            readStream.pipe(writeStream, { end: false });
            readStream.on('end', resolve);
            readStream.on('error', reject);
          });
        }
      }

      writeStream.end();

      // Wait for write to complete
      await new Promise((resolve) => writeStream.on('finish', resolve));

      logger.info(`Successfully combined segments into: ${outputPath}`);
      return outputPath;

    } catch (error) {
      logger.error(`Error combining segments for VOD ${vod.id}:`, error);
      throw error;
    }
  }

  /**
   * Calculate MD5 checksum for file integrity verification
   */
  private async calculateMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fsSync.createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async updateDownloadProgress(vodId: number, totalSegments: number): Promise<void> {
    const state = this.activeDownloads.get(vodId);
    if (!state) {
      logger.warn(`No download state found for VOD ${vodId} when updating progress`);
      return;
    }

    const completedSegments = state.completedSegments.size;
    const progressPercentage = Math.round((completedSegments / totalSegments) * 100);

    // Update every 5 segments or every 1% change
    const lastProgressUpdate = (state as any).lastProgressUpdate || 0;
    if (completedSegments > 0 &&
      completedSegments % 5 !== 0 &&
      progressPercentage === lastProgressUpdate &&
      progressPercentage < 100) {
      return;
    }
    (state as any).lastProgressUpdate = progressPercentage;

    try {
      const client = await this.pool.connect();
      try {
        // Update VOD progress with segment information
        await client.query(`
          UPDATE vods
          SET download_progress = $2,
              current_segment = $3,
              total_segments = $4,
              download_speed = $5,
              eta_seconds = $6,
              updated_at = NOW()
          WHERE id = $1
        `, [vodId, progressPercentage, completedSegments, totalSegments, Math.round(state.progress.speed || 0), Math.round(state.progress.eta) || 0]);

        // Get task ID for WebSocket emission
        const taskResult = await client.query(`SELECT task_id FROM vods WHERE id = $1`, [vodId]);
        const taskId = taskResult.rows[0]?.task_id;

        if (taskId) {
          // Emit real-time progress via WebSocket
          this.webSocketService.emitDownloadProgress({
            vodId,
            taskId,
            status: 'downloading',
            progress: progressPercentage,
            currentSegment: completedSegments,
            totalSegments: totalSegments,
            speed: state.progress.speed,
            eta: state.progress.eta
          });
        }

        // Get task completion statistics for accurate task progress
        if (taskId) {
          const completionStats = await this.completedVodService.getTaskCompletionStats(taskId);

          // Update task progress with actual completion data and current segment progress
          // Ensure all values are properly typed for PostgreSQL
          const totalVods = completionStats.total_vods || 0;
          const completedVods = completionStats.completed_vods || 0;
          const completionPercentage = completionStats.completion_percentage || 0;

          await client.query(`
            UPDATE task_monitoring
            SET status_message = CASE 
                                   WHEN $4::int > 0 THEN CONCAT('Downloading VOD - Segments: ', $2::int, '/', $3::int, ' | Downloaded: ', $5::int, '/', $6::int, ' VODs')
                                   ELSE CONCAT('Downloading segments: ', $2::int, '/', $3::int)
                                 END,
                progress_percentage = CASE 
                                        WHEN $6::int > 0 THEN GREATEST($7::numeric, $8::numeric)
                                        ELSE $8::numeric
                                      END,
                items_completed = $5::int,
                items_total = $6::int,
                updated_at = NOW()
            WHERE task_id = $1
          `, [
            taskId,
            completedSegments,
            totalSegments,
            totalVods,
            completedVods,
            totalVods,
            completionPercentage,
            progressPercentage
          ]);
        }

        logger.info(`VOD ${vodId} progress updated: ${completedSegments}/${totalSegments} segments (${progressPercentage}%)`);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error(`Error updating progress for VOD ${vodId}:`, error);
    }
  }
}

export default DownloadHandler;

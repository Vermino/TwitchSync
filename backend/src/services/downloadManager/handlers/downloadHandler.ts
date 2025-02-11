// Filepath: backend/src/services/downloadManager/handlers/downloadHandler.ts

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import axios from 'axios';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { logger } from '../../../utils/logger';
import { FileSystemManager } from '../utils/fileSystem';
import { BandwidthThrottler } from '../utils/throttle';
import { Checksums } from '../utils/checksums';
import { TwitchService } from '../../twitch/service';
import {
  DownloadState,
  SegmentInfo,
  SegmentedPlaylist,
  VideoQuality,
  PlaylistQuality,
  VodPlaylist
} from '../types';

const MAX_VODS = 10;
const MAX_CONCURRENT_DOWNLOADS = 1;

export class DownloadHandler extends EventEmitter {
  private activeDownloads: Map<number, DownloadState>;
  private fileSystem: FileSystemManager;
  private twitchService: TwitchService;

  constructor(
      private pool: Pool,
      private tempDir: string,
      private maxConcurrent: number = 3
  ) {
    super();
    this.activeDownloads = new Map();
    this.fileSystem = new FileSystemManager(tempDir);
    this.twitchService = TwitchService.getInstance();
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

    const queue = [...segments];
    const inProgress = new Set<Promise<void>>();

    while (queue.length > 0 || inProgress.size > 0) {
      while (queue.length > 0 && inProgress.size < maxConcurrent) {
        const segment = queue.shift();
        if (!segment) continue;

        const outputPath = path.join(tempDir, `segment-${segment.index}.ts`);
        const downloadPromise = this.downloadSegment(vodId, segment, outputPath, throttleSpeed)
            .then(() => {
              inProgress.delete(downloadPromise);
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
        headers: {'Range': `bytes=${state.resumePosition}-`}
      });

      const writer = fsSync.createWriteStream(outputPath, {flags: 'a'});
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
      // Get download path from user settings with new fields
      const settingsResult = await client.query(`
        SELECT 
          us.settings->'downloads'->>'downloadPath' as download_path,
          us.settings->'downloads'->>'tempStorageLocation' as temp_path,
          (us.settings->'downloads'->>'concurrentDownloadLimit')::int as concurrent_limit,
          (us.settings->'downloads'->>'bandwidthThrottle')::int as bandwidth_limit,
          us.settings as user_settings,
          us.updated_at as completed_at
        FROM user_settings us
        INNER JOIN tasks t ON t.user_id = us.user_id
        WHERE t.id = $1
      `, [vod.task_id]);

      const settings = settingsResult.rows[0];
      const downloadPath = settings?.download_path || this.tempDir;
      const tempPath = settings?.temp_path || this.tempDir;
      const bandwidthLimit = settings?.bandwidth_limit || 0;
      const concurrentLimit = settings?.concurrent_limit || 3;
      const userSettings = settings?.user_settings || {};
      const completedAt = settings?.completed_at;

      // Ensure download directory exists
      await fs.mkdir(downloadPath, {recursive: true});

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

      // Check active VOD count before proceeding
      const totalActiveVods = await client.query(`
        SELECT COUNT(*) as count
        FROM vods
        WHERE download_status IN ('downloading', 'pending', 'queued')
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
            downloadPath,
            MAX_CONCURRENT_DOWNLOADS,
            bandwidthLimit
        );

        // Update VOD status to completed
        await client.query(`
          UPDATE vods
          SET download_status   = 'completed',
              completed_at      = NOW(),
              updated_at        = NOW(),
              download_progress = 100
          WHERE id = $1
        `, [vod.id]);

        // Update task progress
        await client.query(`
          UPDATE task_monitoring
          SET status              = 'completed',
              status_message      = 'Download completed successfully',
              progress_percentage = 100,
              items_completed     = items_completed + 1,
              updated_at          = NOW()
          WHERE task_id = $1
        `, [vod.task_id]);

        // Update user_settings completed_at when relevant
        if (!completedAt) {
          await client.query(`
            UPDATE user_settings
            SET completed_at = NOW()
            WHERE user_id = (SELECT user_id FROM tasks WHERE id = $1)
          `, [vod.task_id]);
        }

      } catch (error) {
        // Update VOD status based on error type
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isPermanentError = errorMessage.includes('404') ||
            errorMessage.includes('no longer available') ||
            errorMessage.includes('Invalid VOD');

        await client.query(`
          UPDATE vods
          SET download_status = $2::vod_status,
            error_message = $3
            , updated_at = NOW()
          WHERE id = $1
        `, [
          vod.id,
          isPermanentError ? 'failed' : 'pending',
          errorMessage
        ]);

        // Update task monitoring
        await client.query(`
          UPDATE task_monitoring
          SET status         = 'failed',
              status_message = $2,
              updated_at     = NOW()
          WHERE task_id = $1
        `, [vod.task_id, errorMessage]);

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
          this.processVOD({id: nextVod.rows[0].id}).catch(err => {
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

      await client.query(`
        UPDATE vods
        SET download_status = CASE
                                WHEN $2::integer < $3:: integer THEN 'pending'::vod_status
                                ELSE 'failed'::vod_status
          END,
            retry_count     = $2::integer,
            error_message = $4, updated_at = NOW()
        WHERE id = $1
      `, [vodId, retryCount, maxRetries, error.message]);

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
          this.processVOD({id: vodId}).catch(err => {
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
}

export default DownloadHandler;

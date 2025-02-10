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
import { TwitchAPIService } from '../../twitch/api';
import {
  DownloadState,
  SegmentInfo,
  SegmentedPlaylist,
  VideoQuality,
  PlaylistQuality,
  VodPlaylist
} from '../types';

interface VodInfo {
  twitch_id: string;
  user_name: string;
  created_at: string;
  title: string;
  duration: number;
  view_count: number;
}

// Update TwitchAPI response type
interface TwitchPlaylistResponse {
  qualities: Record<string, {
    segments: Array<{
      url: string;
      duration: number;
      checksum?: string;
    }>;
  }>;
  duration: number;
}

export class DownloadHandler extends EventEmitter {
  private activeDownloads: Map<number, DownloadState>;
  private fileSystem: FileSystemManager;
  private twitchAPI: TwitchAPIService;

  constructor(
    private pool: Pool,
    private tempDir: string,
    private maxConcurrent: number = 3
  ) {
    super();
    this.activeDownloads = new Map();
    this.fileSystem = new FileSystemManager(tempDir);
    this.twitchAPI = TwitchAPIService.getInstance();
  }

  // Add method to get active downloads
  public getActiveDownloads(): Map<number, DownloadState> {
    return this.activeDownloads;
  }

  createDownloadState(vodId: number, totalSegments: number): DownloadState {
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
      const retryCount = (vod.retry_count || 0) + 1;
      const maxRetries = vod.max_retries || 3;

      // Update the VOD status based on retry count
      await client.query(`
        UPDATE vods
        SET download_status = CASE 
          WHEN $2 < $3 THEN 'pending'
          ELSE 'failed'
        END,
        retry_count = $2,
        error_message = $4,
        updated_at = NOW()
        WHERE id = $1
      `, [vodId, retryCount, maxRetries, error.message]);

      // Log error event
      await client.query(`
        INSERT INTO vod_events (
          vod_id,
          event_type,
          details,
          created_at
        ) VALUES ($1, 'error', $2, NOW())
      `, [vodId, JSON.stringify({
        error: error.message,
        retry_count: retryCount,
        max_retries: maxRetries,
        will_retry: retryCount < maxRetries,
        stack: error.stack
      })]);

      await client.query('COMMIT');

      // Emit error event
      this.emit('download:error', {
        vodId,
        error,
        retryCount,
        maxRetries,
        willRetry: retryCount < maxRetries
      });

      // If we still have retries left, schedule the retry
      if (retryCount < maxRetries) {
        const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
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

  async processVOD(vod: any): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Update VOD status to downloading
      await client.query(`
        UPDATE vods
        SET download_status = 'downloading',
            started_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [vod.id]);

      // Create temp directory
      const tempDir = await this.fileSystem.createTempDirectory(vod.twitch_id);

      // Create download state
      const state = this.createDownloadState(vod.id, 0);
      this.activeDownloads.set(vod.id, state);

      try {
        // Fetch VOD information and playlist
        const vodInfo = await this.twitchAPI.getVODInfo(vod.twitch_id);
        const playlist = await this.getVODPlaylist(vod.twitch_id, vod.preferred_quality || 'source');

        // Update state with total segments
        state.progress.totalSegments = playlist.segments.length;

        // Create final download directory
        const downloadPath = await this.fileSystem.createDownloadDirectory(
          this.tempDir,
          vodInfo.user_name,
          vodInfo.created_at.split('T')[0],
          vod.twitch_id
        );

        // Download segments
        await this.downloadSegmentsInParallel(
          vod.id,
          playlist.segments,
          tempDir,
          3,
          vod.bandwidth_throttle
        );

        // Save metadata
        await this.fileSystem.writeMetadata(downloadPath, {
          ...vodInfo,
          download_completed: new Date().toISOString(),
          segments_downloaded: state.completedSegments.size,
          quality: playlist.quality
        });

        // Update VOD status to completed
        await client.query(`
          UPDATE vods
          SET download_status = 'completed',
              download_path = $2,
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `, [vod.id, downloadPath]);

        this.emit('download:complete', {
          vodId: vod.id,
          downloadPath,
          quality: playlist.quality,
          duration: playlist.duration
        });

      } catch (error) {
        if (error instanceof Error) {
          await this.handleDownloadError(vod.id, error);
        } else {
          await this.handleDownloadError(vod.id, new Error(String(error)));
        }
        throw error;
      } finally {
        // Cleanup temp directory
        await this.fileSystem.cleanupDirectory(tempDir);
        this.activeDownloads.delete(vod.id);
      }

    } finally {
      client.release();
    }
  }

  private async getVODPlaylist(vodId: string, preferredQuality: string): Promise<SegmentedPlaylist> {
    const rawPlaylist = await this.twitchAPI.getVODPlaylist(vodId) as TwitchPlaylistResponse;
    if (!rawPlaylist) {
      throw new Error(`Failed to get playlist for VOD ${vodId}`);
    }

    // Convert the Record<string, Quality> to PlaylistQuality[]
    const qualities: PlaylistQuality[] = Object.entries(rawPlaylist.qualities).map(([quality, data]) => ({
      quality: quality as VideoQuality,
      segments: data.segments
    }));

    const selectedQuality = qualities.find(q => q.quality === preferredQuality as VideoQuality)
      || qualities[0];

    if (!selectedQuality) {
      throw new Error('No suitable quality found for VOD');
    }

    return {
      segments: selectedQuality.segments.map((s, index) => ({
        index,
        url: s.url,
        duration: s.duration,
        checksum: s.checksum
      })),
      duration: rawPlaylist.duration,
      quality: selectedQuality.quality
    };
  }
}

export default DownloadHandler;

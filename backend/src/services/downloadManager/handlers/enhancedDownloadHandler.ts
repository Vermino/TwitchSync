// Filepath: backend/src/services/downloadManager/handlers/enhancedDownloadHandler.ts

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import axios from 'axios';
import { logger } from '../../../utils/logger';
import { DownloadHandler } from './downloadHandler';
import { ErrorRecoveryService } from '../../errorRecovery';

/**
 * Enhanced download handler with built-in error recovery and circuit breaker pattern
 * This demonstrates how existing services can be enhanced with reliability features
 */
export class EnhancedDownloadHandler extends DownloadHandler {
  private errorRecovery: ErrorRecoveryService;

  constructor(
    pool: Pool,
    tempDir: string,
    maxConcurrent: number = 3,
    errorRecovery?: ErrorRecoveryService
  ) {
    super(pool, tempDir, maxConcurrent);
    this.errorRecovery = errorRecovery || new ErrorRecoveryService(pool);
    this.setupErrorRecoveryIntegration();
  }

  /**
   * Set up error recovery integration
   */
  private setupErrorRecoveryIntegration(): void {
    // Listen for download errors and record patterns
    this.on('download:error', (error) => {
      this.errorRecovery.recordErrorPattern('download_operation', error);
    });

    // Listen for circuit breaker events
    this.errorRecovery.on('circuit:opened', (data) => {
      if (data.operationId === 'twitch_api') {
        logger.warn('Twitch API circuit breaker opened - enabling graceful degradation');
        this.errorRecovery.enableGracefulDegradation('twitch_api');
      }
    });

    this.errorRecovery.on('circuit:reset', (data) => {
      if (data.operationId === 'twitch_api') {
        logger.info('Twitch API circuit breaker reset - disabling graceful degradation');
        this.errorRecovery.disableGracefulDegradation('twitch_api');
      }
    });
  }

  /**
   * Enhanced VOD download with error recovery
   * This is a placeholder - in a real implementation, you'd call the actual download method
   */
  public async downloadVodWithRecovery(vodId: number): Promise<void> {
    return this.errorRecovery.executeWithRetry(
      async () => {
        // Placeholder for actual download logic that would be implemented
        logger.info(`Starting enhanced download for VOD ${vodId}`);
        // return actual download implementation
        await this.simulateVodDownload(vodId);
      },
      `download_vod_${vodId}`,
      {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2,
        jitter: true
      }
    );
  }

  /**
   * Simulate VOD download for demonstration
   */
  private async simulateVodDownload(vodId: number): Promise<void> {
    // This would contain the actual download implementation
    logger.info(`Simulating download for VOD ${vodId}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Enhanced segment download with circuit breaker
   */
  public async downloadSegmentWithRecovery(
    url: string,
    outputPath: string,
    segmentIndex: number
  ): Promise<void> {
    return this.errorRecovery.executeWithGracefulDegradation(
      // Primary operation
      async () => {
        const response = await axios({
          method: 'GET',
          url,
          responseType: 'stream',
          timeout: 30000,
          headers: {
            'User-Agent': 'TwitchSync/1.0'
          }
        });

        // Stream to file with progress tracking
        return new Promise<void>((resolve, reject) => {
          const writeStream = require('fs').createWriteStream(outputPath);
          
          response.data.pipe(writeStream);
          
          writeStream.on('finish', () => {
            logger.debug(`Segment ${segmentIndex} downloaded successfully`);
            resolve();
          });
          
          writeStream.on('error', (error: Error) => {
            logger.error(`Segment ${segmentIndex} write error:`, error);
            reject(error);
          });

          response.data.on('error', (error: Error) => {
            logger.error(`Segment ${segmentIndex} stream error:`, error);
            reject(error);
          });
        });
      },
      // Fallback operation - retry with different strategy
      async () => {
        logger.warn(`Using fallback strategy for segment ${segmentIndex}`);
        
        // Simpler download approach as fallback
        const response = await axios({
          method: 'GET',
          url,
          responseType: 'arraybuffer',
          timeout: 60000, // Longer timeout for fallback
          headers: {
            'User-Agent': 'TwitchSync-Fallback/1.0'
          }
        });

        await require('fs').promises.writeFile(outputPath, response.data);
        logger.info(`Segment ${segmentIndex} downloaded via fallback`);
      },
      'segment_download',
      `segment_${segmentIndex}`
    );
  }

  /**
   * Enhanced playlist parsing with error recovery
   */
  public async parsePlaylistWithRecovery(playlistUrl: string): Promise<any> {
    return this.errorRecovery.executeWithRetry(
      async () => {
        const response = await axios.get(playlistUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'TwitchSync/1.0'
          }
        });

        return this.parseM3U8Content(response.data);
      },
      'parse_playlist',
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: true
      }
    );
  }

  /**
   * Simple M3U8 content parser
   */
  private parseM3U8Content(content: string): any {
    const lines = content.split('\n').filter(line => line.trim());
    const segments = [];
    let currentSegment: any = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        const duration = parseFloat(line.split(':')[1].split(',')[0]);
        currentSegment.duration = duration;
      } else if (line.startsWith('http')) {
        currentSegment.url = line;
        segments.push({ ...currentSegment });
        currentSegment = {};
      }
    }

    return {
      segments,
      totalDuration: segments.reduce((sum, seg) => sum + (seg.duration || 0), 0)
    };
  }

  /**
   * Get error recovery statistics
   */
  public getErrorRecoveryStats(): any {
    return this.errorRecovery.getErrorStats();
  }

  /**
   * Force circuit breaker reset for testing
   */
  public resetCircuitBreaker(operationId: string): void {
    this.errorRecovery['resetCircuitBreaker'](operationId);
  }

  /**
   * Enable graceful degradation for specific service
   */
  public enableGracefulDegradation(serviceName: string): void {
    this.errorRecovery.enableGracefulDegradation(serviceName);
  }

  /**
   * Disable graceful degradation for specific service
   */
  public disableGracefulDegradation(serviceName: string): void {
    this.errorRecovery.disableGracefulDegradation(serviceName);
  }
}

export const createEnhancedDownloadHandler = (
  pool: Pool,
  tempDir: string,
  maxConcurrent: number = 3,
  errorRecovery?: ErrorRecoveryService
) => new EnhancedDownloadHandler(pool, tempDir, maxConcurrent, errorRecovery);
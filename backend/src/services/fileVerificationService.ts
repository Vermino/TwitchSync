// Filepath: backend/src/services/fileVerificationService.ts

import { Pool, PoolClient } from 'pg';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import path from 'path';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface FileVerificationOptions {
  depth: 'basic' | 'standard' | 'full';
  includeChecksum: boolean;
  checksumAlgorithm: 'md5' | 'sha256' | 'both';
  batchSize: number;
  maxConcurrent: number;
  skipMissing: boolean;
  updateDatabase: boolean;
}

export interface FileVerificationResult {
  fileExists: boolean;
  sizeMatches: boolean | null;
  checksumValid: boolean | null;
  actualSize: number | null;
  expectedSize: number | null;
  actualChecksum: string | null;
  expectedChecksum: string | null;
  verificationDuration: number;
  errorMessage: string | null;
}

export interface BatchVerificationProgress {
  totalFiles: number;
  processedFiles: number;
  verifiedFiles: number;
  failedFiles: number;
  missingFiles: number;
  corruptedFiles: number;
  percentage: number;
  estimatedTimeRemaining: number;
  currentFile: string | null;
}

export interface VerificationStats {
  totalVerified: number;
  successfulVerifications: number;
  failedVerifications: number;
  filesPresent: number;
  filesMissing: number;
  filesCorrupted: number;
  totalSizeVerified: number;
  averageVerificationTime: number;
  lastVerificationRun: Date | null;
}

export class FileVerificationService extends EventEmitter {
  private pool: Pool;
  private isRunning: boolean = false;
  private currentBatch: Promise<any> | null = null;
  private workerPool: Set<Promise<any>> = new Set();

  constructor(pool: Pool) {
    super();
    this.pool = pool;
  }

  /**
   * Verify a single file's existence and integrity
   */
  async verifyFile(
    fileStateId: number,
    filePath: string,
    options: Partial<FileVerificationOptions> = {}
  ): Promise<FileVerificationResult> {
    const opts: FileVerificationOptions = {
      depth: 'standard',
      includeChecksum: true,
      checksumAlgorithm: 'md5',
      batchSize: 1,
      maxConcurrent: 1,
      skipMissing: false,
      updateDatabase: true,
      ...options
    };

    const startTime = Date.now();
    logger.debug(`Verifying file: ${filePath} (depth: ${opts.depth})`);

    try {
      // Check file existence
      const fileExists = await this.checkFileExists(filePath);
      
      let result: FileVerificationResult = {
        fileExists,
        sizeMatches: null,
        checksumValid: null,
        actualSize: null,
        expectedSize: null,
        actualChecksum: null,
        expectedChecksum: null,
        verificationDuration: 0,
        errorMessage: null
      };

      if (!fileExists) {
        result.verificationDuration = Date.now() - startTime;
        result.errorMessage = 'File does not exist';
        
        if (opts.updateDatabase) {
          await this.updateFileStateVerification(fileStateId, 'failed', result, 'existence');
        }
        
        return result;
      }

      // Get file stats
      const fileStats = await fs.stat(filePath);
      result.actualSize = fileStats.size;

      // Get expected size and checksum from database if available
      const expectedData = await this.getExpectedFileData(fileStateId);
      if (expectedData) {
        result.expectedSize = expectedData.expectedSize;
        result.expectedChecksum = expectedData.expectedChecksum;
      }

      // Verify size if we have expected size
      if (result.expectedSize !== null) {
        result.sizeMatches = result.actualSize === result.expectedSize;
      }

      // Verify checksum based on depth and options
      if (opts.includeChecksum && (opts.depth === 'standard' || opts.depth === 'full')) {
        try {
          if (opts.checksumAlgorithm === 'md5' || opts.checksumAlgorithm === 'both') {
            result.actualChecksum = await this.calculateChecksum(filePath, 'md5');
            
            if (result.expectedChecksum && result.expectedChecksum.length === 32) {
              result.checksumValid = result.actualChecksum === result.expectedChecksum;
            }
          }
          
          if (opts.checksumAlgorithm === 'sha256' || opts.checksumAlgorithm === 'both') {
            const sha256 = await this.calculateChecksum(filePath, 'sha256');
            
            if (result.expectedChecksum && result.expectedChecksum.length === 64) {
              result.checksumValid = sha256 === result.expectedChecksum;
            } else if (!result.actualChecksum) {
              result.actualChecksum = sha256;
            }
          }
        } catch (checksumError) {
          result.errorMessage = `Checksum calculation failed: ${checksumError instanceof Error ? checksumError.message : String(checksumError)}`;
          result.checksumValid = false;
        }
      }

      result.verificationDuration = Date.now() - startTime;

      // Update database with verification results
      if (opts.updateDatabase) {
        const verificationStatus = this.determineVerificationStatus(result);
        const verificationType = opts.includeChecksum ? 'full' : 'existence';
        
        await this.updateFileStateVerification(fileStateId, verificationStatus, result, verificationType);
      }

      logger.debug(`File verification completed: ${filePath} (${result.verificationDuration}ms)`);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`File verification failed for ${filePath}:`, error);
      
      const result: FileVerificationResult = {
        fileExists: false,
        sizeMatches: null,
        checksumValid: null,
        actualSize: null,
        expectedSize: null,
        actualChecksum: null,
        expectedChecksum: null,
        verificationDuration: duration,
        errorMessage
      };

      if (opts.updateDatabase) {
        await this.updateFileStateVerification(fileStateId, 'failed', result, 'existence');
      }

      return result;
    }
  }

  /**
   * Bulk verify files for a user with progress tracking
   */
  async bulkVerifyUserFiles(
    userId: number,
    options: Partial<FileVerificationOptions> = {}
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error('Bulk verification is already running');
    }

    const opts: FileVerificationOptions = {
      depth: 'standard',
      includeChecksum: true,
      checksumAlgorithm: 'md5',
      batchSize: 50,
      maxConcurrent: 3,
      skipMissing: true,
      updateDatabase: true,
      ...options
    };

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      logger.info(`Starting bulk file verification for user ${userId}`, opts);

      // Get all file states for the user
      const fileStates = await this.getUserFileStates(userId);
      const totalFiles = fileStates.length;

      if (totalFiles === 0) {
        logger.info(`No files to verify for user ${userId}`);
        this.emit('verification:completed', { userId, stats: this.createEmptyStats() });
        return;
      }

      logger.info(`Found ${totalFiles} files to verify for user ${userId}`);

      // Initialize progress tracking
      let processedFiles = 0;
      let verifiedFiles = 0;
      let failedFiles = 0;
      let missingFiles = 0;
      let corruptedFiles = 0;

      const updateProgress = () => {
        const progress: BatchVerificationProgress = {
          totalFiles,
          processedFiles,
          verifiedFiles,
          failedFiles,
          missingFiles,
          corruptedFiles,
          percentage: (processedFiles / totalFiles) * 100,
          estimatedTimeRemaining: this.calculateETA(startTime, processedFiles, totalFiles),
          currentFile: null
        };
        
        this.emit('verification:progress', { userId, progress });
      };

      // Process files in batches with concurrency control
      for (let i = 0; i < fileStates.length; i += opts.batchSize) {
        const batch = fileStates.slice(i, i + opts.batchSize);
        
        // Process batch with concurrency limit
        const batchPromises = batch.map(async (fileState) => {
          if (this.workerPool.size >= opts.maxConcurrent) {
            // Wait for a worker to finish
            await Promise.race(this.workerPool);
          }

          const workerPromise = this.processFileInBatch(fileState, opts);
          this.workerPool.add(workerPromise);

          try {
            const result = await workerPromise;
            
            processedFiles++;
            
            if (result.errorMessage) {
              failedFiles++;
              if (!result.fileExists) {
                missingFiles++;
              } else if (result.checksumValid === false) {
                corruptedFiles++;
              }
            } else {
              verifiedFiles++;
            }
            
            updateProgress();
            return result;
          } finally {
            this.workerPool.delete(workerPromise);
          }
        });

        await Promise.allSettled(batchPromises);
      }

      // Wait for any remaining workers
      await Promise.allSettled(this.workerPool);

      const stats: VerificationStats = {
        totalVerified: processedFiles,
        successfulVerifications: verifiedFiles,
        failedVerifications: failedFiles,
        filesPresent: verifiedFiles,
        filesMissing: missingFiles,
        filesCorrupted: corruptedFiles,
        totalSizeVerified: await this.calculateTotalSizeVerified(userId),
        averageVerificationTime: (Date.now() - startTime) / processedFiles,
        lastVerificationRun: new Date()
      };

      logger.info(`Bulk verification completed for user ${userId}`, stats);
      this.emit('verification:completed', { userId, stats });

    } catch (error) {
      logger.error(`Bulk verification failed for user ${userId}:`, error);
      this.emit('verification:error', { userId, error });
      throw error;
    } finally {
      this.isRunning = false;
      this.workerPool.clear();
    }
  }

  /**
   * Get verification statistics for a user
   */
  async getVerificationStats(userId: number): Promise<VerificationStats> {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_verified,
          COUNT(*) FILTER (WHERE fvh.verification_status = 'verified') as successful_verifications,
          COUNT(*) FILTER (WHERE fvh.verification_status = 'failed') as failed_verifications,
          COUNT(*) FILTER (WHERE fvh.file_exists = true) as files_present,
          COUNT(*) FILTER (WHERE fvh.file_exists = false) as files_missing,
          COUNT(*) FILTER (WHERE fvh.checksum_matches = false) as files_corrupted,
          COALESCE(SUM(fvh.file_size_checked), 0) as total_size_verified,
          COALESCE(AVG(fvh.verification_duration_ms), 0) as average_verification_time,
          MAX(fvh.created_at) as last_verification_run
        FROM file_verification_history fvh
        JOIN vod_file_states vfs ON fvh.file_state_id = vfs.id
        JOIN vods v ON vfs.vod_id = v.id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1
          AND fvh.created_at > NOW() - INTERVAL '30 days'
      `;

      const result = await client.query(query, [userId]);
      const row = result.rows[0];

      return {
        totalVerified: parseInt(row.total_verified) || 0,
        successfulVerifications: parseInt(row.successful_verifications) || 0,
        failedVerifications: parseInt(row.failed_verifications) || 0,
        filesPresent: parseInt(row.files_present) || 0,
        filesMissing: parseInt(row.files_missing) || 0,
        filesCorrupted: parseInt(row.files_corrupted) || 0,
        totalSizeVerified: parseInt(row.total_size_verified) || 0,
        averageVerificationTime: parseFloat(row.average_verification_time) || 0,
        lastVerificationRun: row.last_verification_run ? new Date(row.last_verification_run) : null
      };
    } finally {
      client.release();
    }
  }

  /**
   * Schedule automatic file verification for a user
   */
  async scheduleVerification(
    userId: number, 
    intervalHours: number = 24,
    options: Partial<FileVerificationOptions> = {}
  ): Promise<void> {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    logger.info(`Scheduling file verification for user ${userId} every ${intervalHours} hours`);
    
    const runVerification = async () => {
      try {
        await this.bulkVerifyUserFiles(userId, options);
      } catch (error) {
        logger.error(`Scheduled verification failed for user ${userId}:`, error);
      }
    };

    // Run initial verification
    setImmediate(runVerification);

    // Schedule recurring verification
    setInterval(runVerification, intervalMs);
  }

  // Private helper methods

  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async calculateChecksum(filePath: string, algorithm: 'md5' | 'sha256'): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash(algorithm);
      const stream = require('fs').createReadStream(filePath);
      
      stream.on('error', reject);
      stream.on('data', (chunk: Buffer) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private async getExpectedFileData(fileStateId: number): Promise<{ expectedSize: number | null; expectedChecksum: string | null } | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT expected_size_bytes, checksum_md5, checksum_sha256
        FROM vod_file_states
        WHERE id = $1
      `, [fileStateId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        expectedSize: row.expected_size_bytes,
        expectedChecksum: row.checksum_md5 || row.checksum_sha256
      };
    } finally {
      client.release();
    }
  }

  private determineVerificationStatus(result: FileVerificationResult): 'verified' | 'failed' | 'skipped' {
    if (result.errorMessage) {
      return 'failed';
    }
    
    if (!result.fileExists) {
      return 'failed';
    }
    
    if (result.sizeMatches === false || result.checksumValid === false) {
      return 'failed';
    }
    
    return 'verified';
  }

  private async updateFileStateVerification(
    fileStateId: number,
    status: 'verified' | 'failed' | 'skipped',
    result: FileVerificationResult,
    verificationType: string
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update file state
      await client.query(`
        UPDATE vod_file_states
        SET 
          verification_status = $2,
          last_verified_at = NOW(),
          file_state = CASE 
            WHEN $3 = false THEN 'missing'
            WHEN $4 = false OR $5 = false THEN 'corrupted'
            WHEN $6 IS NOT NULL AND $6 > 0 THEN 'present'
            ELSE file_state
          END,
          file_size_bytes = COALESCE($6, file_size_bytes),
          checksum_md5 = CASE WHEN $7 IS NOT NULL AND LENGTH($7) = 32 THEN $7 ELSE checksum_md5 END,
          checksum_sha256 = CASE WHEN $7 IS NOT NULL AND LENGTH($7) = 64 THEN $7 ELSE checksum_sha256 END,
          updated_at = NOW()
        WHERE id = $1
      `, [
        fileStateId,
        status,
        result.fileExists,
        result.sizeMatches,
        result.checksumValid,
        result.actualSize,
        result.actualChecksum
      ]);

      // Insert verification history
      await client.query(`
        INSERT INTO file_verification_history (
          file_state_id, verification_type, verification_status,
          file_exists, size_matches, checksum_matches,
          expected_checksum, actual_checksum, verification_duration_ms,
          file_size_checked, error_message, triggered_by, verification_depth
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        fileStateId,
        verificationType,
        status,
        result.fileExists,
        result.sizeMatches,
        result.checksumValid,
        result.expectedChecksum,
        result.actualChecksum,
        result.verificationDuration,
        result.actualSize,
        result.errorMessage,
        'bulk_verification',
        'standard'
      ]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async getUserFileStates(userId: number): Promise<Array<{
    id: number;
    filePath: string;
    fileName: string;
    twitchVodId: string;
    taskId: number;
  }>> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          vfs.id,
          vfs.file_path,
          vfs.file_name,
          vfs.twitch_vod_id,
          vfs.task_id
        FROM vod_file_states vfs
        JOIN vods v ON vfs.vod_id = v.id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1
          AND vfs.file_path IS NOT NULL
          AND vfs.file_state != 'deleted'
        ORDER BY vfs.created_at ASC
      `, [userId]);

      return result.rows.map(row => ({
        id: row.id,
        filePath: row.file_path,
        fileName: row.file_name,
        twitchVodId: row.twitch_vod_id.toString(),
        taskId: row.task_id
      }));
    } finally {
      client.release();
    }
  }

  private async processFileInBatch(
    fileState: { id: number; filePath: string; fileName: string; twitchVodId: string; taskId: number },
    options: FileVerificationOptions
  ): Promise<FileVerificationResult> {
    this.emit('verification:file_start', { fileState });
    
    const result = await this.verifyFile(fileState.id, fileState.filePath, options);
    
    this.emit('verification:file_complete', { fileState, result });
    
    return result;
  }

  private calculateETA(startTime: number, completed: number, total: number): number {
    if (completed === 0) return 0;
    
    const elapsed = Date.now() - startTime;
    const avgTimePerFile = elapsed / completed;
    const remaining = total - completed;
    
    return Math.round((remaining * avgTimePerFile) / 1000); // seconds
  }

  private async calculateTotalSizeVerified(userId: number): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT COALESCE(SUM(file_size_bytes), 0) as total_size
        FROM vod_file_states vfs
        JOIN vods v ON vfs.vod_id = v.id
        JOIN tasks t ON v.task_id = t.id
        WHERE t.user_id = $1
          AND vfs.file_state = 'present'
          AND vfs.file_size_bytes > 0
      `, [userId]);

      return parseInt(result.rows[0]?.total_size) || 0;
    } finally {
      client.release();
    }
  }

  private createEmptyStats(): VerificationStats {
    return {
      totalVerified: 0,
      successfulVerifications: 0,
      failedVerifications: 0,
      filesPresent: 0,
      filesMissing: 0,
      filesCorrupted: 0,
      totalSizeVerified: 0,
      averageVerificationTime: 0,
      lastVerificationRun: null
    };
  }

  /**
   * Check if verification is currently running
   */
  public isVerificationRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Stop any running verification
   */
  public async stopVerification(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping file verification...');
    this.isRunning = false;
    
    // Wait for current batch to complete
    if (this.currentBatch) {
      await this.currentBatch;
    }
    
    // Clear worker pool
    this.workerPool.clear();
    
    logger.info('File verification stopped');
    this.emit('verification:stopped');
  }
}

export default FileVerificationService;
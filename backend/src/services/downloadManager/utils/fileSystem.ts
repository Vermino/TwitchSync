// Filepath: backend/src/services/downloadManager/utils/fileSystem.ts

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../../../utils/logger';

export class FileSystemManager {
  constructor(private tempDir: string) {}

  async createTempDirectory(vodId: string): Promise<string> {
    const tempPath = path.join(this.tempDir, `vod-${vodId}`);
    await fs.mkdir(tempPath, { recursive: true });
    return tempPath;
  }

  async createDownloadDirectory(basePath: string, username: string, date: string, vodId: string): Promise<string> {
    const downloadPath = path.join(basePath, username, date, vodId);
    await fs.mkdir(downloadPath, { recursive: true });
    return downloadPath;
  }

  async writeMetadata(outputPath: string, metadata: any): Promise<void> {
    await fs.writeFile(
      path.join(outputPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
  }

  async cleanupDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      logger.error(`Error cleaning up directory ${dirPath}:`, error);
      throw error;
    }
  }

  async getDirectorySize(dirPath: string): Promise<number> {
    const files = await fs.readdir(dirPath);
    let size = 0;

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        size += await this.getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }

    return size;
  }

  async cleanupOldFiles(directory: string, maxAgeHours: number): Promise<void> {
    const files = await fs.readdir(directory);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(directory, file);
      try {
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          if (stats.isDirectory()) {
            await fs.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.unlink(filePath);
          }
          logger.info(`Cleaned up old file: ${file}`);
        }
      } catch (error) {
        logger.error(`Error cleaning up file ${file}:`, error);
      }
    }
  }

  async ensureDirectoryExists(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

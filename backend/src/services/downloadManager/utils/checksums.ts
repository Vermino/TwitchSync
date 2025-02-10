// Filepath: backend/src/services/downloadManager/utils/checksums.ts

import crypto from 'crypto';
import { createReadStream } from 'fs';
import { logger } from '../../../utils/logger';

export class Checksums {
  static async calculateMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (error) => {
        logger.error(`Error calculating MD5 for file ${filePath}:`, error);
        reject(error);
      });
    });
  }

  static async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const actualChecksum = await this.calculateMD5(filePath);
      return actualChecksum === expectedChecksum;
    } catch (error) {
      logger.error(`Error verifying checksum for file ${filePath}:`, error);
      throw error;
    }
  }

  static async calculateFileHashes(filePath: string): Promise<{
    md5: string;
    sha256: string;
  }> {
    return new Promise((resolve, reject) => {
      const md5Hash = crypto.createHash('md5');
      const sha256Hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => {
        md5Hash.update(data);
        sha256Hash.update(data);
      });

      stream.on('end', () => {
        resolve({
          md5: md5Hash.digest('hex'),
          sha256: sha256Hash.digest('hex')
        });
      });

      stream.on('error', (error) => {
        logger.error(`Error calculating hashes for file ${filePath}:`, error);
        reject(error);
      });
    });
  }

  static async verifyFileIntegrity(
    filePath: string,
    checksums: { md5?: string; sha256?: string }
  ): Promise<boolean> {
    try {
      const hashes = await this.calculateFileHashes(filePath);

      if (checksums.md5 && hashes.md5 !== checksums.md5) {
        logger.warn(`MD5 mismatch for file ${filePath}`);
        return false;
      }

      if (checksums.sha256 && hashes.sha256 !== checksums.sha256) {
        logger.warn(`SHA256 mismatch for file ${filePath}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Error verifying file integrity for ${filePath}:`, error);
      throw error;
    }
  }
}

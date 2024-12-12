import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

interface MediaServerConfig {
  basePath: string;
  organization: 'by_channel' | 'by_game';
  minSpace: number; // Minimum free space in bytes
}

class MediaServerService {
  private pool: Pool;
  private config: MediaServerConfig;
  private static instance: MediaServerService;

  private constructor(pool: Pool, config: MediaServerConfig) {
    this.pool = pool;
    this.config = config;

    // Ensure base directories exist
    this.ensureDirectoryStructure();
  }

  public static getInstance(pool: Pool, config: MediaServerConfig): MediaServerService {
    if (!MediaServerService.instance) {
      MediaServerService.instance = new MediaServerService(pool, config);
    }
    return MediaServerService.instance;
  }

  private ensureDirectoryStructure(): void {
    const baseDirs = ['channels', 'games', 'metadata'];

    for (const dir of baseDirs) {
      const fullPath = path.join(this.config.basePath, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  private async getVodMetadata(vodId: number): Promise<any> {
    const result = await this.pool.query(
      `SELECT v.*, c.username as channel_name, g.name as game_name 
       FROM vods v 
       LEFT JOIN channels c ON v.channel_id = c.id 
       LEFT JOIN tracked_games g ON v.game_id = g.twitch_game_id 
       WHERE v.id = $1`,
      [vodId]
    );

    if (result.rows.length === 0) {
      throw new Error(`VOD ${vodId} not found`);
    }

    return result.rows[0];
  }

  private generateFilename(metadata: any): string {
    const date = new Date(metadata.created_at)
      .toISOString()
      .split('T')[0];

    const sanitizedTitle = metadata.title
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .substring(0, 100);

    return `${date}_${sanitizedTitle}.mp4`;
  }

  private async checkDiskSpace(required: number): Promise<void> {
    // Implementation would depend on the OS and file system
    // This is a simplified version
    const stats = fs.statfsSync(this.config.basePath);
    const available = stats.bavail * stats.bsize;

    if (available < Math.max(required, this.config.minSpace)) {
      throw new Error('Insufficient disk space');
    }
  }

  async organizeVOD(vodId: number, tempPath: string): Promise<string> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get VOD metadata
      const metadata = await this.getVodMetadata(vodId);
      const filename = this.generateFilename(metadata);

      // Check disk space
      const fileSize = fs.statSync(tempPath).size;
      await this.checkDiskSpace(fileSize);

      // Determine target paths based on organization type
      let finalPath: string;
      let metadataPath: string;

      if (this.config.organization === 'by_channel') {
        const channelDir = path.join(
          this.config.basePath,
          'channels',
          metadata.channel_name
        );
        fs.mkdirSync(channelDir, { recursive: true });

        if (metadata.game_name) {
          const gameDir = path.join(channelDir, metadata.game_name);
          fs.mkdirSync(gameDir, { recursive: true });
          finalPath = path.join(gameDir, filename);
        } else {
          finalPath = path.join(channelDir, filename);
        }
      } else {
        // by_game organization
        const gameDir = path.join(
          this.config.basePath,
          'games',
          metadata.game_name || 'unidentified'
        );
        fs.mkdirSync(gameDir, { recursive: true });

        const channelDir = path.join(gameDir, metadata.channel_name);
        fs.mkdirSync(channelDir, { recursive: true });
        finalPath = path.join(channelDir, filename);
      }

      // Move file to final location
      fs.renameSync(tempPath, finalPath);

      // Create metadata JSON file
      metadataPath = finalPath.replace('.mp4', '.json');
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({
          vodId: metadata.id,
          twitchVodId: metadata.twitch_vod_id,
          channel: metadata.channel_name,
          game: metadata.game_name,
          title: metadata.title,
          duration: metadata.duration,
          viewCount: metadata.view_count,
          createdAt: metadata.created_at,
          publishedAt: metadata.published_at,
          type: metadata.type,
          originalUrl: metadata.url,
          processedAt: new Date().toISOString()
        }, null, 2)
      );

      // Update database with final path
      await client.query(
        `UPDATE vod_downloads 
         SET download_path = $1, 
             metadata_path = $2 
         WHERE vod_id = $3`,
        [finalPath, metadataPath, vodId]
      );

      await client.query('COMMIT');
      return finalPath;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error organizing VOD ${vodId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async scanLibrary(): Promise<{
    totalFiles: number;
    totalSize: number;
    channels: string[];
    games: string[];
  }> {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      channels: new Set<string>(),
      games: new Set<string>()
    };

    const scanDir = (dir: string) => {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scanDir(fullPath);

          // Collect channel and game names based on directory structure
          if (dir.includes('/channels/')) {
            stats.channels.add(item);
          } else if (dir.includes('/games/')) {
            stats.games.add(item);
          }
        } else if (stat.isFile() && path.extname(fullPath) === '.mp4') {
          stats.totalFiles++;
          stats.totalSize += stat.size;
        }
      }
    };

    scanDir(this.config.basePath);

    return {
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
      channels: Array.from(stats.channels),
      games: Array.from(stats.games)
    };
  }

  async cleanup(maxAgeDays: number = 30): Promise<void> {
    try {
      const maxAge = maxAgeDays * 24 * 60 * 60 * 1000; // Convert to milliseconds
      const now = Date.now();

      const scanAndCleanDir = (dir: string) => {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            scanAndCleanDir(fullPath);

            // Remove empty directories
            if (fs.readdirSync(fullPath).length === 0) {
              fs.rmdirSync(fullPath);
            }
          } else if (stat.isFile() && now - stat.mtimeMs > maxAge) {
            // Remove old files
            fs.unlinkSync(fullPath);

            // Remove associated metadata file
            const metadataPath = fullPath.replace('.mp4', '.json');
            if (fs.existsSync(metadataPath)) {
              fs.unlinkSync(metadataPath);
            }

            logger.info(`Cleaned up old file: ${fullPath}`);
          }
        }
      };

      scanAndCleanDir(this.config.basePath);
    } catch (error) {
      logger.error('Error cleaning up media server:', error);
      throw error;
    }
  }

  async getLibraryStats(): Promise<any> {
    try {
      const stats = await this.scanLibrary();
      const spaceInfo = fs.statfsSync(this.config.basePath);

      return {
        ...stats,
        freeSpace: spaceInfo.bavail * spaceInfo.bsize,
        totalSpace: spaceInfo.blocks * spaceInfo.bsize,
        usedSpace: (spaceInfo.blocks - spaceInfo.bfree) * spaceInfo.bsize
      };
    } catch (error) {
      logger.error('Error getting library stats:', error);
      throw error;
    }
  }
}

export default MediaServerService;

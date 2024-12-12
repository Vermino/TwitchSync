import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import type { VOD } from '../../types/database';

export class VODScanner {
  constructor(private pool: Pool, private watchPath: string) {}

  // Watch for new VODs downloaded by TwitchLeecherDX
  async watchForNewVODs(): Promise<void> {
    try {
      // Create watcher for the download directory
      fs.watch(this.watchPath, { recursive: true }, async (event, filename) => {
        if (event === 'rename' && filename.endsWith('.mp4')) {
          await this.processNewVOD(filename);
        }
      });

      logger.info(`Watching for VODs in ${this.watchPath}`);
    } catch (error) {
      logger.error('Error setting up VOD watch:', error);
      throw error;
    }
  }

  // Process newly downloaded VOD
  private async processNewVOD(filename: string): Promise<void> {
    const fullPath = path.join(this.watchPath, filename);

    try {
      // Extract VOD info from filename
      // TwitchLeecherDX default template: {id}_{title}
      const match = filename.match(/^(\d+)_(.+)\.mp4$/);
      if (!match) {
        logger.warn(`Invalid VOD filename format: ${filename}`);
        return;
      }

      const [_, vodId, title] = match;

      // Check if VOD already exists in database
      const exists = await this.pool.query(
        'SELECT id FROM vods WHERE twitch_vod_id = $1',
        [vodId]
      );

      if (exists.rows.length > 0) {
        logger.info(`VOD ${vodId} already exists in database`);
        return;
      }

      // Add VOD to database
      await this.pool.query(
        `INSERT INTO vods (
          twitch_vod_id, title, file_path,
          processed_at, status
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'pending')`,
        [vodId, title, fullPath]
      );

      logger.info(`Added new VOD to database: ${vodId} - ${title}`);
    } catch (error) {
      logger.error(`Error processing new VOD ${filename}:`, error);
    }
  }

  // Initial scan of existing VODs
  async scanExistingVODs(): Promise<void> {
    try {
      const files = fs.readdirSync(this.watchPath);

      for (const file of files) {
        if (file.endsWith('.mp4')) {
          await this.processNewVOD(file);
        }
      }
    } catch (error) {
      logger.error('Error scanning existing VODs:', error);
      throw error;
    }
  }
}

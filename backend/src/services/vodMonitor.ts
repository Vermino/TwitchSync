import { Pool } from 'pg';
import TwitchAPIService from './twitch';
import { logger } from '../utils/logger';

class VODMonitorService {
  private pool: Pool;
  private twitchAPI: TwitchAPIService;
  private static instance: VODMonitorService;

  private constructor(pool: Pool) {
    this.pool = pool;
    this.twitchAPI = TwitchAPIService.getInstance();
  }

  public static getInstance(pool: Pool): VODMonitorService {
    if (!VODMonitorService.instance) {
      VODMonitorService.instance = new VODMonitorService(pool);
    }
    return VODMonitorService.instance;
  }

  async checkChannelVODs(channelId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get channel info from database
      const channelResult = await client.query(
        'SELECT twitch_id, username FROM channels WHERE id = $1',
        [channelId]
      );

      if (channelResult.rows.length === 0) {
        throw new Error(`Channel with ID ${channelId} not found`);
      }

      const channel = channelResult.rows[0];

      // Fetch VODs from Twitch
      const vods = await this.twitchAPI.getChannelVODs(channel.twitch_id);

      // Process each VOD
      for (const vod of vods) {
        // Check if VOD already exists
        const existingVod = await client.query(
          'SELECT id FROM vods WHERE twitch_vod_id = $1',
          [vod.id]
        );

        if (existingVod.rows.length === 0) {
          // Insert new VOD
          await client.query(
            `INSERT INTO vods (
              twitch_vod_id, channel_id, title, duration,
              view_count, created_at, published_at, type,
              url, thumbnail_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              vod.id,
              channelId,
              vod.title,
              vod.duration,
              vod.view_count,
              vod.created_at,
              vod.published_at,
              vod.type,
              vod.url,
              vod.thumbnail_url,
            ]
          );

          logger.info(`Added new VOD: ${vod.id} for channel ${channel.username}`);
        }
      }

      // Update last VOD check timestamp
      await client.query(
        'UPDATE channels SET last_vod_check = CURRENT_TIMESTAMP WHERE id = $1',
        [channelId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error checking VODs for channel ${channelId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async checkAllChannels(): Promise<void> {
    try {
      // Get all active channels
      const result = await this.pool.query(
        'SELECT id FROM channels WHERE is_active = true'
      );

      // Check VODs for each channel
      for (const channel of result.rows) {
        try {
          await this.checkChannelVODs(channel.id);
        } catch (error) {
          logger.error(`Failed to check VODs for channel ${channel.id}:`, error);
          // Continue with next channel even if one fails
          continue;
        }
      }
    } catch (error) {
      logger.error('Error in checkAllChannels:', error);
      throw error;
    }
  }

  async startMonitoring(intervalMinutes: number = 15): Promise<void> {
    logger.info(`Starting VOD monitoring with ${intervalMinutes} minute interval`);

    setInterval(async () => {
      try {
        await this.checkAllChannels();
      } catch (error) {
        logger.error('Error in VOD monitoring interval:', error);
      }
    }, intervalMinutes * 60 * 1000);

    // Run initial check
    try {
      await this.checkAllChannels();
    } catch (error) {
      logger.error('Error in initial VOD check:', error);
    }
  }
}

export default VODMonitorService;

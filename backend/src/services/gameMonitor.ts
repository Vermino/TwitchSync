// backend/src/services/gameMonitor.ts

import { Pool } from 'pg';
import { TwitchService } from './twitch/service';
import { logger } from '../utils/logger';

class GameMonitorService {
  private pool: Pool;
  private twitchAPI: TwitchService;
  private static instance: GameMonitorService;

  private constructor(pool: Pool) {
    this.pool = pool;
    this.twitchAPI = TwitchService.getInstance();
  }

  public static getInstance(pool: Pool): GameMonitorService {
    if (!GameMonitorService.instance) {
      GameMonitorService.instance = new GameMonitorService(pool);
    }
    return GameMonitorService.instance;
  }

  async checkChannelGame(channelId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get channel info from database
      const channelResult = await client.query(
        'SELECT id, twitch_id, username, current_game_id FROM channels WHERE id = $1',
        [channelId]
      );

      if (channelResult.rows.length === 0) {
        throw new Error(`Channel with ID ${channelId} not found`);
      }

      const channel = channelResult.rows[0];

      // Get current game from Twitch
      const currentGameId = await this.twitchAPI.getCurrentGame(channel.twitch_id);

      // If game has changed, record the change
      if (currentGameId !== channel.current_game_id) {
        // Record game change in history
        await client.query(
          `INSERT INTO channel_game_history (
            channel_id, game_id, first_played, last_played,
            total_hours, stream_count, avg_viewers
          ) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 1, 0)
          ON CONFLICT (channel_id, game_id) 
          DO UPDATE SET 
            last_played = CURRENT_TIMESTAMP,
            stream_count = channel_game_history.stream_count + 1`,
          [channelId, currentGameId]
        );

        // Update channel's current game
        await client.query(
          'UPDATE channels SET current_game_id = $1, last_game_check = CURRENT_TIMESTAMP WHERE id = $2',
          [currentGameId, channelId]
        );

        // Update any active VODs with the new game ID
        if (currentGameId) {
          await client.query(
            `UPDATE vods 
             SET game_id = $1,
                 category_tags = ARRAY(
                   SELECT name FROM games WHERE id = $1
                 )
             WHERE channel_id = $2 
             AND status = 'pending'
             AND download_status IN ('downloading', 'queued')`,
            [currentGameId, channelId]
          );

          // Check if this is a premiere event (first time playing this game)
          const premiereCheck = await client.query(
            `SELECT id FROM channel_game_history 
             WHERE channel_id = $1 AND game_id = $2`,
            [channelId, currentGameId]
          );

          if (premiereCheck.rows.length === 1) {
            // This is the first time playing this game
            await client.query(
              `INSERT INTO premiere_events (
                channel_id, game_id, event_type, confidence_score,
                detected_at, predicted_start, metadata
              ) VALUES ($1, $2, 'NEW_GAME', 1.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)`,
              [
                channelId,
                currentGameId,
                {
                  previous_game: channel.current_game_id,
                  detection_method: 'game_change'
                }
              ]
            );

            // Check user preferences for auto-recording premieres
            const userPrefs = await client.query(
              `SELECT uvp.* FROM user_vod_preferences uvp
               WHERE uvp.channel_id = $1 AND uvp.auto_download = true`,
              [channelId]
            );

            // Create VOD entries for users who want to auto-record premieres
            for (const pref of userPrefs.rows) {
              await client.query(
                `UPDATE vods
                 SET download_status = 'queued',
                     download_priority = $1,
                     content_type = 'premiere',
                     scheduled_for = CURRENT_TIMESTAMP
                 WHERE channel_id = $2
                 AND status = 'pending'
                 AND user_id = $3`,
                [pref.download_priority, channelId, pref.user_id]
              );
            }
          }
        }

        logger.info(
          `Game change detected for channel ${channel.username}: ${channel.current_game_id} -> ${currentGameId}`
        );
      } else {
        // Update last check timestamp even if game hasn't changed
        await client.query(
          'UPDATE channels SET last_game_check = CURRENT_TIMESTAMP WHERE id = $1',
          [channelId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error checking game for channel ${channelId}:`, error);
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

      // Check game for each channel
      for (const channel of result.rows) {
        try {
          await this.checkChannelGame(channel.id);
        } catch (error) {
          logger.error(`Failed to check game for channel ${channel.id}:`, error);
          // Continue with next channel even if one fails
          continue;
        }
      }
    } catch (error) {
      logger.error('Error in checkAllChannels:', error);
      throw error;
    }
  }

  async updateTrackedGameInfo(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get all active tracked games
      const gamesResult = await client.query(
        'SELECT id, twitch_game_id, name FROM games WHERE is_active = true'
      );

      for (const game of gamesResult.rows) {
        try {
          // Get updated game info from Twitch
          const gameInfo = await this.twitchAPI.getGameById(game.twitch_game_id);

          if (gameInfo && gameInfo.name !== game.name) {
            // Update game name if it has changed
            await client.query(
              'UPDATE games SET name = $1, last_checked = CURRENT_TIMESTAMP WHERE id = $2',
              [gameInfo.name, game.id]
            );

            // Update any VODs with this game to use the new name in category tags
            await client.query(
              `UPDATE vods 
               SET category_tags = array_replace(category_tags, $1, $2)
               WHERE game_id = $3`,
              [game.name, gameInfo.name, game.id]
            );

            logger.info(`Updated game name for ${game.twitch_game_id}: ${game.name} -> ${gameInfo.name}`);
          } else {
            // Update last checked timestamp
            await client.query(
              'UPDATE games SET last_checked = CURRENT_TIMESTAMP WHERE id = $1',
              [game.id]
            );
          }
        } catch (error) {
          logger.error(`Error updating game info for game ${game.twitch_game_id}:`, error);
          continue;
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in updateTrackedGameInfo:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async startMonitoring(
    gameCheckIntervalMinutes: number = 5,
    gameInfoUpdateIntervalHours: number = 24
  ): Promise<void> {
    logger.info(`Starting game monitoring with ${gameCheckIntervalMinutes} minute interval`);

    // Set up game check interval
    setInterval(async () => {
      try {
        await this.checkAllChannels();
      } catch (error) {
        logger.error('Error in game monitoring interval:', error);
      }
    }, gameCheckIntervalMinutes * 60 * 1000);

    // Set up game info update interval
    setInterval(async () => {
      try {
        await this.updateTrackedGameInfo();
      } catch (error) {
        logger.error('Error in game info update interval:', error);
      }
    }, gameInfoUpdateIntervalHours * 60 * 60 * 1000);

    // Run initial checks
    try {
      await this.checkAllChannels();
      await this.updateTrackedGameInfo();
    } catch (error) {
      logger.error('Error in initial game checks:', error);
    }
  }
}

export default GameMonitorService;

import { Pool } from 'pg';
import TwitchAPIService from './twitch';
import { logger } from '../utils/logger';

class GameMonitorService {
  private pool: Pool;
  private twitchAPI: TwitchAPIService;
  private static instance: GameMonitorService;

  private constructor(pool: Pool) {
    this.pool = pool;
    this.twitchAPI = TwitchAPIService.getInstance();
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
        // Record game change
        await client.query(
          `INSERT INTO game_changes (
            channel_id, previous_game_id, new_game_id
          ) VALUES ($1, $2, $3)`,
          [channelId, channel.current_game_id, currentGameId]
        );

        // Update channel's current game
        await client.query(
          'UPDATE channels SET current_game_id = $1, last_game_check = CURRENT_TIMESTAMP WHERE id = $2',
          [currentGameId, channelId]
        );

        // If new game is tracked, process VOD segments
        if (currentGameId) {
          const trackedGame = await client.query(
            'SELECT id FROM tracked_games WHERE twitch_game_id = $1 AND is_active = true',
            [currentGameId]
          );

          if (trackedGame.rows.length > 0) {
            // Update VOD information if game is tracked
            await this.updateVODGameInfo(client, channelId, currentGameId);
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

  private async updateVODGameInfo(
    client: any,
    channelId: number,
    gameId: string
  ): Promise<void> {
    try {
      // Get the latest VOD for the channel
      const vodResult = await client.query(
        `SELECT id FROM vods 
         WHERE channel_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [channelId]
      );

      if (vodResult.rows.length > 0) {
        // Update the VOD with the game information
        await client.query(
          'UPDATE vods SET game_id = $1 WHERE id = $2',
          [gameId, vodResult.rows[0].id]
        );
      }
    } catch (error) {
      logger.error('Error updating VOD game info:', error);
      throw error;
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
        'SELECT id, twitch_game_id, name FROM tracked_games WHERE is_active = true'
      );

      for (const game of gamesResult.rows) {
        try {
          // Get updated game info from Twitch
          const gameInfo = await this.twitchAPI.getGame(game.twitch_game_id);

          if (gameInfo && gameInfo.name !== game.name) {
            // Update game name if it has changed
            await client.query(
              'UPDATE tracked_games SET name = $1, last_checked = CURRENT_TIMESTAMP WHERE id = $2',
              [gameInfo.name, game.id]
            );

            logger.info(`Updated game name for ${game.twitch_game_id}: ${game.name} -> ${gameInfo.name}`);
          } else {
            // Update last checked timestamp
            await client.query(
              'UPDATE tracked_games SET last_checked = CURRENT_TIMESTAMP WHERE id = $1',
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

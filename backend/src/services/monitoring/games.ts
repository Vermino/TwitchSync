import { Pool } from 'pg';
import { twitchClient } from '../twitch/client';
import { logger } from '../../utils/logger';

class GameMonitor {
  private pool: Pool;
  private static instance: GameMonitor;

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  public static getInstance(pool: Pool): GameMonitor {
    if (!GameMonitor.instance) {
      GameMonitor.instance = new GameMonitor(pool);
    }
    return GameMonitor.instance;
  }

  async checkGame(gameId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get game info
      const gameResult = await client.query(
        'SELECT id, twitch_game_id, name FROM tracked_games WHERE id = $1',
        [gameId]
      );

      if (gameResult.rows.length === 0) {
        throw new Error(`Game ${gameId} not found`);
      }

      const game = gameResult.rows[0];

      // Get updated game info from Twitch
      const twitchGame = await twitchClient.getGame(game.twitch_game_id);

      if (twitchGame && twitchGame.name !== game.name) {
        // Update game name if it changed
        await client.query(
          'UPDATE tracked_games SET name = $1, last_checked = CURRENT_TIMESTAMP WHERE id = $2',
          [twitchGame.name, gameId]
        );

        logger.info(`Updated game name: ${game.name} -> ${twitchGame.name}`);
      } else {
        // Update last checked timestamp
        await client.query(
          'UPDATE tracked_games SET last_checked = CURRENT_TIMESTAMP WHERE id = $1',
          [gameId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error checking game ${gameId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async checkAllGames(): Promise<void> {
    try {
      const result = await this.pool.query(
        'SELECT id FROM tracked_games WHERE is_active = true'
      );

      for (const game of result.rows) {
        try {
          await this.checkGame(game.id);
        } catch (error) {
          logger.error(`Failed to check game ${game.id}:`, error);
          continue;
        }
      }
    } catch (error) {
      logger.error('Error checking all games:', error);
      throw error;
    }
  }

  async startMonitoring(intervalHours: number = 24): Promise<void> {
    logger.info(`Starting game monitoring with ${intervalHours} hour interval`);

    setInterval(async () => {
      try {
        await this.checkAllGames();
      } catch (error) {
        logger.error('Error in game monitoring interval:', error);
      }
    }, intervalHours * 60 * 60 * 1000);

    // Run initial check
    try {
      await this.checkAllGames();
    } catch (error) {
      logger.error('Error in initial game check:', error);
    }
  }

  async trackGameChanges(channelId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get channel info
      const channelResult = await client.query(
        'SELECT twitch_id, current_game_id FROM channels WHERE id = $1',
        [channelId]
      );

      if (channelResult.rows.length === 0) {
        throw new Error(`Channel ${channelId} not found`);
      }

      const channel = channelResult.rows[0];

      // Get current game from Twitch
      const currentGameId = await twitchClient.getCurrentGame(channel.twitch_id);

      // If game has changed
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

        logger.info(`Game change detected for channel ${channelId}: ${channel.current_game_id} -> ${currentGameId}`);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error tracking game changes for channel ${channelId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const gameMonitor = (pool: Pool) => GameMonitor.getInstance(pool);
export default gameMonitor;

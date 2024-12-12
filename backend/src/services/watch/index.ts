import { Pool } from 'pg';
import { logger } from '../../utils/logger';

interface WatchConfig {
  channels: string[];
  games: string[];
  historyDays: number;
  syncForward: boolean;
}

export class WatchService {
  constructor(private pool: Pool) {}

  async configureWatch(config: WatchConfig): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Add channels to watch
      for (const channel of config.channels) {
        await client.query(
          `INSERT INTO channels (twitch_id, username, is_active)
           VALUES ($1, $2, $3)
           ON CONFLICT (twitch_id) DO UPDATE
           SET is_active = $3`,
          [channel, channel, true]
        );
      }

      // Add games to watch
      for (const game of config.games) {
        await client.query(
          `INSERT INTO tracked_games (twitch_game_id, name, is_active)
           VALUES ($1, $2, $3)
           ON CONFLICT (twitch_game_id) DO UPDATE
           SET is_active = $3`,
          [game, game, true]
        );
      }

      // If history sync is enabled, store configuration
      if (config.historyDays > 0) {
        await client.query(
          `INSERT INTO sync_history_config (days_to_sync, created_at)
           VALUES ($1, NOW())`,
          [config.historyDays]
        );
      }

      await client.query('COMMIT');
      logger.info('Watch configuration saved successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to save watch configuration:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getActiveWatches(): Promise<{
    channels: string[];
    games: string[];
  }> {
    try {
      const [channelsResult, gamesResult] = await Promise.all([
        this.pool.query('SELECT twitch_id FROM channels WHERE is_active = true'),
        this.pool.query('SELECT twitch_game_id FROM tracked_games WHERE is_active = true')
      ]);

      return {
        channels: channelsResult.rows.map(row => row.twitch_id),
        games: gamesResult.rows.map(row => row.twitch_game_id)
      };
    } catch (error) {
      logger.error('Failed to get active watches:', error);
      throw error;
    }
  }
}

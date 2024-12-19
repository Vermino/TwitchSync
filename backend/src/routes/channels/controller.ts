// Filepath: backend/src/routes/channels/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { validateChannelData } from './validation';
import { twitchAPI } from '../../services/twitch/api';

// Helper function to get error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

export class ChannelsController {
  constructor(private pool: Pool) {}

  searchChannels = async (req: Request, res: Response): Promise<void> => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const channels = await twitchAPI.searchChannels(query);
      res.json(channels);
    } catch (error) {
      logger.error('Error searching channels:', error);
      res.status(500).json({ error: 'Failed to search channels' });
    }
  };

  getAllChannels = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.pool.query(`
        WITH channel_premieres AS (
          SELECT 
            ch.channel_id,
            jsonb_agg(
              jsonb_build_object(
                'game', jsonb_build_object(
                  'id', g3.id,
                  'name', g3.name,
                  'box_art_url', g3.box_art_url
                ),
                'date', ch.started_at,
                'duration', ch.duration,
                'viewers', ch.peak_viewers
              ) ORDER BY ch.started_at DESC
            ) FILTER (WHERE ch.is_premiere = true) AS premiere_data
          FROM channel_game_history ch
          JOIN games g3 ON ch.game_id = g3.id
          GROUP BY ch.channel_id
        ),
        channel_most_played AS (
          SELECT DISTINCT ON (channel_id)
            channel_id,
            jsonb_build_object(
              'id', g2.id,
              'name', g2.name,
              'box_art_url', g2.box_art_url,
              'hours', EXTRACT(EPOCH FROM total_time)/3600
            ) as game_data
          FROM channel_game_stats stats
          JOIN games g2 ON stats.game_id = g2.id
          ORDER BY channel_id, total_time DESC
        )
        SELECT 
          c.*,
          g.id as last_game_id,
          g.name as last_game_name,
          g.box_art_url as last_game_box_art,
          stats.total_streams,
          stats.total_time,
          cmp.game_data as most_played_game,
          cp.premiere_data as premieres
        FROM channels c
        LEFT JOIN games g ON c.last_stream_game_id = g.id
        LEFT JOIN channel_game_stats stats ON c.id = stats.channel_id
        LEFT JOIN channel_most_played cmp ON c.id = cmp.channel_id
        LEFT JOIN channel_premieres cp ON c.id = cp.channel_id
        ORDER BY c.follower_count DESC
      `);

      // Transform the results to ensure premieres is always an array
      const transformedResults = result.rows.map(row => ({
        ...row,
        premieres: row.premieres || []
      }));

      res.json(transformedResults);
    } catch (error) {
      logger.error('Error fetching channels:', error);
      res.status(500).json({
        error: 'Failed to fetch channels',
        details: getErrorMessage(error)
      });
    }
  };

  addChannel = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const channelData = req.body;
      console.log('Processing channel for creation:', channelData);

      // Check required fields
      if (!channelData.twitch_id || !channelData.username) {
        res.status(400).json({ error: 'twitch_id and username are required' });
        return;
      }

      // Validate input data
      const validationError = validateChannelData(channelData);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      // Check for existing channel
      const existingChannel = await client.query(
        'SELECT id FROM channels WHERE twitch_id = $1',
        [channelData.twitch_id]
      );

      if (existingChannel.rows.length > 0) {
        res.status(409).json({ error: 'Channel already exists' });
        return;
      }

      // Get fresh follower count from Twitch
      try {
        const followerCount = await twitchAPI.getChannelFollowers(channelData.twitch_id);
        channelData.follower_count = followerCount;
      } catch (error) {
        logger.warn(`Could not fetch follower count for channel ${channelData.username}:`, error);
        // Continue with provided follower count or 0
        channelData.follower_count = channelData.follower_count || 0;
      }

      // Insert new channel
      const result = await client.query(`
        INSERT INTO channels (
          twitch_id,
          username,
          display_name,
          profile_image_url,
          description,
          follower_count,
          is_active,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          channelData.twitch_id,
          channelData.username,
          channelData.display_name || channelData.username,
          channelData.profile_image_url,
          channelData.description,
          channelData.follower_count,
          true
        ]
      );

      await client.query('COMMIT');
      logger.info(`Channel created successfully: ${channelData.username}`);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding channel:', error);
      res.status(500).json({
        error: 'Failed to add channel',
        details: getErrorMessage(error)
      });
    } finally {
      client.release();
    }
  };

  async updateFollowerCounts(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const channels = await client.query('SELECT twitch_id, username FROM channels');

      for (const channel of channels.rows) {
        try {
          const followerCount = await twitchAPI.getChannelFollowers(channel.twitch_id);
          await client.query(
            'UPDATE channels SET follower_count = $1, updated_at = CURRENT_TIMESTAMP WHERE twitch_id = $2',
            [followerCount, channel.twitch_id]
          );
        } catch (error) {
          logger.error(`Failed to update follower count for channel ${channel.username}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error updating follower counts:', error);
    } finally {
      client.release();
    }
  }

  updateChannel = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { is_active, current_game_id } = req.body;

      const result = await client.query(`
        UPDATE channels 
        SET 
          is_active = COALESCE($1, is_active),
          current_game_id = COALESCE($2, current_game_id),
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = $3 
        RETURNING *`,
        [is_active, current_game_id, id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating channel:', error);
      res.status(500).json({
        error: 'Failed to update channel',
        details: getErrorMessage(error)
      });
    } finally {
      client.release();
    }
  };

  deleteChannel = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Delete channel and related data
      const result = await client.query(`
        WITH deleted_channel AS (
          DELETE FROM channels
          WHERE id = $1
          RETURNING *
        )
        SELECT COUNT(*) > 0 as deleted FROM deleted_channel
      `, [id]);

      if (!result.rows[0].deleted) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      await client.query('COMMIT');
      res.json({ message: 'Channel deleted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error deleting channel:', error);
      res.status(500).json({
        error: 'Failed to delete channel',
        details: getErrorMessage(error)
      });
    } finally {
      client.release();
    }
  };
}

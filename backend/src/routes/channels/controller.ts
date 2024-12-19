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
        WITH first_premieres AS (
          SELECT DISTINCT ON (channel_id) 
            channel_id,
            game_id,
            started_at,
            duration,
            peak_viewers
          FROM channel_game_history
          WHERE is_premiere = true
          ORDER BY channel_id, started_at ASC
        ),
        channel_premieres AS (
          SELECT 
            fp.channel_id,
            jsonb_build_object(
              'game', jsonb_build_object(
                'id', g.id,
                'name', g.name,
                'box_art_url', g.box_art_url
              ),
              'date', fp.started_at,
              'duration', fp.duration,
              'viewers', fp.peak_viewers
            ) as premiere_data
          FROM first_premieres fp
          JOIN games g ON fp.game_id = g.id
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
        ),
        last_stream AS (
          SELECT DISTINCT ON (channel_id)
            channel_id,
            game_id,
            started_at as last_stream_date,
            COALESCE(is_live, false) as is_live
          FROM channel_game_history
          ORDER BY channel_id, started_at DESC
        )
        SELECT 
          c.*,
          COALESCE(ls.is_live, false) as is_live,
          ls.last_stream_date,
          g.id as last_game_id,
          g.name as last_game_name,
          g.box_art_url as last_game_box_art,
          cmp.game_data as most_played_game,
          CASE 
            WHEN cp.premiere_data IS NOT NULL 
            THEN ARRAY[cp.premiere_data] 
            ELSE ARRAY[]::jsonb[] 
          END as premieres
        FROM channels c
        LEFT JOIN last_stream ls ON c.id = ls.channel_id
        LEFT JOIN games g ON ls.game_id = g.id
        LEFT JOIN channel_most_played cmp ON c.id = cmp.channel_id
        LEFT JOIN channel_premieres cp ON c.id = cp.channel_id
        ORDER BY c.follower_count DESC
      `);

      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching channels:', error);
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  };

  async addChannel(req: Request, res: Response): Promise<void> {
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
        console.log(`Fetched follower count for ${channelData.username}:`, followerCount);
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
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      client.release();
    }
  }

  updateChannel = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { is_active } = req.body;

      const result = await client.query(`
        UPDATE channels 
        SET 
          is_active = COALESCE($1, is_active),
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2 
        RETURNING *`,
        [is_active, id]
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

      // First delete related records from dependent tables
      await client.query(`
        DELETE FROM channel_game_history WHERE channel_id = $1;
        DELETE FROM channel_game_stats WHERE channel_id = $1;
      `, [req.params.id]);

      // Then delete the channel
      const result = await client.query(`
        DELETE FROM channels
        WHERE id = $1
        RETURNING id
      `, [req.params.id]);

      if (result.rows.length === 0) {
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

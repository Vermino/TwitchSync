// backend/src/routes/channels/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { Channel, CreateChannelRequest, UpdateChannelRequest } from '../../types/database';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    twitch_id?: string;
  };
}

export class ChannelController {
  constructor(private pool: Pool) {}

  async getChannels(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const result = await client.query<Channel>(
        'SELECT * FROM channels ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } catch (error) {
      logger.error('Error getting channels:', error);
      res.status(500).json({ error: 'Failed to get channels' });
    } finally {
      client.release();
    }
  }

  async getChannel(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const { id } = req.params;
      const result = await client.query<Channel>(
        'SELECT * FROM channels WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error getting channel:', error);
      res.status(500).json({ error: 'Failed to get channel' });
    } finally {
      client.release();
    }
  }

  async createChannel(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const channelData: CreateChannelRequest = req.body;

      // Check if channel already exists
      const existingChannel = await client.query(
        'SELECT id FROM channels WHERE twitch_id = $1',
        [channelData.twitch_id]
      );

      if (existingChannel.rows.length > 0) {
        res.status(409).json({ error: 'Channel already exists' });
        return;
      }

      const result = await client.query<Channel>(
        `INSERT INTO channels (
          twitch_id,
          username,
          display_name,
          profile_image_url,
          description,
          follower_count,
          is_active,
          current_game_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          channelData.twitch_id,
          channelData.username,
          channelData.display_name || channelData.username,
          channelData.profile_image_url || null,
          channelData.description || null,
          channelData.follower_count || 0,
          channelData.is_active ?? true,
          channelData.current_game_id || null
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Error creating channel:', error);
      res.status(500).json({ error: 'Failed to create channel' });
    } finally {
      client.release();
    }
  }

  async updateChannel(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const { id } = req.params;
      const updates: UpdateChannelRequest = req.body;

      // Verify channel exists
      const existingChannel = await client.query(
        'SELECT id FROM channels WHERE id = $1',
        [id]
      );

      if (existingChannel.rows.length === 0) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      // Build dynamic update query
      const setClause = Object.entries(updates)
        .map(([key, _], index) => `${key} = $${index + 2}`)
        .join(', ');

      const result = await client.query<Channel>(
        `UPDATE channels 
         SET ${setClause}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, ...Object.values(updates)]
      );

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating channel:', error);
      res.status(500).json({ error: 'Failed to update channel' });
    } finally {
      client.release();
    }
  }

  async deleteChannel(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const { id } = req.params;

      await client.query('BEGIN');

      // Delete associated records
      await client.query('DELETE FROM channel_game_history WHERE channel_id = $1', [id]);
      await client.query('DELETE FROM user_vod_preferences WHERE channel_id = $1', [id]);
      await client.query('DELETE FROM premiere_events WHERE channel_id = $1', [id]);
      await client.query('DELETE FROM vods WHERE channel_id = $1', [id]);

      // Delete the channel
      const result = await client.query<Channel>(
        'DELETE FROM channels WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      await client.query('COMMIT');
      res.json({ message: 'Channel and all associated data deleted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error deleting channel:', error);
      res.status(500).json({ error: 'Failed to delete channel' });
    } finally {
      client.release();
    }
  }

  async getChannelVODs(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const result = await client.query(
        `SELECT v.*, 
                g.name as game_name,
                g.box_art_url as game_image
         FROM vods v
         LEFT JOIN games g ON v.game_id = g.id
         WHERE v.channel_id = $1 
         ORDER BY v.created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, limit, offset]
      );

      const countResult = await client.query(
        'SELECT COUNT(*) FROM vods WHERE channel_id = $1',
        [id]
      );

      res.json({
        vods: result.rows,
        pagination: {
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      });
    } catch (error) {
      logger.error('Error getting channel VODs:', error);
      res.status(500).json({ error: 'Failed to get channel VODs' });
    } finally {
      client.release();
    }
  }

  async getChannelStats(req: AuthenticatedRequest, res: Response) {
    const client = await this.pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(`
        SELECT 
          c.*,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.channel_id = c.id
          ) as total_vods,
          (
            SELECT COUNT(*)
            FROM vods v
            WHERE v.channel_id = c.id
            AND v.download_status = 'completed'
          ) as downloaded_vods,
          (
            SELECT COALESCE(SUM(file_size), 0)
            FROM vods v
            WHERE v.channel_id = c.id
          ) as total_storage,
          (
            SELECT COUNT(DISTINCT game_id)
            FROM channel_game_history
            WHERE channel_id = c.id
          ) as unique_games,
          (
            SELECT COUNT(*)
            FROM premiere_events
            WHERE channel_id = c.id
          ) as total_premieres
        FROM channels c
        WHERE c.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error getting channel stats:', error);
      res.status(500).json({ error: 'Failed to get channel stats' });
    } finally {
      client.release();
    }
  }
}

export const createChannelController = (pool: Pool) => new ChannelController(pool);

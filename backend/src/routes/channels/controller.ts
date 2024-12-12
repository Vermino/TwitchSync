import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { validateChannelData } from './validation';
import { Channel, CreateChannelRequest, UpdateChannelRequest } from '../../types/database';

export class ChannelsController {
  constructor(private pool: Pool) {}

  getAllChannels = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.pool.query<Channel>(
        'SELECT * FROM channels ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching channels:', error);
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  };

  addChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { twitch_id, username } = req.body as CreateChannelRequest;

      // Validate input data
      const validationError = validateChannelData({ twitch_id, username });
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }

      const result = await this.pool.query<Channel>(
        'INSERT INTO channels (twitch_id, username) VALUES ($1, $2) RETURNING *',
        [twitch_id, username]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Error adding channel:', error);
      res.status(500).json({ error: 'Failed to add channel' });
    }
  };

  updateChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { is_active } = req.body as UpdateChannelRequest;

      const result = await this.pool.query<Channel>(
        'UPDATE channels SET is_active = $1 WHERE id = $2 RETURNING *',
        [is_active, id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Channel not found' });
      } else {
        res.json(result.rows[0]);
      }
    } catch (error) {
      logger.error('Error updating channel:', error);
      res.status(500).json({ error: 'Failed to update channel' });
    }
  };

  deleteChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const result = await this.pool.query<Channel>(
        'DELETE FROM channels WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Channel not found' });
      } else {
        res.json({ message: 'Channel deleted successfully' });
      }
    } catch (error) {
      logger.error('Error deleting channel:', error);
      res.status(500).json({ error: 'Failed to delete channel' });
    }
  };
}

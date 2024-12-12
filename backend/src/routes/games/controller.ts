import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { handleError } from '@/utils/error';
import {CreateGameRequest, Game, UpdateGameRequest} from '../../types/database';
import {validateGameData} from "@/routes/games/validation";


export class GamesController {
  constructor(private pool: Pool) {}

  getAllGames = async (req: Request, res: Response): Promise<void> => {
    const client = await this.pool.connect();
    try {
      const result = await client.query<Game>(
        'SELECT * FROM tracked_games ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } catch (error) {
      const appError = handleError(error);
      logger.error('Error fetching games:', appError);
      res.status(500).json({ error: 'Failed to fetch games' });
    } finally {
      client.release();
    }
  };

  async addGame = async (req: Request, res: Response) => {
    try {
      const { twitch_game_id, name } = req.body as CreateGameRequest;

      // Validate input data
      const validationError = validateGameData({ twitch_game_id, name });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const result = await this.pool.query<Game>(
        'INSERT INTO tracked_games (twitch_game_id, name) VALUES ($1, $2) RETURNING *',
        [twitch_game_id, name]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Error adding game:', error);
      res.status(500).json({ error: 'Failed to add game' });
    }
  };

  async updateGame = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { is_active } = req.body as UpdateGameRequest;

      const result = await this.pool.query<Game>(
        'UPDATE tracked_games SET is_active = $1 WHERE id = $2 RETURNING *',
        [is_active, id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Game not found' });
      } else {
        res.json(result.rows[0]);
      }
    } catch (error) {
      logger.error('Error updating game:', error);
      res.status(500).json({ error: 'Failed to update game' });
    }
  };

  async deleteGame = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await this.pool.query<Game>(
        'DELETE FROM tracked_games WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Game not found' });
      } else {
        res.json({ message: 'Game deleted successfully' });
      }
    } catch (error) {
      logger.error('Error deleting game:', error);
      res.status(500).json({ error: 'Failed to delete game' });
    }
  };
}

// backend/src/routes/games/controller.ts

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { logger } from '@/utils/logger';
import { handleError } from '@/utils/error';
import { CreateGameRequest, Game, UpdateGameRequest } from '@/types/database';
import { validateGameData } from "@/routes/games/validation";

export class GamesController {
  constructor(private pool: Pool) {}

  getAllGames = async (req: Request, res: Response) => {
    const client = await this.pool.connect();
    try {
      const result = await client.query<Game>('SELECT * FROM games ORDER BY created_at DESC');
      res.json(result.rows);
    } catch (error) {
      const appError = handleError(error);
      logger.error('Error fetching games:', appError);
      res.status(500).json({ error: 'Failed to fetch games' });
    } finally {
      client.release();
    }
  };

  addGame = async (req: Request, res: Response) => {
    const client = await this.pool.connect();
    try {
      const { twitch_game_id, name, box_art_url } = req.body as CreateGameRequest;

      // Validate input data
      const validationError = validateGameData({ twitch_game_id, name });
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const result = await client.query<Game>(
        `INSERT INTO games 
         (twitch_game_id, name, box_art_url, is_active) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [twitch_game_id, name, box_art_url, true]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Error adding game:', error);
      res.status(500).json({ error: 'Failed to add game' });
    } finally {
      client.release();
    }
  };

  updateGame = async (req: Request, res: Response) => {
    const client = await this.pool.connect();
    try {
      const { id } = req.params;
      const { is_active, name } = req.body as UpdateGameRequest;

      const result = await client.query<Game>(
        `UPDATE games 
         SET is_active = $1, 
             name = COALESCE($2, name) 
         WHERE id = $3 
         RETURNING *`,
        [is_active, name, id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Game not found' });
      } else {
        res.json(result.rows[0]);
      }
    } catch (error) {
      logger.error('Error updating game:', error);
      res.status(500).json({ error: 'Failed to update game' });
    } finally {
      client.release();
    }
  };

  deleteGame = async (req: Request, res: Response) => {
    const client = await this.pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query<Game>(
        'DELETE FROM games WHERE id = $1 RETURNING *',
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
    } finally {
      client.release();
    }
  };
}

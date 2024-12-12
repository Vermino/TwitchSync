// src/routes/games.ts
import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const router = Router();

export const setupGameRoutes = (pool: Pool) => {
  // Get all tracked games
  router.get('/', async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM tracked_games ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching games:', error);
      res.status(500).json({ error: 'Failed to fetch games' });
    }
  });

  // Add new game to track
  router.post('/', async (req, res) => {
    const { twitch_game_id, name } = req.body;
    try {
      const result = await pool.query(
        'INSERT INTO tracked_games (twitch_game_id, name) VALUES ($1, $2) RETURNING *',
        [twitch_game_id, name]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Error adding game:', error);
      res.status(500).json({ error: 'Failed to add game' });
    }
  });

  // Update game
  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    try {
      const result = await pool.query(
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
  });

  // Delete game
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
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
  });

  return router;
};

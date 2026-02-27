// backend/src/routes/games.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { Game } from '../types/database';
import { DiscoveryIndexer } from '../services/discovery/discovery-indexer';

export const setupGameRoutes = (pool: Pool) => {
  const router = Router();

  // Get all games
  router.get('/', authenticate(pool), async (req, res) => {
    try {
      const result = await pool.query<Game>(
        'SELECT * FROM games WHERE is_active = true ORDER BY name ASC'
      );
      res.json(result.rows);
    } catch (error) {
      logger.error('Error fetching games:', error);
      res.status(500).json({ error: 'Failed to fetch games' });
    }
  });

  // Add new game to track
  router.post('/', authenticate(pool), async (req, res) => {
    const { twitch_game_id, name, box_art_url } = req.body;
    try {
      // Check if game already exists
      const existingGame = await pool.query(
        'SELECT * FROM games WHERE twitch_game_id = $1',
        [twitch_game_id]
      );

      if (existingGame.rows.length > 0) {
        // If game exists but is inactive, reactivate it
        if (!existingGame.rows[0].is_active) {
          const result = await pool.query<Game>(
            `UPDATE games 
             SET is_active = true, 
                 name = $2, 
                 box_art_url = $3,
                 updated_at = CURRENT_TIMESTAMP 
              WHERE twitch_game_id = $1 
             RETURNING *`,
            [twitch_game_id, name, box_art_url]
          );

          const reactivatedGame = result.rows[0];

          // Background index reactivated game
          DiscoveryIndexer.getInstance(pool)
            .indexGame(twitch_game_id, reactivatedGame.id)
            .catch(err => logger.error(`Failed background index for reactivated game ${name}:`, err));

          res.json(reactivatedGame);
          return;
        }
        res.status(409).json({ error: 'Game already exists' });
        return;
      }

      const result = await pool.query<Game>(
        `INSERT INTO games 
         (twitch_game_id, name, box_art_url, is_active, status) 
         VALUES ($1, $2, $3, true, 'active') 
         RETURNING *`,
        [twitch_game_id, name, box_art_url]
      );

      const newGame = result.rows[0];

      // Kick off background discovery for this new game
      DiscoveryIndexer.getInstance(pool)
        .indexGame(twitch_game_id, newGame.id)
        .catch(err => logger.error(`Failed background index for new game ${name}:`, err));

      res.status(201).json(newGame);
    } catch (error) {
      logger.error('Error adding game:', error);
      res.status(500).json({ error: 'Failed to add game' });
    }
  });

  // Update game
  router.put('/:id', authenticate(pool), async (req, res) => {
    const { id } = req.params;
    const { is_active, name, box_art_url } = req.body;
    try {
      const result = await pool.query<Game>(
        `UPDATE games 
         SET is_active = COALESCE($1, is_active),
             name = COALESCE($2, name),
             box_art_url = COALESCE($3, box_art_url),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 
         RETURNING *`,
        [is_active, name, box_art_url, id]
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

  // Delete game (soft delete by setting is_active to false)
  router.delete('/:id', authenticate(pool), async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query<Game>(
        `UPDATE games 
         SET is_active = false,
             status = 'inactive',
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Game not found' });
      } else {
        res.json({ message: 'Game deactivated successfully' });
      }
    } catch (error) {
      logger.error('Error deactivating game:', error);
      res.status(500).json({ error: 'Failed to deactivate game' });
    }
  });

  return router;
};

export default setupGameRoutes;

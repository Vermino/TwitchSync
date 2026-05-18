import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { TwitchService } from '../../services/twitch/service';

const router = Router();

export function setupTwitchSearchRoutes(pool: Pool): Router {
  const twitchService = TwitchService.getInstance();

  // Search channels
  router.get('/channels/search', async (req, res) => {
    try {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      logger.debug('Searching Twitch channels:', query);

      const response = await twitchService.searchChannels(query);
      res.json(response);
    } catch (error) {
      logger.error('Error searching Twitch channels:', error);
      res.status(500).json({ error: 'Failed to search Twitch channels' });
    }
  });

  // Search games
  router.get('/games/search', async (req, res) => {
    try {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      logger.debug('Searching Twitch games:', query);

      const response = await twitchService.searchGames(query);
      res.json(response);
    } catch (error) {
      logger.error('Error searching Twitch games:', error);
      res.status(500).json({ error: 'Failed to search Twitch games' });
    }
  });

  return router;
}

export default setupTwitchSearchRoutes;

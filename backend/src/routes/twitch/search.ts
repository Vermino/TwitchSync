import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import TwitchAPIService from '../../services/twitch';

const router = Router();

export function setupTwitchSearchRoutes(pool: Pool): Router {
  const twitchAPI = TwitchAPIService.getInstance();

  // Search channels
  router.get('/channels/search', async (req, res) => {
    try {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      logger.debug('Searching Twitch channels:', query);

      const response = await twitchAPI.searchChannels(query);
      res.json(response.data);
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

      const response = await twitchAPI.searchGames(query);
      res.json(response.data);
    } catch (error) {
      logger.error('Error searching Twitch games:', error);
      res.status(500).json({ error: 'Failed to search Twitch games' });
    }
  });

  return router;
}

export default setupTwitchSearchRoutes;

import { Router } from 'express';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { WatchService } from '../../services/watch';

export function setupWatchRoutes(pool: Pool): Router {
  const router = Router();
  const watchService = new WatchService(pool);

  // Configure watch settings
  router.post('/', async (req, res) => {
    try {
      const config = {
        channels: req.body.channels || [],
        games: req.body.games || [],
        historyDays: parseInt(req.body.historyDays) || 0,
        syncForward: req.body.syncForward || true
      };

      await watchService.configureWatch(config);
      res.json({ message: 'Watch configuration saved successfully' });
    } catch (error) {
      logger.error('Failed to configure watch:', error);
      res.status(500).json({ error: 'Failed to save watch configuration' });
    }
  });

  // Get active watches
  router.get('/', async (req, res) => {
    try {
      const watches = await watchService.getActiveWatches();
      res.json(watches);
    } catch (error) {
      logger.error('Failed to get active watches:', error);
      res.status(500).json({ error: 'Failed to get active watches' });
    }
  });

  return router;
}

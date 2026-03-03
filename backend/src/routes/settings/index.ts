// Filepath: backend/src/routes/settings/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { createSettingsController } from './controller';
import { logger } from '../../utils/logger';

export function setupSettingsRoutes(pool: Pool): Router {
  const router = Router();
  const controller = createSettingsController(pool);

  // System settings routes
  router.get('/system', controller.getSystemSettings);
  router.post('/system', controller.updateSystemSettings);

  // Storage routes
  router.get('/storage', controller.getStorageStats);
  router.post('/storage/cleanup', controller.runStorageCleanup);

  // Folder selection / browser
  router.post('/select-folder', controller.selectFolder);
  router.get('/browse', controller.browsePath);

  // Log route registration
  logger.debug('Settings routes registered');

  return router;
}

export default setupSettingsRoutes;

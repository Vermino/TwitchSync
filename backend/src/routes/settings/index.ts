import { Router } from 'express';
import { Pool } from 'pg';
import SettingsController from './controller';

export function setupSettingsRoutes(pool: Pool): Router {
  const router = Router();
  const controller = new SettingsController(pool);

  // Get all settings
  router.get('/', controller.getSettings);

  // Update settings
  router.post('/', controller.updateSettings);

  // Get storage statistics
  router.get('/storage', controller.getStorageStats);

  // Select folder path
  router.post('/select-folder', controller.selectFolder);

  return router;
}

export default setupSettingsRoutes;

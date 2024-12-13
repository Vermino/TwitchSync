// backend/src/routes/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { setupChannelRoutes } from './channels';
import { setupGameRoutes } from './games';
import { setupVODRoutes } from './vods';
import { setupDashboardRoutes } from './dashboard';
import { setupWatchRoutes } from './watch';
import { setupAuthRoutes } from './auth';
import { setupSystemRoutes } from './system';
import { setupDownloadsRoutes } from './downloads';
import { setupSettingsRoutes } from './settings';
import { setupTaskRoutes } from './tasks';
import { setupTwitchSearchRoutes } from './twitch/search';
import { authenticate } from '../middleware/auth';

export function setupRoutes(pool: Pool): Router {
  const router = Router();

  // Public routes
  router.use('/auth', setupAuthRoutes(pool));

  // Protected routes - all require authentication
  router.use('/channels', authenticate(pool), setupChannelRoutes(pool));
  router.use('/games', authenticate(pool), setupGameRoutes(pool));
  router.use('/vods', authenticate(pool), setupVODRoutes(pool));
  router.use('/dashboard', authenticate(pool), setupDashboardRoutes(pool));
  router.use('/watch', authenticate(pool), setupWatchRoutes(pool));
  router.use('/system', authenticate(pool), setupSystemRoutes(pool));
  router.use('/downloads', authenticate(pool), setupDownloadsRoutes(pool));
  router.use('/settings', authenticate(pool), setupSettingsRoutes(pool));
  router.use('/tasks', authenticate(pool), setupTaskRoutes(pool));
  router.use('/twitch', authenticate(pool), setupTwitchSearchRoutes(pool));

  return router;
}

export {
  setupAuthRoutes,
  setupChannelRoutes,
  setupGameRoutes,
  setupVODRoutes,
  setupDashboardRoutes,
  setupWatchRoutes,
  setupSystemRoutes,
  setupDownloadsRoutes,
  setupSettingsRoutes,
  setupTaskRoutes,
  setupTwitchSearchRoutes
};

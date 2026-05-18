// Filepath: backend/src/routes/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import { setupChannelRoutes } from './channels';
import { setupGameRoutes } from './games';
import { setupDashboardRoutes } from './dashboard';
import { setupAuthRoutes } from './auth';
import { setupSystemRoutes } from './system';
import { setupSettingsRoutes } from './settings';
import { setupTaskRoutes } from './tasks';
import { setupTwitchSearchRoutes } from './twitch/search';
import { setupVodRoutes } from './vods';
import { setupQueueRoutes } from './queue';
import createDiscoveryRouter from './discovery/index';
import createDownloadsRouter from './downloads';
import { createHealthRoutes } from './health';
import { setupLifecycleRoutes } from './lifecycle';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import DownloadManager from '../services/downloadManager';

export function setupRoutes(pool: Pool): Router {
  const router = Router();

  // Log middleware for debugging routes
  router.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Public routes (no authentication required)
  router.use('/auth', setupAuthRoutes(pool));
  router.use('/health', createHealthRoutes(pool));

  // Get download manager instance for downloads routes
  const downloadManager = DownloadManager.getInstance(pool, {
    tempDir: process.env.TEMP_DIR || './temp',
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3'),
    retryAttempts: parseInt(process.env.DOWNLOAD_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.DOWNLOAD_RETRY_DELAY || '5000'),
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600')
  });

  // Protected routes
  const protectedRoutes = [
    { path: '/channels', handler: setupChannelRoutes },
    { path: '/games', handler: setupGameRoutes },
    { path: '/dashboard', handler: setupDashboardRoutes },
    { path: '/system', handler: setupSystemRoutes },
    { path: '/settings', handler: setupSettingsRoutes },
    { path: '/tasks', handler: (poolArg: Pool) => setupTaskRoutes(poolArg) },
    { path: '/twitch', handler: setupTwitchSearchRoutes },
    { path: '/vods', handler: setupVodRoutes },
    { path: '/queue', handler: setupQueueRoutes },
    { path: '/discovery', handler: createDiscoveryRouter },
    { path: '/downloads', handler: (poolArg: Pool) => createDownloadsRouter(poolArg, downloadManager) },
    { path: '/lifecycle', handler: setupLifecycleRoutes },
  ];

  // Set up protected routes
  protectedRoutes.forEach(({ path, handler }) => {
    router.use(path, authenticate(pool), handler(pool));
    logger.debug(`Registered route: ${path}`);
  });

  // 404 handler
  router.use((req, res) => {
    logger.warn(`Route not found: ${req.method} ${req.path}`);
    res.status(404).json({ error: 'Route not found' });
  });

  return router;
}

export {
  setupAuthRoutes,
  setupChannelRoutes,
  setupGameRoutes,
  setupDashboardRoutes,
  setupSystemRoutes,
  setupSettingsRoutes,
  setupTaskRoutes,
  setupTwitchSearchRoutes,
  setupVodRoutes,
  setupQueueRoutes,
  createDiscoveryRouter as setupDiscoveryRoutes,
  setupLifecycleRoutes
};

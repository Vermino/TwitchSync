// Filepath: backend/src/index.ts

import express, { Request, Response, NextFunction, RequestHandler, Router } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { EventEmitter } from 'events';

// Import configurations
import { setupDatabase } from './config/database';
import pool from './config/database';

// Import utilities and services
import { logger } from './utils/logger';
import DownloadManager from './services/downloadManager';

// Import middleware
import { authenticate } from "./middleware/auth";
import { loggingMiddleware } from './middleware/logging';
import { debugMiddleware } from './middleware/debug';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Import routes
import { setupAuthRoutes } from './routes/auth';
import { setupChannelRoutes } from './routes/channels';
import { setupGameRoutes } from './routes/games';
import { setupDashboardRoutes } from './routes/dashboard';
import { setupWatchRoutes } from './routes/watch';
import { setupSystemRoutes } from './routes/system';
import { createDownloadsRouter } from './routes/downloads';
import { setupSettingsRoutes } from './routes/settings';
import { setupTaskRoutes } from './routes/tasks';
import { setupTwitchSearchRoutes } from './routes/twitch/search';
import { createDiscoveryRouter } from './routes/discovery';

// Load environment variables
dotenv.config();

// Configure event emitter
EventEmitter.defaultMaxListeners = 15;

// Create download manager instance
const downloadManager = DownloadManager.getInstance(pool, {
  tempDir: process.env.TEMP_DIR || './temp',
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3'),
  retryAttempts: parseInt(process.env.DOWNLOAD_RETRY_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.DOWNLOAD_RETRY_DELAY || '5000'),
  cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600')
});

// Initialize express app
const app = express();
const port = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      scriptSrc: process.env.NODE_ENV === 'development'
        ? ["'self'", "'unsafe-eval'"]  // Allow eval in development for hot reloading
        : ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Required for certain media features
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600 // Cache preflight requests for 10 minutes
};

app.use(cors(corsOptions));

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(loggingMiddleware as RequestHandler);

// Debug middleware in development
if (process.env.NODE_ENV === 'development') {
  app.use(debugMiddleware);
}

// Mount auth routes directly at /auth without additional prefixing
app.use('/auth', setupAuthRoutes(pool));

// API Routes with /api prefix
const apiRouter: Router = express.Router();

// Protected routes
apiRouter.use('/channels', authenticate(pool), rateLimiter, setupChannelRoutes(pool));
apiRouter.use('/games', authenticate(pool), rateLimiter, setupGameRoutes(pool));
apiRouter.use('/dashboard', authenticate(pool), setupDashboardRoutes(pool));
apiRouter.use('/watch', authenticate(pool), setupWatchRoutes(pool));
apiRouter.use('/system', authenticate(pool), setupSystemRoutes(pool));
apiRouter.use('/downloads', authenticate(pool), createDownloadsRouter(pool, downloadManager));
apiRouter.use('/settings', authenticate(pool), setupSettingsRoutes(pool));
apiRouter.use('/tasks', authenticate(pool), setupTaskRoutes(pool));
apiRouter.use('/twitch', authenticate(pool), setupTwitchSearchRoutes(pool));
apiRouter.use('/discovery', createDiscoveryRouter(pool));

// Mount API routes under /api prefix
app.use('/api', apiRouter);

// Health check routes
app.get('/', (req, res) => {
  res.json({
    message: 'TwitchSync API Server',
    status: 'running',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Server startup function
const startServer = async () => {
  try {
    // Initialize database
    await setupDatabase();
    logger.info('Database setup completed');

    // Initialize download manager queue processing
    logger.info('Starting download queue processing with 30 second interval');
    await downloadManager.startProcessing();
    logger.info('Download manager started');

    // Start server
    app.listen(port, () => {
      logger.info(`Server is running at http://localhost:${port}`);
      logger.info('Environment:', process.env.NODE_ENV);
      logger.info('Server startup completed');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown handler
const shutdownHandler = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    await downloadManager.stopProcessing();
    logger.info('Download manager stopped');

    // Close database pool
    await pool.end();
    logger.info('Database connections closed');

    // Exit process
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
process.on('SIGINT', () => shutdownHandler('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  shutdownHandler('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection:', reason instanceof Error ? reason : new Error(String(reason)));
});

// Start the server
startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export { app, pool };

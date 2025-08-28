// Filepath: backend/src/index.ts
// Restart trigger 2

import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { EventEmitter } from 'events';
import { createServer } from 'http';

// Import configurations
import { setupDatabase } from './config/database';
import pool from './config/database';

// Import utilities and services
import { logger } from './utils/logger';
import DownloadManager from './services/downloadManager/index';
import { createReliabilityManager } from './services/reliabilityManager';
import { createTaskScheduler } from './services/taskScheduler';
import { WebSocketService } from './services/websocketService';

// Import middleware
import { loggingMiddleware } from './middleware/logging';
import { debugMiddleware } from './middleware/debug';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

// Import routes setup
import { setupRoutes, setupAuthRoutes } from './routes';

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

// Create reliability manager instance
const reliabilityManager = createReliabilityManager(pool, downloadManager, {
  healthMonitoring: {
    enabled: process.env.HEALTH_MONITORING_ENABLED !== 'false',
    intervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000')
  },
  cleanup: {
    enabled: process.env.CLEANUP_ENABLED !== 'false',
    intervalMs: parseInt(process.env.CLEANUP_INTERVAL || '3600000'),
    tempFileMaxAge: parseInt(process.env.TEMP_FILE_MAX_AGE || '86400000'),
    logFileMaxAge: parseInt(process.env.LOG_FILE_MAX_AGE || '604800000'),
    emergencyCleanup: process.env.EMERGENCY_CLEANUP_ENABLED !== 'false',
    diskSpaceThresholdGB: parseInt(process.env.DISK_SPACE_THRESHOLD_GB || '5')
  },
  recovery: {
    performStartupRecovery: process.env.STARTUP_RECOVERY_ENABLED !== 'false',
    retryConfigs: {
      maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
      baseDelayMs: parseInt(process.env.BASE_DELAY_MS || '1000')
    }
  }
});

// Create task scheduler instance
const taskScheduler = createTaskScheduler(
  pool, 
  downloadManager, 
  parseInt(process.env.TASK_SCHEDULER_INTERVAL_MS || '60000') // Default 1 minute
);

// Expose task scheduler globally for API access
(global as any).taskScheduler = taskScheduler;

// Initialize express app
const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3001;

// Initialize WebSocket service
const webSocketService = WebSocketService.getInstance();
webSocketService.initialize(httpServer);

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
app.use(loggingMiddleware);

// Debug middleware in development
if (process.env.NODE_ENV === 'development') {
  app.use(debugMiddleware);
}

// Mount auth routes at root level for frontend compatibility
app.use('/auth', setupAuthRoutes(pool));

// Set up all routes under /api prefix
app.use('/api', setupRoutes(pool));

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

    // Initialize reliability manager (includes startup recovery)
    await reliabilityManager.start();
    logger.info('Reliability manager started');

    // Initialize download manager queue processing
    await downloadManager.startProcessing();
    logger.info('Download manager started');

    // Start task scheduler for overdue task execution
    taskScheduler.start();
    logger.info('Task scheduler started');

    // Start server
    httpServer.listen(port, () => {
      logger.info(`Server is running at http://localhost:${port}`);
      logger.info('WebSocket service initialized');
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
    // Stop task scheduler first
    taskScheduler.stop();
    logger.info('Task scheduler stopped');

    // Stop reliability manager
    await reliabilityManager.stop();
    logger.info('Reliability manager stopped');

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

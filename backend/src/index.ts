import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupDatabase } from './config/database';
import { logger } from './utils/logger';
import pool from './config/database';
import { setupChannelRoutes } from './routes/channels';
import { setupGameRoutes } from './routes/games';
import { setupVODRoutes } from './routes/vods';
import { setupDashboardRoutes } from './routes/dashboard';
import { setupWatchRoutes } from './routes/watch';
import { setupAuthRoutes } from './routes/auth';
import { setupSystemRoutes } from './routes/system';
import { setupDownloadsRoutes } from './routes/downloads';
import { setupSettingsRoutes } from './routes/settings';
import { authenticate } from "./middleware/auth";
import { loggingMiddleware } from './middleware/logging';
import { setupTwitchSearchRoutes } from './routes/twitch/search';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Add security headers middleware
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; font-src 'self' https: data:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:;"
  );
  next();
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(loggingMiddleware);

// Debug middleware for auth token
app.use((req, res, next) => {
  logger.debug('Auth header:', req.headers.authorization);
  next();
});

// Add root route
app.get('/', (req, res) => {
  res.json({
    message: 'TwitchSync API Server',
    status: 'running',
    version: '1.0.0'
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Protected routes
app.use('/auth', setupAuthRoutes(pool));
app.use('/api/channels', authenticate(pool), setupChannelRoutes(pool));
app.use('/api/games', authenticate(pool), setupGameRoutes(pool));
app.use('/api/vods', authenticate(pool), setupVODRoutes(pool));
app.use('/api/dashboard', authenticate(pool), setupDashboardRoutes(pool));
app.use('/api/watch', authenticate(pool), setupWatchRoutes(pool));
app.use('/api/system', authenticate(pool), setupSystemRoutes(pool));
app.use('/api/downloads', authenticate(pool), setupDownloadsRoutes(pool));
app.use('/api/settings', authenticate(pool), setupSettingsRoutes(pool));
app.use('/api/twitch', authenticate(pool), setupTwitchSearchRoutes(pool));

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Single server startup
const startServer = async () => {
  try {
    await setupDatabase();

    app.listen(port, () => {
      logger.info(`Server is running at http://localhost:${port}`);
      logger.info('Environment:', process.env.NODE_ENV);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export { app, pool };

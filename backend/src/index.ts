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
import { authenticate } from './middleware/auth';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:3001']
    : process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());

// API Documentation HTML
const apiDocsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TwitchSync API Documentation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 { color: #6b46c1; }
        h2 { 
            color: #553c9a;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 8px;
        }
        .endpoint {
            background: #f7fafc;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
        }
        .method {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            margin-right: 8px;
        }
        .get { background: #9ae6b4; }
        .post { background: #90cdf4; }
        .put { background: #fbd38d; }
        .delete { background: #feb2b2; }
        code {
            background: #edf2f7;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
        }
        pre {
            background: #2d3748;
            color: #e2e8f0;
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <h1>TwitchSync API Documentation</h1>
    
    <h2>Authentication</h2>
    <div class="endpoint">
        <span class="method post">POST</span>
        <code>/auth/twitch/login</code>
        <p>Initiate Twitch OAuth login</p>
    </div>
    
    <div class="endpoint">
        <span class="method get">GET</span>
        <code>/auth/twitch/callback</code>
        <p>OAuth callback endpoint</p>
    </div>

    <div class="endpoint">
        <span class="method post">POST</span>
        <code>/auth/logout</code>
        <p>Logout current user</p>
    </div>

    <h2>Channels</h2>
    <div class="endpoint">
        <span class="method get">GET</span>
        <code>/api/channels</code>
        <p>Get all channels</p>
        <pre>Invoke-WebRequest -Uri "http://localhost:3000/api/channels"</pre>
    </div>
    
    <div class="endpoint">
        <span class="method post">POST</span>
        <code>/api/channels</code>
        <p>Add a new channel</p>
        <pre>Invoke-WebRequest -Method POST -Uri "http://localhost:3000/api/channels" -ContentType "application/json" -Body '{"twitch_id":"123456","username":"example_channel"}'</pre>
    </div>
    
    <div class="endpoint">
        <span class="method put">PUT</span>
        <code>/api/channels/:id</code>
        <p>Update a channel</p>
        <pre>Invoke-WebRequest -Method PUT -Uri "http://localhost:3000/api/channels/1" -ContentType "application/json" -Body '{"is_active":false}'</pre>
    </div>
    
    <div class="endpoint">
        <span class="method delete">DELETE</span>
        <code>/api/channels/:id</code>
        <p>Delete a channel</p>
        <pre>Invoke-WebRequest -Method DELETE -Uri "http://localhost:3000/api/channels/1"</pre>
    </div>

    <h2>Games</h2>
    <div class="endpoint">
        <span class="method get">GET</span>
        <code>/api/games</code>
        <p>Get all tracked games</p>
        <pre>Invoke-WebRequest -Uri "http://localhost:3000/api/games"</pre>
    </div>
    
    <div class="endpoint">
        <span class="method post">POST</span>
        <code>/api/games</code>
        <p>Add a new game to track</p>
        <pre>Invoke-WebRequest -Method POST -Uri "http://localhost:3000/api/games" -ContentType "application/json" -Body '{"twitch_game_id":"789","name":"Example Game"}'</pre>
    </div>
    
    <div class="endpoint">
        <span class="method put">PUT</span>
        <code>/api/games/:id</code>
        <p>Update a game</p>
        <pre>Invoke-WebRequest -Method PUT -Uri "http://localhost:3000/api/games/1" -ContentType "application/json" -Body '{"is_active":false}'</pre>
    </div>
    
    <div class="endpoint">
        <span class="method delete">DELETE</span>
        <code>/api/games/:id</code>
        <p>Delete a game</p>
        <pre>Invoke-WebRequest -Method DELETE -Uri "http://localhost:3000/api/games/1"</pre>
    </div>

    <h2>VODs</h2>
    <div class="endpoint">
        <span class="method get">GET</span>
        <code>/api/vods</code>
        <p>Get all VODs (paginated)</p>
        <pre>Invoke-WebRequest -Uri "http://localhost:3000/api/vods?page=1&limit=20"</pre>
    </div>
    
    <div class="endpoint">
        <span class="method get">GET</span>
        <code>/api/vods/channel/:channelId</code>
        <p>Get VODs for a specific channel</p>
        <pre>Invoke-WebRequest -Uri "http://localhost:3000/api/vods/channel/1"</pre>
    </div>

    <h2>Dashboard</h2>
    <div class="endpoint">
        <span class="method get">GET</span>
        <code>/api/dashboard/stats</code>
        <p>Get dashboard statistics</p>
        <pre>Invoke-WebRequest -Uri "http://localhost:3000/api/dashboard/stats"</pre>
    </div>
</body>
</html>`;

// Public routes
app.use('/auth', setupAuthRoutes());  // Removed pool parameter
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});
app.get('/', (req, res) => {
  res.send(apiDocsHtml);
});

// Protected routes - require authentication
app.use('/api/channels', authenticate(pool), setupChannelRoutes(pool));
app.use('/api/games', authenticate(pool), setupGameRoutes(pool));
app.use('/api/vods', authenticate(pool), setupVODRoutes(pool));
app.use('/api/dashboard', authenticate(pool), setupDashboardRoutes(pool));
app.use('/api/watch', authenticate(pool), setupWatchRoutes(pool));
app.use('/api/system', authenticate(pool), setupSystemRoutes(pool));
app.use('/api/downloads', authenticate(pool), setupDownloadsRoutes(pool));
app.use('/api/settings', authenticate(pool), setupSettingsRoutes(pool));

let server: any;

const startServer = async () => {
  try {
    // Check if port is in use
    await new Promise((resolve, reject) => {
      const testServer = require('http').createServer();
      testServer.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(err);
        }
      });
      testServer.once('listening', () => {
        testServer.close();
        resolve(true);
      });
      testServer.listen(port);
    });

    // Setup database
    await setupDatabase();

    // Start server
    server = app.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
      if (process.env.NODE_ENV === 'development') {
        logger.info(`API Documentation available at http://localhost:${port}`);
      }
    });

  } catch (error: any) {
    if (error.message.includes('EADDRINUSE')) {
      logger.error(`Port ${port} is already in use. Please either:
        1. Close the application using port ${port}
        2. Set a different port in your .env file
        3. Use: PORT=3001 npm run dev`);
    } else {
      logger.error('Failed to start server:', error);
    }
    process.exit(1);
  }
};

// Graceful shutdown
const shutdownGracefully = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      pool.end(() => {
        logger.info('Database pool closed');
        process.exit(0);
      });
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  shutdownGracefully('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  shutdownGracefully('UNHANDLED_REJECTION');
});

process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));

startServer();

export { app, pool };

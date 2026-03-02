// backend/src/config/index.ts
import dotenv from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

// Database configuration schema
const dbConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().default(5432),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.any().default(false),
  max: z.coerce.number().default(20),
  idleTimeoutMillis: z.coerce.number().default(30000)
});

// Twitch configuration schema
const twitchConfigSchema = z.object({
  clientId: z.string().default(''),
  clientSecret: z.string().default(''),
  redirectUri: z.string().url().default('http://localhost:3001/auth/twitch/callback'),
  scopes: z.array(z.string()),
  apiUrl: z.string().url(),
  authUrl: z.string().url()
});

// Server configuration schema
const serverConfigSchema = z.object({
  port: z.coerce.number().default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  frontendUrl: z.string().url().default('http://localhost:3000'),
  corsOrigin: z.string().default('http://localhost:3000')
});

// Storage configuration schema
const storageConfigSchema = z.object({
  mediaServerPath: z.string().default('./storage/media'),
  storagePath: z.string().default('./storage'),
  tempPath: z.string().default('./temp'),
  tempDownloadPath: z.string().default('./temp/downloads')
});

// Export configuration
export const config = {
  database: dbConfigSchema.parse({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
    max: process.env.DB_MAX_POOL_SIZE,
    idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT
  }),

  twitch: twitchConfigSchema.parse({
    clientId: process.env.TWITCH_CLIENT_ID || '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
    redirectUri: process.env.TWITCH_REDIRECT_URI || 'http://localhost:3001/auth/twitch/callback',
    scopes: [
      'user:read:email',
      'channel:read:vods',
      'channel:read:stream_key',
      'user:read:broadcast',
      'channel:read:editors',
      'clips:edit',
      'channel:manage:broadcast'
    ],
    apiUrl: 'https://api.twitch.tv/helix',
    authUrl: 'https://id.twitch.tv/oauth2'
  }),

  server: serverConfigSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV as 'development' | 'production' | 'test',
    frontendUrl: process.env.FRONTEND_URL,
    corsOrigin: process.env.CORS_ORIGIN
  }),

  storage: storageConfigSchema.parse({
    mediaServerPath: process.env.MEDIA_SERVER_PATH,
    storagePath: process.env.STORAGE_PATH,
    tempPath: process.env.TEMP_PATH,
    tempDownloadPath: process.env.TEMP_DOWNLOAD_PATH
  })
};

// Export type definitions
export type DbConfig = z.infer<typeof dbConfigSchema>;
export type TwitchConfig = z.infer<typeof twitchConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type StorageConfig = z.infer<typeof storageConfigSchema>;

// Validate critical configuration on startup
try {
  // Check for critical configuration and warn about missing optional items
  const criticalMissing = [];
  const warningMissing = [];

  // Critical: Database configuration
  if (!config.database.host || !config.database.database || !config.database.user) {
    criticalMissing.push('database configuration (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD)');
  }

  // Critical: JWT secret — must not be missing or empty string
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
    criticalMissing.push('JWT_SECRET (required for secure token signing)');
  } else if (process.env.JWT_SECRET.length < 32) {
    logger.warn('JWT_SECRET is shorter than 32 characters — consider using a longer random secret for production');
  }


  // Warning: Twitch configuration (for development, can work without Twitch features)
  if (!config.twitch.clientId || config.twitch.clientId === '' ||
    !config.twitch.clientSecret || config.twitch.clientSecret === '') {
    warningMissing.push('Twitch API configuration (TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI)');
  }

  // Warning: Server configuration (has defaults)
  if (!config.server.frontendUrl || !config.server.corsOrigin) {
    warningMissing.push('frontend/CORS configuration (FRONTEND_URL, CORS_ORIGIN)');
  }

  // Warning: Storage configuration (has defaults)
  if (!config.storage.mediaServerPath || !config.storage.storagePath) {
    warningMissing.push('storage paths configuration (MEDIA_SERVER_PATH, STORAGE_PATH, TEMP_PATH)');
  }

  if (criticalMissing.length > 0) {
    throw new Error(`Missing critical configuration: ${criticalMissing.join(', ')}`);
  }

  if (warningMissing.length > 0) {
    logger.warn(`Missing optional configuration (limited functionality): ${warningMissing.join(', ')}`);
  }

  logger.info('Configuration validation completed');
} catch (error) {
  logger.error('Configuration validation failed:', error);
  throw error;
}

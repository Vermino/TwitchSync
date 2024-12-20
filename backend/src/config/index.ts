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
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()),
  apiUrl: z.string().url(),
  authUrl: z.string().url()
});

// Server configuration schema
const serverConfigSchema = z.object({
  port: z.coerce.number().default(3001),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  frontendUrl: z.string().url(),
  corsOrigin: z.string()
});

// Storage configuration schema
const storageConfigSchema = z.object({
  mediaServerPath: z.string(),
  storagePath: z.string(),
  tempPath: z.string(),
  tempDownloadPath: z.string()
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
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    redirectUri: process.env.TWITCH_REDIRECT_URI,
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
    frontendUrl: process.env.FRONTEND_URL!,
    corsOrigin: process.env.CORS_ORIGIN!
  }),

  storage: storageConfigSchema.parse({
    mediaServerPath: process.env.MEDIA_SERVER_PATH!,
    storagePath: process.env.STORAGE_PATH!,
    tempPath: process.env.TEMP_PATH!,
    tempDownloadPath: process.env.TEMP_DOWNLOAD_PATH!
  })
};

// Export type definitions
export type DbConfig = z.infer<typeof dbConfigSchema>;
export type TwitchConfig = z.infer<typeof twitchConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type StorageConfig = z.infer<typeof storageConfigSchema>;

// Validate critical configuration on startup
try {
  // Validate database configuration
  if (!config.database.host || !config.database.database || !config.database.user) {
    throw new Error('Missing required database configuration');
  }

  // Validate Twitch configuration
  if (!config.twitch.clientId || !config.twitch.clientSecret || !config.twitch.redirectUri) {
    throw new Error('Missing required Twitch configuration');
  }

  // Validate server configuration
  if (!config.server.frontendUrl || !config.server.corsOrigin) {
    throw new Error('Missing required server configuration');
  }

  // Validate storage configuration
  if (!config.storage.mediaServerPath || !config.storage.storagePath) {
    throw new Error('Missing required storage configuration');
  }

  logger.info('Configuration validated successfully');
} catch (error) {
  logger.error('Configuration validation failed:', error);
  throw error;
}

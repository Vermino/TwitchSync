// backend/src/config/twitch.ts
import { config } from './index';
import { logger } from '../utils/logger';

// Twitch API configuration
export const TWITCH_CONFIG = {
  clientId: config.twitch.clientId,
  clientSecret: config.twitch.clientSecret,
  redirectUri: config.twitch.redirectUri,
  scopes: [
    'user:read:email',      // Read user's email
    'channel:read:vods',    // Read VODs
    'channel:read:stream_key', // Read stream key
    'user:read:broadcast',  // Read broadcast configuration
    'channel:read:editors', // Read channel editors
    'clips:edit',          // Create and edit clips
    'channel:manage:broadcast' // Manage channel broadcast
  ],
  // Add any additional scopes your application needs
};

// API endpoints
export const TWITCH_API_URL = 'https://api.twitch.tv/helix';
export const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2';

// Validation
if (!TWITCH_CONFIG.clientId || !TWITCH_CONFIG.clientSecret || !TWITCH_CONFIG.redirectUri) {
  logger.error('Missing required Twitch configuration. Please check your environment variables.');
  throw new Error('Missing required Twitch configuration');
}

// Additional Twitch-specific constants
export const TWITCH_CONSTANTS = {
  MAX_RESULTS_PER_PAGE: 100,
  DEFAULT_POLLING_INTERVAL: 60000, // 1 minute in milliseconds
  RATE_LIMIT: {
    points: 800,
    duration: 60 // seconds
  },
  VOD_TYPES: {
    ARCHIVE: 'archive',
    HIGHLIGHT: 'highlight',
    UPLOAD: 'upload'
  },
  WEBHOOK_SECRET: process.env.TWITCH_WEBHOOK_SECRET || '',
  RETRY_OPTIONS: {
    maxAttempts: 3,
    delayMs: 1000,
    backoffFactor: 2
  }
};

// Helper functions
export const getTwitchAuthUrl = (state: string): string => {
  const params = new URLSearchParams({
    client_id: TWITCH_CONFIG.clientId,
    redirect_uri: TWITCH_CONFIG.redirectUri,
    response_type: 'code',
    scope: TWITCH_CONFIG.scopes.join(' '),
    state: state
  });

  return `${TWITCH_AUTH_URL}/authorize?${params.toString()}`;
};

export const getTokenUrl = (): string => {
  return `${TWITCH_AUTH_URL}/token`;
};

// Export types
export interface TwitchAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export interface TwitchErrorResponse {
  error: string;
  status: number;
  message: string;
}

export enum TwitchStreamType {
  LIVE = 'live',
  VODCAST = 'vodcast',
  PREMIERE = 'premiere'
}

// Export validation helpers
export const isTwitchError = (error: any): error is TwitchErrorResponse => {
  return error && typeof error.error === 'string' && typeof error.status === 'number';
};

export const validateTwitchResponse = <T>(response: any): T => {
  if (!response || !response.data) {
    throw new Error('Invalid Twitch API response');
  }
  return response.data as T;
};

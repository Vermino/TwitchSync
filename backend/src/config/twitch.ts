import dotenv from 'dotenv';

dotenv.config();

export const TWITCH_CONFIG = {
  clientId: process.env.TWITCH_CLIENT_ID,
  clientSecret: process.env.TWITCH_CLIENT_SECRET,
  redirectUri: process.env.TWITCH_REDIRECT_URI,
  scopes: [
    'user:read:email',           // Read user's email
    'channel:read:vods',         // Read VODs
    'channel:read:stream_key',   // Read stream key
    'user:read:broadcast',       // Read broadcast configuration
    'channel:read:editors',      // Read channel editors
    'clips:edit',                // Create and edit clips
    'channel:manage:broadcast'   // Manage channel broadcast
  ]
};

export const TWITCH_API_URL = 'https://api.twitch.tv/helix';
export const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2';

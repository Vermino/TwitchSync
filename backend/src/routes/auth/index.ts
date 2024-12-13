import { Router } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { logger } from '../../utils/logger';

interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  email: string;
  profile_image_url: string;
  broadcaster_type: string;
}

export function setupAuthRoutes(pool: Pool): Router {
  const router = Router();
  const processedCodes = new Set<string>();

  // Get Twitch OAuth URL
  router.get('/twitch/login', (req, res) => {
    const scopes = [
      'user:read:email',
      'user:read:broadcast',
      'channel:read:stream_key',
      'channel:read:editors',
      'clips:edit',
      'channel:manage:videos',
      'user:read:follows',
      'channel:read:subscriptions'
    ].join(' ');

    const authUrl = `https://id.twitch.tv/oauth2/authorize` +
      `?client_id=${process.env.TWITCH_CLIENT_ID}` +
      `&redirect_uri=${process.env.TWITCH_REDIRECT_URI}` +
      `&response_type=code` +
      `&scope=${scopes}`;

    res.json({ url: authUrl });
  });

  // Handle Twitch OAuth callback
  router.post('/twitch/callback', async (req, res) => {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Check if code has already been processed
    if (processedCodes.has(code)) {
      return res.status(400).json({ error: 'Authorization code already used' });
    }
    processedCodes.add(code);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      logger.info(`Starting OAuth exchange with code: ${code.substring(0, 6)}...`);
      logger.info('Using redirect URI:', process.env.TWITCH_REDIRECT_URI);

      // First verify our environment variables are set
      if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET || !process.env.TWITCH_REDIRECT_URI) {
        throw new Error('Missing Twitch configuration');
      }

      // Exchange code for access token
      const tokenResponse = await axios.post<TwitchTokenResponse>(
        'https://id.twitch.tv/oauth2/token',
        null,
        {
          params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: process.env.TWITCH_REDIRECT_URI
          }
        }
      );

      const { access_token, refresh_token } = tokenResponse.data;
      logger.info('Successfully obtained access token');

      // Get Twitch user data
      const userResponse = await axios.get<{ data: TwitchUser[] }>(
        'https://api.twitch.tv/helix/users',
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Client-ID': process.env.TWITCH_CLIENT_ID
          }
        }
      );

      const twitchUser = userResponse.data.data[0];
      logger.info(`Retrieved Twitch user data for: ${twitchUser.login}`);

      // Check if user exists
      let result = await client.query(
        'SELECT * FROM users WHERE twitch_id = $1',
        [twitchUser.id]
      );

      let user;
      if (result.rows.length === 0) {
        // Create new user
        const userResult = await client.query(
          `INSERT INTO users (
            twitch_id, username, email, access_token, refresh_token,
            profile_image_url, broadcaster_type, last_login
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          RETURNING *`,
          [
            twitchUser.id,
            twitchUser.login,
            twitchUser.email,
            access_token,
            refresh_token,
            twitchUser.profile_image_url,
            twitchUser.broadcaster_type
          ]
        );
        user = userResult.rows[0];
        logger.info(`Created new user: ${user.username}`);
      } else {
        // Update existing user
        const updateResult = await client.query(
          `UPDATE users SET
           access_token = $1,
           refresh_token = $2,
           last_login = CURRENT_TIMESTAMP,
           username = $3,
           email = $4,
           profile_image_url = $5,
           broadcaster_type = $6
           WHERE twitch_id = $7
           RETURNING *`,
          [
            access_token,
            refresh_token,
            twitchUser.login,
            twitchUser.email,
            twitchUser.profile_image_url,
            twitchUser.broadcaster_type,
            twitchUser.id
          ]
        );
        user = updateResult.rows[0];
        logger.info(`Updated existing user: ${user.username}`);
      }

      // Create JWT token
      const token = jwt.sign(
        { id: user.id, twitch_id: user.twitch_id },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      await client.query('COMMIT');

      // Clean up the processed code after a delay
      setTimeout(() => processedCodes.delete(code), 5000);

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          twitch_account: {
            username: user.username,
            profile_image_url: user.profile_image_url
          }
        }
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Auth callback error:', {
        error: error.response?.data || error.message,
        status: error.response?.status,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          params: error.config?.params ? {
            ...error.config.params,
            client_secret: '***'
          } : undefined
        }
      });

      res.status(500).json({
        error: 'Authentication failed',
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          type: error.name,
          stack: error.stack
        } : undefined
      });
    } finally {
      client.release();
    }
  });

  // Get current user
  router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
      const result = await pool.query(
        `SELECT id, username, email, profile_image_url, broadcaster_type, last_login 
         FROM users WHERE id = $1`,
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const user = result.rows[0];
      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          twitch_account: {
            username: user.username,
            profile_image_url: user.profile_image_url,
            broadcaster_type: user.broadcaster_type
          },
          last_login: user.last_login
        }
      });
    } catch (error) {
      logger.error('Token verification failed:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Refresh token
  router.post('/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    try {
      const response = await axios.post<TwitchTokenResponse>(
        'https://id.twitch.tv/oauth2/token',
        null,
        {
          params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            refresh_token,
            grant_type: 'refresh_token'
          }
        }
      );

      const { access_token, refresh_token: new_refresh_token } = response.data;

      // Update tokens in database
      const result = await pool.query(
        `UPDATE users 
         SET access_token = $1, 
             refresh_token = $2,
             last_login = CURRENT_TIMESTAMP
         WHERE refresh_token = $3 
         RETURNING id, username, email`,
        [access_token, new_refresh_token, refresh_token]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      logger.error('Token refresh failed:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  });

  // Logout
  router.post('/logout', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };
      await pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [decoded.id]
      );
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout failed:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Revoke Twitch access
  router.post('/twitch/revoke', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: number };

      const result = await pool.query(
        'SELECT access_token FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { access_token } = result.rows[0];

      // Revoke token with Twitch
      await axios.post('https://id.twitch.tv/oauth2/revoke', null, {
        params: {
          client_id: process.env.TWITCH_CLIENT_ID,
          token: access_token
        }
      });

      // Clear Twitch-specific fields
      await pool.query(
        `UPDATE users 
         SET access_token = NULL,
             refresh_token = NULL,
             token_expires_at = NULL
         WHERE id = $1`,
        [decoded.id]
      );

      res.json({ message: 'Twitch access revoked successfully' });
    } catch (error) {
      logger.error('Failed to revoke Twitch access:', error);
      res.status(500).json({ error: 'Failed to revoke Twitch access' });
    }
  });

  return router;
}

export default setupAuthRoutes;

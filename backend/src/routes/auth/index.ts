// Filepath: backend/src/routes/auth/index.ts

import { Router } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { logger } from '../../utils/logger';
import { callbackRateLimiter } from '../../middleware/authRateLimiter';
import { authenticate } from '../../middleware/auth';
import { AuthError } from './validation';

export function setupAuthRoutes(pool: Pool): Router {
  const router = Router();
  const processedCodes = new Set<string>();

  // Get current user info
  router.get('/me', authenticate(pool), async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new AuthError('User not authenticated');
      }

      const result = await pool.query(`
        SELECT 
          u.id,
          u.username,
          u.email,
          u.profile_image_url,
          u.broadcaster_type,
          u.created_at,
          json_build_object(
            'username', u.username,
            'profile_image_url', u.profile_image_url
          ) as twitch_account
        FROM users u
        WHERE u.id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        throw new AuthError('User not found');
      }

      const user = result.rows[0];

      res.json({ user });
    } catch (error) {
      logger.error('Error fetching user info:', error);
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to fetch user info' });
      }
    }
  });

  // Handle Twitch OAuth callback
  router.post('/twitch/callback',
    callbackRateLimiter,
    async (req, res) => {
      const { code } = req.body;

      logger.info('Processing Twitch callback:', {
        code: code ? `${code.substring(0, 5)}...` : undefined,
        body: req.body
      });

      if (!code) {
        logger.error('No authorization code provided');
        return res.status(400).json({ error: 'Authorization code required' });
      }

      // Check if code has already been processed
      if (processedCodes.has(code)) {
        logger.warn('Authorization code reuse attempt');
        return res.status(400).json({ error: 'Authorization code already used' });
      }

      try {
        // Exchange code for access token
        logger.info('Exchanging code for access token...');

        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
          params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: process.env.TWITCH_REDIRECT_URI
          }
        });

        logger.info('Token exchange successful');

        const { access_token, refresh_token } = tokenResponse.data;

        // Get Twitch user data
        logger.info('Fetching Twitch user data...');

        const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
          headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${access_token}`
          }
        });

        const twitchUser = userResponse.data.data[0];
        logger.info('Twitch user data fetched:', {
          username: twitchUser.login,
          id: twitchUser.id
        });

        // Start transaction
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Check if user exists
          const existingUser = await client.query(
            'SELECT * FROM users WHERE twitch_id = $1',
            [twitchUser.id]
          );

          let user;
          if (existingUser.rows.length === 0) {
            // Create new user
            const result = await client.query(`
              INSERT INTO users (
                twitch_id, username, email, access_token, refresh_token,
                profile_image_url, broadcaster_type, last_login,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              RETURNING *
            `, [
              twitchUser.id,
              twitchUser.login,
              twitchUser.email,
              access_token,
              refresh_token,
              twitchUser.profile_image_url,
              twitchUser.broadcaster_type
            ]);
            user = result.rows[0];
            logger.info('New user created');
          } else {
            // Update existing user
            const result = await client.query(`
              UPDATE users 
              SET access_token = $1,
                  refresh_token = $2,
                  username = $3,
                  email = $4,
                  profile_image_url = $5,
                  broadcaster_type = $6,
                  last_login = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
              WHERE twitch_id = $7
              RETURNING *
            `, [
              access_token,
              refresh_token,
              twitchUser.login,
              twitchUser.email,
              twitchUser.profile_image_url,
              twitchUser.broadcaster_type,
              twitchUser.id
            ]);
            user = result.rows[0];
            logger.info('Existing user updated');
          }

          await client.query('COMMIT');

          // Add code to processed set
          processedCodes.add(code);

          // Create JWT token
          const token = jwt.sign(
            {
              id: user.id,
              twitch_id: user.twitch_id,
              type: 'access'
            },
            process.env.JWT_SECRET!,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
          );

          // Clean up the processed code after a delay
          setTimeout(() => {
            processedCodes.delete(code);
            logger.debug('Cleared processed code from cache');
          }, 5000);

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

        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }

      } catch (error) {
        logger.error('Auth callback error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          code: error instanceof Error && 'response' in error ? (error.response as any)?.status : undefined,
          data: error instanceof Error && 'response' in error ? (error.response as any)?.data : undefined
        });

        if (axios.isAxiosError(error) && error.response) {
          return res.status(error.response.status).json({
            error: 'Authentication failed',
            details: error.response.data
          });
        }

        return res.status(500).json({ error: 'Authentication failed' });
      }
    }
  );

  // Handle logout
  router.post('/logout', authenticate(pool), async (req, res) => {
    try {
      const userId = req.user?.id;
      if (userId) {
        await pool.query(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
          [userId]
        );
      }
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({ error: 'Failed to logout' });
    }
  });

  // Handle Twitch disconnect
  router.post('/twitch/disconnect', authenticate(pool), async (req, res) => {
    try {
      const userId = req.user?.id;

      await pool.query(`
        UPDATE users 
        SET access_token = NULL,
            refresh_token = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [userId]);

      res.json({ message: 'Twitch disconnected successfully' });
    } catch (error) {
      logger.error('Twitch disconnect error:', error);
      res.status(500).json({ error: 'Failed to disconnect Twitch' });
    }
  });

  return router;
}

export default setupAuthRoutes;

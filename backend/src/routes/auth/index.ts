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

  // Get Twitch OAuth URL
  router.get('/twitch/url', async (req, res) => {
    try {
      const clientId = process.env.TWITCH_CLIENT_ID;
      const redirectUri = process.env.TWITCH_REDIRECT_URI;

      // Check if we have valid credentials
      if (!clientId || !redirectUri ||
        clientId.includes('your_twitch_client_id') ||
        clientId.includes('dev_test_client')) {
        return res.status(400).json({
          error: 'Invalid Twitch configuration',
          message: 'Please configure valid Twitch credentials',
          instructions: 'Go to https://dev.twitch.tv/console/apps to create a Twitch app and get credentials',
          redirectTo: '/settings'
        });
      }

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'user:read:email user:read:follows',
        force_verify: 'true',
        state: Math.random().toString(36).substring(2, 15)
      });

      const authUrl = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;

      res.json({ url: authUrl });
    } catch (error) {
      logger.error('Error generating auth URL:', error);
      res.status(500).json({ error: 'Failed to generate auth URL' });
    }
  });

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

  // Handle Twitch OAuth callback (GET - standard OAuth flow)
  router.get('/twitch/callback',
    callbackRateLimiter,
    async (req, res) => {
      const { code } = req.query;

      logger.info('Processing Twitch callback (GET):', {
        code: code ? `${String(code).substring(0, 5)}...` : undefined,
        query: req.query
      });

      if (!code) {
        logger.error('No authorization code provided in query params');
        return res.status(400).json({ error: 'Authorization code required' });
      }

      // Check if code has already been processed
      if (processedCodes.has(String(code))) {
        logger.warn('Authorization code reuse attempt');
        return res.status(400).json({ error: 'Authorization code already used' });
      }

      try {
        // Check if we have valid credentials before making API calls
        const clientId = process.env.TWITCH_CLIENT_ID;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret ||
          clientId.includes('your_twitch_client_id') ||
          clientId.includes('dev_test_client')) {
          return res.status(400).json({
            error: 'Invalid Twitch configuration',
            message: 'Please configure valid Twitch credentials to complete authentication',
            instructions: 'Go to https://dev.twitch.tv/console/apps to create a Twitch app and get credentials'
          });
        }

        // Exchange code for access token
        logger.info('Exchanging code for access token...');

        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
          params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: process.env.TWITCH_REDIRECT_URI
          },
          timeout: 10000
        });

        logger.info('Token exchange successful');

        const { access_token, refresh_token } = tokenResponse.data;

        // Get Twitch user data
        const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Client-Id': process.env.TWITCH_CLIENT_ID
          },
          timeout: 10000
        });

        const twitchUser = userResponse.data.data[0];

        logger.info('Got Twitch user data:', {
          id: twitchUser.id,
          username: twitchUser.display_name
        });

        // Mark code as processed
        processedCodes.add(String(code));

        // Store or update user in database
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const result = await client.query(`
            INSERT INTO users (
              twitch_id, username, display_name, email, 
              profile_image_url, broadcaster_type
            ) 
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (twitch_id) 
            DO UPDATE SET 
              username = EXCLUDED.username,
              display_name = EXCLUDED.display_name,
              email = EXCLUDED.email,
              profile_image_url = EXCLUDED.profile_image_url,
              broadcaster_type = EXCLUDED.broadcaster_type,
              updated_at = NOW()
            RETURNING *
          `, [
            twitchUser.id,
            twitchUser.login,
            twitchUser.display_name,
            twitchUser.email,
            twitchUser.profile_image_url,
            twitchUser.broadcaster_type || 'user'
          ]);

          const user = result.rows[0];

          // Update user with tokens (stored directly in users table)
          await client.query(`
            UPDATE users SET
              access_token = $2,
              refresh_token = $3,
              token_expires_at = $4,
              updated_at = NOW()
            WHERE id = $1
          `, [
            user.id,
            access_token,
            refresh_token,
            new Date(Date.now() + (tokenResponse.data.expires_in || 3600) * 1000)
          ]);

          await client.query('COMMIT');

          // Generate JWT
          const token = jwt.sign(
            {
              userId: user.id,
              twitchId: user.twitch_id,
              username: user.username
            },
            process.env.JWT_SECRET!,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
          );

          logger.info('User authentication successful:', {
            userId: user.id,
            username: user.username
          });

          // Redirect to frontend with token
          const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}`;
          res.redirect(redirectUrl);

        } catch (dbError) {
          await client.query('ROLLBACK');
          throw dbError;
        } finally {
          client.release();
        }

      } catch (error: any) {
        logger.error('Auth callback error:', {
          error: error.message,
          code: error.response?.status,
          data: error.response?.data
        });

        if (error.response?.status === 400) {
          return res.status(400).json({
            error: 'Invalid authorization code',
            message: 'The authorization code is invalid or has expired. Please try again.'
          });
        }

        res.status(500).json({
          error: 'Authentication failed',
          message: 'An error occurred during authentication. Please try again.'
        });
      }
    }
  );

  // Handle Twitch OAuth callback (POST - for backwards compatibility)
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
        // Check if we have valid credentials before making API calls
        const clientId = process.env.TWITCH_CLIENT_ID;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret ||
          clientId.includes('your_twitch_client_id') ||
          clientId.includes('dev_test_client')) {
          return res.status(400).json({
            error: 'Invalid Twitch configuration',
            message: 'Please configure valid Twitch credentials to complete authentication',
            instructions: 'Go to https://dev.twitch.tv/console/apps to create a Twitch app and get credentials'
          });
        }

        // Exchange code for access token
        logger.info('Exchanging code for access token...');

        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
          params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: process.env.TWITCH_REDIRECT_URI
          },
          timeout: 10000
        });

        logger.info('Token exchange successful');

        const { access_token, refresh_token } = tokenResponse.data;

        // Get Twitch user data
        logger.info('Fetching Twitch user data...');

        const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
          headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${access_token}`
          },
          timeout: 10000
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

          // Create JWT token - must match TokenPayload in middleware/auth.ts
          const token = jwt.sign(
            {
              userId: user.id,
              twitchId: user.twitch_id,
              username: user.username
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

import { Router } from 'express';
import { TwitchAuthManager } from '../../utils/twitch-auth';
import { logger } from '../../utils/logger';

export function setupAuthRoutes(): Router {
  const router = Router();
  const authManager = new TwitchAuthManager(
    process.env.TWITCH_CLIENT_ID!,
    process.env.TWITCH_CLIENT_SECRET!
  );

  // Handle OAuth callback
  router.get('/callback', async (req, res) => {
    try {
      const { code } = req.query;
      if (!code || typeof code !== 'string') {
        throw new Error('Invalid authorization code');
      }

      const tokens = await authManager.exchangeCode(
        code,
        `${process.env.APP_URL}/auth/callback`
      );

      // In a real app, you'd want to store these tokens securely
      // and associate them with the user's session
      res.json({
        access_token: tokens.access_token,
        expires_in: tokens.expires_in
      });
    } catch (error) {
      logger.error('OAuth callback failed:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // Validate token
  router.post('/validate', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: 'No token provided' });
      }

      const isValid = await authManager.validateToken(token);
      res.json({ valid: isValid });
    } catch (error) {
      logger.error('Token validation failed:', error);
      res.status(500).json({ error: 'Validation failed' });
    }
  });

  // Refresh token
  router.post('/refresh', async (req, res) => {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) {
        return res.status(400).json({ error: 'No refresh token provided' });
      }

      const tokens = await authManager.refreshToken(refresh_token);
      res.json(tokens);
    } catch (error) {
      logger.error('Token refresh failed:', error);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  });

  return router;
}

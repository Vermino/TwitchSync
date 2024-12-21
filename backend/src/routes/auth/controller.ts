// Filepath: backend/src/routes/auth/controller.ts

import { Request, Response } from 'express';
import { AuthService } from '../../services/auth';
import { logger } from '../../utils/logger';
import { TwitchTokenResponse, TwitchUserResponse } from '../../types/auth';

export class AuthController {
  constructor(private authService: AuthService) {}

  async getCurrentUser(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { user, twitchAccount } = await this.authService.getUserWithTwitchAccount(parseInt(userId));

      return res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          twitch_account: twitchAccount ? {
            username: twitchAccount.username,
            profile_image_url: twitchAccount.profile_image_url
          } : null
        }
      });
    } catch (error) {
      logger.error('Error fetching current user:', error);
      return res.status(500).json({ error: 'Failed to fetch user info' });
    }
  }

  async handleTwitchCallback(req: Request, res: Response) {
    try {
      const { code, state } = req.body;

      if (!code) {
        return res.status(400).json({ error: 'Authorization code required' });
      }

      // Exchange code for access token
      const tokenResponse: TwitchTokenResponse = await this.authService.exchangeCode(code);

      // Get Twitch user data
      const twitchUser: TwitchUserResponse = await this.authService.getTwitchUser(tokenResponse.access_token);

      // Create or update user account
      const { user, twitchAccount } = await this.authService.createOrUpdateTwitchAccount(
        twitchUser,
        tokenResponse
      );

      // Create session
      const token = await this.authService.createSession(user.id);

      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          twitch_account: {
            username: twitchAccount.username,
            profile_image_url: twitchAccount.profile_image_url
          }
        }
      });
    } catch (error) {
      logger.error('Twitch callback error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        await this.authService.logout(token);
      }
      return res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error:', error);
      return res.status(500).json({ error: 'Failed to logout' });
    }
  }

  async disconnectTwitch(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await this.authService.revokeAccess(parseInt(userId));
      return res.json({ message: 'Twitch disconnected successfully' });
    } catch (error) {
      logger.error('Twitch disconnect error:', error);
      return res.status(500).json({ error: 'Failed to disconnect Twitch' });
    }
  }
}

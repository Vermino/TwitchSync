import axios from 'axios';
import { logger } from './logger';

export class TwitchAuthManager {
  private static readonly TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  private static readonly VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(TwitchAuthManager.VALIDATE_URL, {
        headers: {
          'Authorization': `OAuth ${accessToken}`
        }
      });
      return response.status === 200;
    } catch (error) {
      logger.error('Token validation failed:', error);
      return false;
    }
  }

  async exchangeCode(code: string, redirectUri: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    try {
      const response = await axios.post(TwitchAuthManager.TOKEN_URL, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      });

      return response.data;
    } catch (error) {
      logger.error('Code exchange failed:', error);
      throw error;
    }
  }

  async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    try {
      const response = await axios.post(TwitchAuthManager.TOKEN_URL, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      return response.data;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  }
}

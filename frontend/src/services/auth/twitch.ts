// Filepath: frontend/src/services/auth/twitch.ts

import { logger } from '../../utils/logger';

export interface TwitchAuthConfig {
  clientId: string;
  redirectUri: string;
}

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

export class TwitchAuth {
  private static readonly AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
  private static readonly TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  private static readonly FORCE_VERIFY = true;

  // Required scopes for the application - only using confirmed working scopes
  private static readonly SCOPES = [
    'user:read:email',
    'user:read:follows'
  ];

  constructor(private config: TwitchAuthConfig) {}

  /**
   * Get the authorization URL for Twitch OAuth
   * @returns The complete authorization URL
   */
  public getAuthUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: TwitchAuth.SCOPES.join(' '),
      force_verify: String(TwitchAuth.FORCE_VERIFY),
      state: this.generateState()
    });

    return `${TwitchAuth.AUTH_URL}?${params.toString()}`;
  }

  /**
   * Handle the OAuth callback from Twitch
   * @param code The authorization code from Twitch
   * @returns JWT token from our backend
   */
  public async handleCallback(code: string): Promise<string> {
    try {
      logger.info('Processing Twitch callback code');

      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/twitch/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code })
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Callback error:', error);
        throw new Error(error.message || 'Failed to authenticate with Twitch');
      }

      const data = await response.json();
      logger.info('Successfully processed Twitch callback');
      return data.token;
    } catch (error) {
      logger.error('Failed to handle Twitch callback:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Twitch and revoke tokens
   * @param token The JWT token to revoke
   */
  public async disconnect(token: string): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/twitch/disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to disconnect from Twitch');
      }

      logger.info('Successfully disconnected from Twitch');
    } catch (error) {
      logger.error('Failed to disconnect from Twitch:', error);
      throw error;
    }
  }

  /**
   * Validate a Twitch access token
   * @param token The access token to validate
   * @returns Boolean indicating if token is valid
   */
  public async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: {
          'Authorization': `OAuth ${token}`
        }
      });

      return response.status === 200;
    } catch (error) {
      logger.error('Token validation failed:', error);
      return false;
    }
  }

  /**
   * Get scopes associated with a token
   * @returns Array of scope strings
   */
  public getScopes(): string[] {
    return TwitchAuth.SCOPES;
  }

  /**
   * Generate a random state string for OAuth security
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Create and export a singleton instance
export const twitchAuth = new TwitchAuth({
  clientId: import.meta.env.VITE_TWITCH_CLIENT_ID,
  redirectUri: import.meta.env.VITE_TWITCH_REDIRECT_URI
});

export default twitchAuth;

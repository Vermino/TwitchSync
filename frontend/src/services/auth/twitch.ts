import { logger } from '@/utils/logger';

export interface TwitchAuthConfig {
  clientId: string;
  redirectUri: string;
  scope: string[];
}

export class TwitchAuth {
  private static readonly AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
  private static readonly TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

  constructor(private config: TwitchAuthConfig) {}

  public getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scope.join(' '),
      force_verify: 'true'
    });

    return `${TwitchAuth.AUTH_URL}?${params.toString()}`;
  }

  public async handleCallback(code: string): Promise<string> {
    try {
      const response = await fetch(TwitchAuth.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: process.env.TWITCH_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.config.redirectUri
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to get access token');
      }

      return data.access_token;
    } catch (error) {
      logger.error('Failed to handle Twitch callback:', error);
      throw error;
    }
  }
}

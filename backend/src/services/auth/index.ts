import { Pool } from 'pg';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// Configure axios defaults for all Twitch API calls
axios.defaults.timeout = 15000;
import type {
  User,
  TwitchAccount,
  Session,
  TwitchTokenResponse,
  TwitchUserResponse
} from '../../types/auth';

export class AuthService {
  private pool: Pool;
  private static instance: AuthService;
  private readonly TWITCH_API_URL = 'https://api.twitch.tv/helix';
  private readonly TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2';

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  public static getInstance(pool: Pool): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService(pool);
    }
    return AuthService.instance;
  }

  private getHeaders(accessToken: string) {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Client-ID': process.env.TWITCH_CLIENT_ID!
    };
  }

  async exchangeCode(code: string): Promise<TwitchTokenResponse> {
    try {
      const response = await axios.post<TwitchTokenResponse>(
        `${this.TWITCH_AUTH_URL}/token`,
        null,
        {
          params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: process.env.TWITCH_REDIRECT_URI
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Error exchanging code:', error);
      throw new Error('Failed to exchange authorization code');
    }
  }

  async getTwitchUser(accessToken: string): Promise<TwitchUserResponse> {
    try {
      const response = await axios.get<{ data: TwitchUserResponse[] }>(
        `${this.TWITCH_API_URL}/users`,
        { 
          headers: this.getHeaders(accessToken),
          timeout: 10000
        }
      );

      return response.data.data[0];
    } catch (error) {
      logger.error('Error getting Twitch user:', error);
      throw new Error('Failed to get Twitch user info');
    }
  }

  async createSession(userId: number): Promise<string> {
    const client = await this.pool.connect();

    try {
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Token expires in 7 days

      await client.query(
        `INSERT INTO sessions (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, token, expiresAt]
      );

      return token;
    } catch (error) {
      logger.error('Error creating session:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async createOrUpdateTwitchAccount(
    twitchUser: TwitchUserResponse,
    tokens: TwitchTokenResponse
  ): Promise<{ user: User; twitchAccount: TwitchAccount }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if Twitch account exists
      let result = await client.query<TwitchAccount>(
        'SELECT * FROM twitch_accounts WHERE twitch_id = $1',
        [twitchUser.id]
      );

      let user: User;
      let twitchAccount: TwitchAccount;

      if (result.rows.length === 0) {
        // Create new user and Twitch account
        const userResult = await client.query<User>(
          'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
          [twitchUser.login, twitchUser.email]
        );
        user = userResult.rows[0];

        const twitchResult = await client.query<TwitchAccount>(
          `INSERT INTO twitch_accounts (
            user_id, twitch_id, username, email, profile_image_url,
            access_token, refresh_token, token_expires_at, scope
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [
            user.id,
            twitchUser.id,
            twitchUser.login,
            twitchUser.email,
            twitchUser.profile_image_url,
            tokens.access_token,
            tokens.refresh_token,
            new Date(Date.now() + tokens.expires_in * 1000),
            tokens.scope
          ]
        );
        twitchAccount = twitchResult.rows[0];
      } else {
        // Update existing Twitch account
        twitchAccount = result.rows[0];
        const updateResult = await client.query<TwitchAccount>(
          `UPDATE twitch_accounts SET
           username = $1,
           email = $2,
           profile_image_url = $3,
           access_token = $4,
           refresh_token = $5,
           token_expires_at = $6,
           scope = $7
           WHERE id = $8
           RETURNING *`,
          [
            twitchUser.login,
            twitchUser.email,
            twitchUser.profile_image_url,
            tokens.access_token,
            tokens.refresh_token,
            new Date(Date.now() + tokens.expires_in * 1000),
            tokens.scope,
            twitchAccount.id
          ]
        );
        twitchAccount = updateResult.rows[0];

        // Get associated user
        const userResult = await client.query<User>(
          'SELECT * FROM users WHERE id = $1',
          [twitchAccount.user_id]
        );
        user = userResult.rows[0];
      }

      await client.query('COMMIT');
      return { user, twitchAccount };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating/updating Twitch account:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async validateSession(token: string): Promise<User | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query<Session & { user: User }>(
        `SELECT s.*, u.* FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [token]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].user;
    } catch (error) {
      logger.error('Error validating session:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async refreshTwitchToken(refreshToken: string): Promise<TwitchTokenResponse> {
    try {
      const response = await axios.post<TwitchTokenResponse>(
        `${this.TWITCH_AUTH_URL}/token`,
        null,
        {
          params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
          },
          timeout: 10000
        }
      );

      // Update the token in database
      const client = await this.pool.connect();
      try {
        await client.query(
          `UPDATE twitch_accounts 
           SET access_token = $1, 
               refresh_token = $2, 
               token_expires_at = $3 
           WHERE refresh_token = $4`,
          [
            response.data.access_token,
            response.data.refresh_token,
            new Date(Date.now() + response.data.expires_in * 1000),
            refreshToken
          ]
        );
      } finally {
        client.release();
      }

      return response.data;
    } catch (error) {
      logger.error('Error refreshing token:', error);
      throw new Error('Failed to refresh token');
    }
  }

  async validateTwitchToken(accessToken: string): Promise<boolean> {
    try {
      await axios.get(
        `${this.TWITCH_AUTH_URL}/validate`,
        {
          headers: {
            'Authorization': `OAuth ${accessToken}`
          },
          timeout: 10000
        }
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  async revokeAccess(userId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get Twitch account info
      const result = await client.query<TwitchAccount>(
        'SELECT * FROM twitch_accounts WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length > 0) {
        const { access_token } = result.rows[0];

        // Revoke token with Twitch
        try {
          await axios.post(
            `${this.TWITCH_AUTH_URL}/revoke`,
            null,
            {
              params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                token: access_token
              },
              timeout: 10000
            }
          );
        } catch (error) {
          logger.error('Error revoking Twitch token:', error);
        }

        // Remove Twitch account
        await client.query(
          'DELETE FROM twitch_accounts WHERE user_id = $1',
          [userId]
        );
      }

      // Remove all sessions
      await client.query(
        'DELETE FROM sessions WHERE user_id = $1',
        [userId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error revoking access:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async logout(token: string): Promise<void> {
    try {
      await this.pool.query(
        'DELETE FROM sessions WHERE token = $1',
        [token]
      );
    } catch (error) {
      logger.error('Error logging out:', error);
      throw error;
    }
  }

  async getUserWithTwitchAccount(userId: number): Promise<{ user: User; twitchAccount: TwitchAccount | null }> {
    const client = await this.pool.connect();

    try {
      const userResult = await client.query<User>(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const twitchResult = await client.query<TwitchAccount>(
        'SELECT * FROM twitch_accounts WHERE user_id = $1',
        [userId]
      );

      return {
        user: userResult.rows[0],
        twitchAccount: twitchResult.rows[0] || null
      };
    } catch (error) {
      logger.error('Error getting user with Twitch account:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async refreshTokenIfNeeded(userId: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      const result = await client.query<TwitchAccount>(
        `SELECT * FROM twitch_accounts 
         WHERE user_id = $1 
         AND token_expires_at <= NOW() + interval '1 hour'`,
        [userId]
      );

      if (result.rows.length > 0) {
        const { refresh_token } = result.rows[0];
        if (refresh_token) {
          await this.refreshTwitchToken(refresh_token);
        }
      }
    } catch (error) {
      logger.error('Error refreshing token:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteExpiredSessions(): Promise<void> {
    try {
      await this.pool.query(
        'DELETE FROM sessions WHERE expires_at < NOW()'
      );
    } catch (error) {
      logger.error('Error deleting expired sessions:', error);
      throw error;
    }
  }

  startSessionCleanup(intervalMinutes: number = 60): void {
    setInterval(() => {
      this.deleteExpiredSessions().catch(error => {
        logger.error('Error in session cleanup interval:', error);
      });
    }, intervalMinutes * 60 * 1000);
  }
}

export const authService = (pool: Pool) => AuthService.getInstance(pool);
export default authService;

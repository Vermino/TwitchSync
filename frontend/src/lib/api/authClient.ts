// Filepath: frontend/src/lib/api/authClient.ts

import { BaseApiClient } from './baseClient';

export class AuthClient extends BaseApiClient {
  async twitchCallback(code: string) {
    try {
      const response = await this.axios.post(
        `${this.authURL}/twitch/callback`,
        { code },
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error during Twitch callback:', error);
      throw this.handleError(error);
    }
  }

  async checkAuth() {
    try {
      const response = await this.axios.get(
        `${this.authURL}/me`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error checking auth status:', error);
      throw this.handleError(error);
    }
  }

  async logout() {
    try {
      const response = await this.axios.post(
        `${this.authURL}/logout`,
        {},
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error during logout:', error);
      throw this.handleError(error);
    }
  }

  async revokeTwitchAccess() {
    try {
      const response = await this.axios.post(
        `${this.authURL}/twitch/revoke`,
        {},
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error revoking Twitch access:', error);
      throw this.handleError(error);
    }
  }
}

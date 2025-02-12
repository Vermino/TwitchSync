// Filepath: frontend/src/lib/api/settingsClient.ts

import { BaseApiClient } from './baseClient';
import { SettingsState } from '@/types';

export class SettingsClient extends BaseApiClient {
  async getSystemSettings(): Promise<SettingsState> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/settings/system`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching system settings:', error);
      throw this.handleError(error);
    }
  }

  async updateSystemSettings(settings: SettingsState): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/settings/system`,
        settings,
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error updating system settings:', error);
      throw this.handleError(error);
    }
  }

  async getStorageStats(): Promise<{ totalSpace: number; usedSpace: number; freeSpace: number }> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/settings/storage`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching storage stats:', error);
      throw this.handleError(error);
    }
  }

  async selectFolder(): Promise<{ path: string }> {
    try {
      const response = await this.axios.post(
        `${this.baseURL}/settings/select-folder`,
        {},
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error selecting folder:', error);
      throw this.handleError(error);
    }
  }

  async runStorageCleanup(): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/settings/storage/cleanup`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error running storage cleanup:', error);
      throw this.handleError(error);
    }
  }

  async getUserSettings() {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/settings`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching user settings:', error);
      throw this.handleError(error);
    }
  }

  async updateUserSettings(settings: {
    notifications?: Record<string, boolean>;
    discovery?: Record<string, any>;
    schedule?: Record<string, any>;
  }) {
    try {
      const response = await this.axios.put(
        `${this.baseURL}/settings`,
        settings,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating user settings:', error);
      throw this.handleError(error);
    }
  }
}

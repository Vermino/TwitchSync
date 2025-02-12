// Filepath: frontend/src/lib/api/index.ts

import { AuthClient } from './authClient';
import { TaskClient } from './taskClient';
import { ChannelClient } from './channelClient';
import { GameClient } from './gameClient';
import { DiscoveryClient } from './discoveryClient';
import { SettingsClient } from './settingsClient';
import { VodClient } from './vodClient';
import { TaskMonitoringClient } from './taskMonitoringClient';

class ApiClient {
  private static instance: ApiClient;

  public auth: AuthClient;
  public tasks: TaskClient;
  public channels: ChannelClient;
  public games: GameClient;
  public discovery: DiscoveryClient;
  public settings: SettingsClient;
  public vods: VodClient;
  public taskMonitoring: TaskMonitoringClient;

  private constructor() {
    this.auth = new AuthClient();
    this.tasks = new TaskClient();
    this.channels = new ChannelClient();
    this.games = new GameClient();
    this.discovery = new DiscoveryClient();
    this.settings = new SettingsClient();
    this.vods = new VodClient();
    this.taskMonitoring = new TaskMonitoringClient();
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }
}

// Create and export the API instance
export const api = ApiClient.getInstance();
export default api;

// Re-export all types
export type { TaskStats, PerformanceMetric, TaskAlert } from './taskMonitoringClient';
export type { VodData } from './vodClient';
export * from './types';

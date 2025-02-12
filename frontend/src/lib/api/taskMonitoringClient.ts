// Filepath: frontend/src/lib/api/taskMonitoringClient.ts

import { BaseApiClient } from './baseClient';

export interface TaskStats {
  successRate: number;
  errorRate: number;
  storageUsedGB: number;
  storageLimitGB: number;
  activeDownloads: number;
  maxConcurrent: number;
  totalVods: number;
  completedVods: number;
  failedVods: number;
}

export interface PerformanceMetric {
  timestamp: string;
  successRate: number;
  downloadSpeed: number;
  storageUsed: number;
  vodCount: number;
}

export interface TaskAlert {
  id: number;
  type: 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, any>;
  created_at: string;
  acknowledged: boolean;
}

export class TaskMonitoringClient extends BaseApiClient {
  async getTaskStats(taskId: number): Promise<TaskStats> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/tasks/${taskId}/stats`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task stats:', error);
      throw this.handleError(error);
    }
  }

  async getTaskPerformance(
    taskId: number,
    timeRange: 'hour' | 'day' | 'week' = 'day'
  ): Promise<PerformanceMetric[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/tasks/${taskId}/performance`,
        {
          params: { timeRange },
          headers: this.getHeaders()
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task performance:', error);
      throw this.handleError(error);
    }
  }

  async getTaskAlerts(taskId: number): Promise<TaskAlert[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/tasks/${taskId}/alerts`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task alerts:', error);
      throw this.handleError(error);
    }
  }

  async acknowledgeAlert(alertId: number): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/tasks/alerts/${alertId}/acknowledge`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      throw this.handleError(error);
    }
  }
}

// Filepath: frontend/src/lib/api/taskMonitoring.ts

import { api } from '../api';

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

export const taskMonitoringApi = {
  getTaskStats: async (taskId: number): Promise<TaskStats> => {
    const response = await api.get(`/tasks/${taskId}/stats`);
    return response.data;
  },

  getTaskPerformance: async (
    taskId: number,
    timeRange: 'hour' | 'day' | 'week' = 'day'
  ): Promise<PerformanceMetric[]> => {
    const response = await api.get(`/tasks/${taskId}/performance`, {
      params: { timeRange }
    });
    return response.data;
  },

  getTaskAlerts: async (taskId: number): Promise<TaskAlert[]> => {
    const response = await api.get(`/tasks/${taskId}/alerts`);
    return response.data;
  },

  acknowledgeAlert: async (alertId: number): Promise<void> => {
    await api.post(`/tasks/alerts/${alertId}/acknowledge`);
  }
};

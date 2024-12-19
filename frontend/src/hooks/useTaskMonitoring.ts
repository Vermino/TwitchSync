// Filepath: frontend/src/hooks/useTaskMonitoring.ts

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TaskMonitoringData {
  stats: {
    successRate: number;
    errorRate: number;
    storageUsedGB: number;
    storageLimitGB: number;
    activeDownloads: number;
    maxConcurrent: number;
    totalVods: number;
    completedVods: number;
    failedVods: number;
  };
  performance: Array<{
    timestamp: string;
    successRate: number;
    downloadSpeed: number;
    storageUsed: number;
    vodCount: number;
  }>;
  alerts: Array<{
    id: number;
    type: 'error' | 'warning' | 'info';
    message: string;
    details?: Record<string, any>;
    created_at: string;
    acknowledged: boolean;
  }>;
}

export function useTaskMonitoring(taskId: string | undefined) {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['taskStats', taskId],
    queryFn: () => api.get(`/tasks/${taskId}/stats`).then(res => res.data),
    enabled: !!taskId,
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  const { data: performance, isLoading: performanceLoading } = useQuery({
    queryKey: ['taskPerformance', taskId],
    queryFn: () => api.get(`/tasks/${taskId}/performance`).then(res => res.data),
    enabled: !!taskId,
    refetchInterval: 30000
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['taskAlerts', taskId],
    queryFn: () => api.get(`/tasks/${taskId}/alerts`).then(res => res.data),
    enabled: !!taskId,
    refetchInterval: 30000
  });

  return {
    stats,
    performance,
    alerts,
    isLoading: statsLoading || performanceLoading || alertsLoading,
    refetch: () => {
      // Manually refetch all queries
      queryClient.invalidateQueries(['taskStats', taskId]);
      queryClient.invalidateQueries(['taskPerformance', taskId]);
      queryClient.invalidateQueries(['taskAlerts', taskId]);
    }
  };
}

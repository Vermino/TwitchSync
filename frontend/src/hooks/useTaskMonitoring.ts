// Filepath: frontend/src/hooks/useTaskMonitoring.ts

import { useQuery, useQueryClient } from '@tanstack/react-query';
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

interface UseTaskMonitoringOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

export function useTaskMonitoring(taskId: string | undefined, options: UseTaskMonitoringOptions = {}) {
  const queryClient = useQueryClient();
  const { enabled = true, refetchInterval = 30000 } = options;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['taskStats', taskId],
    queryFn: () => api.getTaskProgress(taskId!),
    enabled: !!taskId && enabled,
    refetchInterval,
    retry: 3
  });

  const { data: performance, isLoading: performanceLoading } = useQuery({
    queryKey: ['taskPerformance', taskId],
    queryFn: () => api.getTaskStorage(taskId!),
    enabled: !!taskId && enabled,
    refetchInterval,
    retry: 3
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['taskAlerts', taskId],
    queryFn: async () => {
      const details = await api.getTaskDetails(taskId!);
      return details.alerts || [];
    },
    enabled: !!taskId && enabled,
    refetchInterval,
    retry: 3
  });

  const acknowledgeAlert = async (alertId: number) => {
    try {
      await api.updateTaskDetails(taskId!, {
        acknowledgedAlerts: [alertId]
      });
      queryClient.invalidateQueries(['taskAlerts', taskId]);
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      throw error;
    }
  };

  const refetchAll = () => {
    queryClient.invalidateQueries(['taskStats', taskId]);
    queryClient.invalidateQueries(['taskPerformance', taskId]);
    queryClient.invalidateQueries(['taskAlerts', taskId]);
  };

  return {
    stats,
    performance,
    alerts,
    isLoading: statsLoading || performanceLoading || alertsLoading,
    acknowledgeAlert,
    refetch: refetchAll
  };
}

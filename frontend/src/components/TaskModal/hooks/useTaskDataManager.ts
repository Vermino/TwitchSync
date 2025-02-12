// Filepath: frontend/src/components/TaskModal/hooks/useTaskDataManager.ts

import { useState, useCallback } from 'react';
import type { Task, CreateTaskRequest } from '@/types/task';

const DEFAULT_TASK_DATA: CreateTaskRequest = {
  name: '',
  description: '',
  task_type: 'combined',
  channel_ids: [],
  game_ids: [],
  schedule_type: 'interval',
  schedule_value: '3600',
  storage_limit_gb: 0,
  retention_days: 7,
  auto_delete: false,
  priority: 'low', // Changed from 'normal' to 'low' to match backend enum
  conditions: {},
  restrictions: {}
};

export const useTaskDataManager = (initialTask?: Task | null) => {
  const [taskData, setTaskData] = useState<CreateTaskRequest>(() => {
    if (!initialTask) return DEFAULT_TASK_DATA;

    return {
      name: initialTask.name,
      description: initialTask.description || '',
      task_type: initialTask.task_type,
      channel_ids: initialTask.channel_ids || [],
      game_ids: initialTask.game_ids || [],
      schedule_type: initialTask.schedule_type || 'interval',
      schedule_value: initialTask.schedule_value || '3600',
      storage_limit_gb: initialTask.storage_limit_gb || 0,
      retention_days: initialTask.retention_days || 7,
      auto_delete: initialTask.auto_delete || false,
      priority: initialTask.priority || 'low', // Changed from 'normal' to 'low'
      conditions: initialTask.conditions || {},
      restrictions: initialTask.restrictions || {}
    };
  });

  const handleInputChange = useCallback((field: keyof CreateTaskRequest, value: any) => {
    setTaskData(prev => {
      const newData = { ...prev, [field]: value };

      // Handle special cases
      if (field === 'task_type') {
        switch (value) {
          case 'channel':
            newData.game_ids = [];
            break;
          case 'game':
            newData.channel_ids = [];
            break;
        }
      }

      return newData;
    });
  }, []);

  const updateTaskData = useCallback((updates: Partial<CreateTaskRequest>) => {
    setTaskData(prev => ({ ...prev, ...updates }));
  }, []);

  const resetTaskData = useCallback(() => {
    setTaskData(initialTask ? {
      name: initialTask.name,
      description: initialTask.description || '',
      task_type: initialTask.task_type,
      channel_ids: initialTask.channel_ids || [],
      game_ids: initialTask.game_ids || [],
      schedule_type: initialTask.schedule_type || 'interval',
      schedule_value: initialTask.schedule_value || '3600',
      storage_limit_gb: initialTask.storage_limit_gb || 0,
      retention_days: initialTask.retention_days || 7,
      auto_delete: initialTask.auto_delete || false,
      priority: initialTask.priority || 'low', // Changed from 'normal' to 'low'
      conditions: initialTask.conditions || {},
      restrictions: initialTask.restrictions || {}
    } : DEFAULT_TASK_DATA);
  }, [initialTask]);

  return {
    taskData,
    updateTaskData,
    resetTaskData,
    handleInputChange
  };
};

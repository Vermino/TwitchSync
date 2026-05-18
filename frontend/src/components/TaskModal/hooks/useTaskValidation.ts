// Filepath: frontend/src/components/TaskModal/hooks/useTaskValidation.ts

import { useState, useCallback } from 'react';
import type { CreateTaskRequest } from '@/types/task';

export const useTaskValidation = (taskData: Partial<CreateTaskRequest>) => {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];

    // Check for required selections
    if (!taskData.channel_ids?.length && !taskData.game_ids?.length) {
      errors.push('Select at least one channel or game');
    }

    // Validate interval
    if (taskData.schedule_type === 'interval') {
      const interval = parseInt(taskData.schedule_value || '0');
      if (interval < 300) {
        errors.push('Interval must be at least 5 minutes');
      }
    }

    // Validate retention period
    if (taskData.retention_days && (taskData.retention_days < 1 || taskData.retention_days > 365)) {
      errors.push('Retention days must be between 1 and 365');
    }

    // Validate storage limit
    if (taskData.storage_limit_gb && taskData.storage_limit_gb < 0) {
      errors.push('Storage limit must be positive');
    }

    // Validate name
    if (taskData.name && taskData.name.trim().length === 0) {
      errors.push('Task name cannot be empty');
    }

    // Validate schedule value
    if (taskData.schedule_type === 'cron' && !taskData.schedule_value) {
      errors.push('Cron expression is required');
    }

    setValidationErrors(errors);
    return errors;
  }, [taskData]);

  return {
    validationErrors,
    validateForm,
    setValidationErrors
  };
};

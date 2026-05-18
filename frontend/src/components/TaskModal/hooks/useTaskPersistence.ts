// Filepath: frontend/src/components/TaskModal/hooks/useTaskPersistence.ts

import { useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import type { CreateTaskRequest, Task } from '@/types/task';

export const useTaskPersistence = () => {
  const { toast } = useToast();

  const createTask = useCallback(async (taskData: CreateTaskRequest) => {
    try {
      const response = await api.createTask(taskData);
      toast({
        title: 'Task Created',
        description: `Successfully created task "${taskData.name}"`,
      });
      return response;
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create task',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const updateTask = useCallback(async (taskId: string, taskData: Partial<CreateTaskRequest>) => {
    try {
      const response = await api.updateTask(taskId, taskData);
      toast({
        title: 'Task Updated',
        description: `Successfully updated task "${taskData.name}"`,
      });
      return response;
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update task',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const deleteTask = useCallback(async (taskId: string, taskName: string) => {
    try {
      await api.deleteTask(taskId);
      toast({
        title: 'Task Deleted',
        description: `Successfully deleted task "${taskName}"`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete task',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const controlTask = useCallback(async (taskId: string, action: 'start' | 'stop' | 'pause') => {
    try {
      const response = await api.controlTask(taskId, action);
      const actionText = action === 'start' ? 'started' : action === 'stop' ? 'stopped' : 'paused';
      toast({
        title: 'Task Updated',
        description: `Successfully ${actionText} task`,
      });
      return response;
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to ${action} task`,
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  return {
    createTask,
    updateTask,
    deleteTask,
    controlTask,
  };
};

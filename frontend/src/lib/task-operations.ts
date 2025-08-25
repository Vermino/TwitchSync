// Filepath: frontend/src/lib/api/task-operations.ts

import axios from 'axios';
import { Task, CreateTaskRequest, UpdateTaskRequest, TaskDetails, TaskProgress, TaskStorage } from '@/types/task';
import { logger } from '@/utils/logger';

const BASE_URL = '/api';

function getHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

function handleApiError(error: unknown, context: string): never {
  logger.error(`${context}:`, error);

  if (axios.isAxiosError(error)) {
    if (error.response?.data?.details) {
      const details = error.response.data.details;
      const messages = Array.isArray(details)
        ? details.map((detail: any) => detail.message).join(', ')
        : details;
      throw new Error(messages);
    }
    throw new Error(error.response?.data?.message || error.message);
  }

  throw error instanceof Error ? error : new Error('An unknown error occurred');
}

export async function createTask(data: CreateTaskRequest): Promise<Task> {
  try {
    // Create task data with defaults and validation
    const taskData = {
      name: data.name || '',
      description: data.description || '',
      task_type: data.task_type || 'combined',
      channel_ids: data.channel_ids || [],
      game_ids: data.game_ids || [],
      schedule_type: data.schedule_type || 'interval',
      schedule_value: data.schedule_value || '3600',
      storage_limit_gb: Number(data.storage_limit_gb) || 0,
      retention_days: Number(data.retention_days) || 7,
      auto_delete: Boolean(data.auto_delete),
      priority: data.priority || 'normal',
      is_active: true,
      conditions: data.conditions || {},
      restrictions: data.restrictions || {}
    };

    // Basic validation
    if (taskData.retention_days < 1 || taskData.retention_days > 365) {
      throw new Error('Retention days must be between 1 and 365');
    }

    const response = await axios.post(
      `${BASE_URL}/tasks`,
      taskData,
      { headers: getHeaders() }
    );

    return response.data;
  } catch (error) {
    handleApiError(error, 'Error creating task');
  }
}

export async function updateTask(id: number, data: UpdateTaskRequest): Promise<Task> {
  try {
    // Format numerical fields
    const updateData = {
      ...data,
      storage_limit_gb: data.storage_limit_gb !== undefined ? Number(data.storage_limit_gb) : undefined,
      retention_days: data.retention_days !== undefined ? Number(data.retention_days) : undefined
    };

    // Validation
    if (updateData.retention_days &&
        (updateData.retention_days < 1 || updateData.retention_days > 365)) {
      throw new Error('Retention days must be between 1 and 365');
    }

    const response = await axios.put(
      `${BASE_URL}/tasks/${id}`,
      updateData,
      { headers: getHeaders() }
    );

    return response.data;
  } catch (error) {
    handleApiError(error, 'Error updating task');
  }
}

export async function getTasks(): Promise<Task[]> {
  try {
    const response = await axios.get(
      `${BASE_URL}/tasks`,
      { headers: getHeaders() }
    );
    return response.data;
  } catch (error) {
    handleApiError(error, 'Error fetching tasks');
  }
}

export async function getTaskDetails(id: number): Promise<TaskDetails> {
  try {
    const response = await axios.get(
      `${BASE_URL}/tasks/${id}/details`,
      { headers: getHeaders() }
    );
    return response.data;
  } catch (error) {
    handleApiError(error, 'Error fetching task details');
  }
}

export async function deleteTask(id: number): Promise<void> {
  try {
    await axios.delete(
      `${BASE_URL}/tasks/${id}`,
      { headers: getHeaders() }
    );
  } catch (error) {
    handleApiError(error, 'Error deleting task');
  }
}

export async function runTask(id: number): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/tasks/${id}/run`,
      {},
      { headers: getHeaders() }
    );
  } catch (error) {
    handleApiError(error, 'Error running task');
  }
}

export async function getTaskProgress(id: number): Promise<TaskProgress> {
  try {
    const response = await axios.get(
      `${BASE_URL}/tasks/${id}/progress`,
      { headers: getHeaders() }
    );
    return response.data;
  } catch (error) {
    handleApiError(error, 'Error fetching task progress');
  }
}

export async function getTaskStorage(id: number): Promise<TaskStorage> {
  try {
    const response = await axios.get(
      `${BASE_URL}/tasks/${id}/storage`,
      { headers: getHeaders() }
    );
    return response.data;
  } catch (error) {
    handleApiError(error, 'Error fetching task storage');
  }
}

export async function updateTaskStatus(
  id: number,
  status: 'pending' | 'running' | 'inactive'
): Promise<Task> {
  try {
    const response = await axios.put(
      `${BASE_URL}/tasks/${id}`,
      { status },
      { headers: getHeaders() }
    );
    return response.data;
  } catch (error) {
    handleApiError(error, 'Error updating task status');
  }
}

// Task batch operations
export async function batchUpdateTasks(
  taskIds: number[],
  updates: Partial<UpdateTaskRequest>
): Promise<Task[]> {
  try {
    const response = await axios.post(
      `${BASE_URL}/tasks/batch`,
      {
        task_ids: taskIds,
        updates
      },
      { headers: getHeaders() }
    );
    return response.data;
  } catch (error) {
    handleApiError(error, 'Error performing batch task update');
  }
}

export async function batchDeleteTasks(taskIds: number[]): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/tasks/batch-delete`,
      { task_ids: taskIds },
      { headers: getHeaders() }
    );
  } catch (error) {
    handleApiError(error, 'Error performing batch task deletion');
  }
}

// Filepath: frontend/src/lib/api/taskClient.ts

import { BaseApiClient } from './baseClient';
import type { Task, CreateTaskRequest, UpdateTaskRequest, TaskDetails, TaskProgress, TaskStorage } from '@/types';

export class TaskClient extends BaseApiClient {
  async getTasks(): Promise<Task[]> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/tasks`,
        { headers: this.getHeaders() }
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw this.handleError(error);
    }
  }

  async createTask(data: CreateTaskRequest): Promise<Task> {
    try {
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

      if (taskData.retention_days < 1 || taskData.retention_days > 365) {
        throw new Error('Retention days must be between 1 and 365');
      }

      const response = await this.axios.post(
        `${this.baseURL}/tasks`,
        taskData,
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Error creating task:', error);
      throw this.handleError(error);
    }
  }

  async updateTask(id: number, data: UpdateTaskRequest): Promise<Task> {
    try {
      const updateData = {
        ...data,
        storage_limit_gb: data.storage_limit_gb !== undefined ? Number(data.storage_limit_gb) : undefined,
        retention_days: data.retention_days !== undefined ? Number(data.retention_days) : undefined
      };

      if (updateData.retention_days && (updateData.retention_days < 1 || updateData.retention_days > 365)) {
        throw new Error('Retention days must be between 1 and 365');
      }

      const response = await this.axios.put(
        `${this.baseURL}/tasks/${id}`,
        updateData,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating task:', error);
      throw this.handleError(error);
    }
  }

  async deleteTask(id: number): Promise<void> {
    try {
      await this.axios.delete(
        `${this.baseURL}/tasks/${id}`,
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error deleting task:', error);
      throw this.handleError(error);
    }
  }

  async getTaskDetails(id: number): Promise<TaskDetails> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/tasks/${id}/details`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task details:', error);
      throw this.handleError(error);
    }
  }

  async activateTask(taskId: number): Promise<Task> {
    try {
      const response = await this.axios.post(
        `${this.baseURL}/tasks/${taskId}/activate`,
        {},
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error activating task:', error);
      throw this.handleError(error);
    }
  }

  async startTaskDownload(taskId: number): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/tasks/${taskId}/start-download`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error starting task download:', error);
      throw this.handleError(error);
    }
  }

  async queueVodsForTask(taskId: number): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/tasks/${taskId}/queue-vods`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error queueing VODs for task:', error);
      throw this.handleError(error);
    }
  }

  async pauseTask(taskId: number): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/tasks/${taskId}/pause`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error pausing task:', error);
      throw this.handleError(error);
    }
  }

  async resumeTask(taskId: number): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/tasks/${taskId}/resume`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error resuming task:', error);
      throw this.handleError(error);
    }
  }

  async getTaskStatus(taskId: number): Promise<TaskProgress> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/tasks/${taskId}/status`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting task status:', error);
      throw this.handleError(error);
    }
  }

  async getTaskProgress(id: number): Promise<TaskProgress> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/tasks/${id}/progress`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task progress:', error);
      throw this.handleError(error);
    }
  }

  async getTaskStorage(id: number): Promise<TaskStorage> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/tasks/${id}/storage`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching task storage:', error);
      throw this.handleError(error);
    }
  }

  async updateTaskPath(id: number, path: string): Promise<void> {
    try {
      await this.axios.put(
        `${this.baseURL}/tasks/${id}/path`,
        { path },
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error updating task path:', error);
      throw this.handleError(error);
    }
  }

  async runTask(id: number): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/tasks/${id}/run`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error running task:', error);
      throw this.handleError(error);
    }
  }
}

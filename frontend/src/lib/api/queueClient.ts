// Filepath: frontend/src/lib/api/queueClient.ts

import { BaseApiClient } from './baseClient';
import type { 
  QueueItem, 
  QueueStats, 
  DownloadHistoryItem, 
  BulkAction, 
  QueueFilters, 
  QueueSortOptions,
  QueuePriority 
} from '@/types/queue';

export class QueueClient extends BaseApiClient {
  // Queue Management
  async getQueue(filters?: QueueFilters, sort?: QueueSortOptions): Promise<QueueItem[]> {
    try {
      const params = new URLSearchParams();
      
      if (filters) {
        if (filters.status) {
          filters.status.forEach(status => params.append('status', status));
        }
        if (filters.priority) {
          filters.priority.forEach(priority => params.append('priority', priority));
        }
        if (filters.task_id) {
          filters.task_id.forEach(id => params.append('task_id', id.toString()));
        }
        if (filters.search) {
          params.append('search', filters.search);
        }
      }
      
      if (sort) {
        params.append('sort', sort.field);
        params.append('order', sort.direction);
      }

      const response = await this.axios.get(
        `${this.baseURL}/queue${params.toString() ? '?' + params.toString() : ''}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching queue:', error);
      throw this.handleError(error);
    }
  }

  async getQueueStats(): Promise<QueueStats> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/queue/stats`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching queue stats:', error);
      throw this.handleError(error);
    }
  }

  // Queue Item Actions
  async pauseItem(itemId: string): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/queue/${itemId}/pause`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error pausing queue item:', error);
      throw this.handleError(error);
    }
  }

  async resumeItem(itemId: string): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/queue/${itemId}/resume`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error resuming queue item:', error);
      throw this.handleError(error);
    }
  }

  async cancelItem(itemId: string): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/queue/${itemId}/cancel`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error cancelling queue item:', error);
      throw this.handleError(error);
    }
  }

  async retryItem(itemId: string): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/queue/${itemId}/retry`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error retrying queue item:', error);
      throw this.handleError(error);
    }
  }

  async updateItemPriority(itemId: string, priority: QueuePriority): Promise<void> {
    try {
      await this.axios.put(
        `${this.baseURL}/queue/${itemId}/priority`,
        { priority },
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error updating item priority:', error);
      throw this.handleError(error);
    }
  }

  async reorderQueue(itemId: string, newPosition: number): Promise<void> {
    try {
      await this.axios.put(
        `${this.baseURL}/queue/${itemId}/position`,
        { position: newPosition },
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error reordering queue item:', error);
      throw this.handleError(error);
    }
  }

  // Bulk Actions
  async executeBulkAction(action: BulkAction): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/queue/bulk`,
        action,
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error executing bulk action:', error);
      throw this.handleError(error);
    }
  }

  async pauseAll(): Promise<void> {
    return this.executeBulkAction({ type: 'pause_all', target: 'all' });
  }

  async resumeAll(): Promise<void> {
    return this.executeBulkAction({ type: 'resume_all', target: 'all' });
  }

  async clearCompleted(): Promise<void> {
    return this.executeBulkAction({ type: 'clear_completed', target: 'status', status_filter: 'completed' });
  }

  // Download History
  async getHistory(filters?: QueueFilters, sort?: QueueSortOptions, page: number = 1, limit: number = 50): Promise<{
    items: DownloadHistoryItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      if (filters) {
        if (filters.status) {
          filters.status.forEach(status => params.append('status', status));
        }
        if (filters.task_id) {
          filters.task_id.forEach(id => params.append('task_id', id.toString()));
        }
        if (filters.search) {
          params.append('search', filters.search);
        }
      }
      
      if (sort) {
        params.append('sort', sort.field);
        params.append('order', sort.direction);
      }

      const response = await this.axios.get(
        `${this.baseURL}/queue/history?${params.toString()}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching download history:', error);
      throw this.handleError(error);
    }
  }

  async deleteHistoryItem(itemId: string): Promise<void> {
    try {
      await this.axios.delete(
        `${this.baseURL}/queue/history/${itemId}`,
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error deleting history item:', error);
      throw this.handleError(error);
    }
  }

  async retryFromHistory(itemId: string): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/queue/history/${itemId}/retry`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error retrying from history:', error);
      throw this.handleError(error);
    }
  }

  // Download Manager Control - These actually control the download processing engine
  async pauseDownloadManager(): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/downloads/manager/pause`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error pausing download manager:', error);
      throw this.handleError(error);
    }
  }

  async resumeDownloadManager(): Promise<void> {
    try {
      await this.axios.post(
        `${this.baseURL}/downloads/manager/resume`,
        {},
        { headers: this.getHeaders() }
      );
    } catch (error) {
      console.error('Error resuming download manager:', error);
      throw this.handleError(error);
    }
  }

  async getDownloadManagerStatus(): Promise<{
    active_downloads: number;
    queue_status: any;
    system_resources: any;
    metrics: any;
    timestamp: string;
  }> {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/downloads/manager/status`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting download manager status:', error);
      throw this.handleError(error);
    }
  }
}
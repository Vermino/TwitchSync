// Filepath: backend/src/types/queue.ts

import { VOD } from './vod';

export type QueueStatus = 'pending' | 'queued' | 'downloading' | 'completed' | 'failed';
export type QueuePriority = 'low' | 'normal' | 'high' | 'critical';

export interface QueueItem extends VOD {
  task_name: string;
  channel_name: string;
  game_name?: string;
  position_in_queue?: number;
  queue_position?: number; // Added for compatibility with enhanced VOD queries
  estimated_download_time?: number;
  actual_completed_at?: Date;
  actual_file_size?: number;
  download_duration_seconds?: number;
  download_speed_mbps?: number;
}

export interface QueueStats {
  pending: number;
  queued: number;
  downloading: number;
  completed: number;
  failed: number;
  total_size_bytes: number;
  avg_download_speed: number;
  estimated_completion_time?: number;
}

export interface QueueEstimate {
  estimatedMinutes: number;
  totalItems: number;
}

export interface ClearHistoryResult {
  deleted: number;
}

export interface QueueHistoryItem extends QueueItem {
  completion_status: 'completed' | 'failed';
  failure_reason?: string;
  retry_count: number;
}

export interface PriorityUpdate {
  vod_id: number;
  priority: QueuePriority;
}

export interface QueueResponse<T = QueueItem> {
  items: T[];
  total: number;
  pagination?: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface QueueOperationResult {
  success: boolean;
  message: string;
  affected_items?: number;
  errors?: string[];
}

// Queue filter parameters
export interface QueueFilters {
  status?: QueueStatus[];
  priority?: QueuePriority[];
  task_id?: number;
  channel_id?: number;
  date_from?: Date;
  date_to?: Date;
}

// Queue sorting options
export interface QueueSortOptions {
  field: 'created_at' | 'priority' | 'download_progress' | 'file_size' | 'duration';
  direction: 'ASC' | 'DESC';
}

// Queue management interface for operations
export interface BulkAction {
  type: 'pause_all' | 'resume_all' | 'clear_completed' | 'set_priority' | 'cancel_all';
  target?: 'all' | 'selected' | 'status';
  status_filter?: QueueStatus;
  priority?: QueuePriority;
  item_ids?: string[];
}

export interface QueueManagerInterface {
  getQueue(filters?: QueueFilters, limit?: number, offset?: number): Promise<QueueResponse>;
  getHistory(filters?: QueueFilters, limit?: number, offset?: number): Promise<QueueResponse<QueueHistoryItem>>;
  getStats(taskId?: number): Promise<QueueStats>;
  updatePriority(vodId: number, priority: QueuePriority): Promise<boolean>;
  bulkUpdatePriority(updates: PriorityUpdate[]): Promise<QueueOperationResult>;
  retryDownload(vodId: number, resetRetryCount?: boolean): Promise<boolean>;
  moveToTop(vodId: number): Promise<boolean>;
  moveToBottom(vodId: number): Promise<boolean>;
  pauseQueue(): Promise<boolean>;
  resumeQueue(): Promise<boolean>;
  clearCompleted(taskId?: number): Promise<ClearHistoryResult>;
  getEstimate(taskId?: number): Promise<QueueEstimate>;
  moveVodToTop(vodId: number): Promise<VOD | null>;
  moveVodToBottom(vodId: number): Promise<VOD | null>;
}
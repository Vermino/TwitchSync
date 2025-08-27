// Filepath: frontend/src/types/queue.ts

export type QueueStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'paused' | 'cancelled';
export type QueuePriority = 'high' | 'normal' | 'low';

export interface QueueItem {
  id: string;
  vod_id: string;
  task_id: number;
  title: string;
  channel_name: string;
  game_name?: string;
  duration: string;
  thumbnail_url?: string;
  file_size?: number;
  status: QueueStatus;
  priority: QueuePriority;
  progress: {
    percentage: number;
    current_segment: number;
    total_segments: number;
    download_speed?: number; // MB/s
    eta?: number; // seconds
    bytes_downloaded?: number;
    bytes_total?: number;
  };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  retry_count: number;
  queue_position?: number;
}

export interface QueueStats {
  total_items: number;
  pending: number;
  downloading: number;
  completed: number;
  failed: number;
  paused: number;
  estimated_completion_time?: number; // seconds
  total_download_speed?: number; // MB/s
  total_queue_size?: number; // bytes
}

export interface DownloadHistoryItem {
  id: string;
  vod_id: string;
  task_id: number;
  title: string;
  channel_name: string;
  game_name?: string;
  duration: string;
  thumbnail_url?: string;
  file_size: number;
  file_path: string;
  status: 'completed' | 'failed' | 'cancelled';
  download_speed: number; // MB/s
  download_time: number; // seconds
  completed_at: string;
  error_message?: string;
  retry_count: number;
}

export interface BulkAction {
  type: 'pause_all' | 'resume_all' | 'clear_completed' | 'set_priority' | 'cancel_all';
  target?: 'all' | 'selected' | 'status';
  status_filter?: QueueStatus;
  priority?: QueuePriority;
  item_ids?: string[];
}

export interface QueueFilters {
  status?: QueueStatus[];
  priority?: QueuePriority[];
  task_id?: number[];
  search?: string;
}

export interface QueueSortOptions {
  field: 'created_at' | 'priority' | 'progress' | 'title' | 'queue_position';
  direction: 'asc' | 'desc';
}
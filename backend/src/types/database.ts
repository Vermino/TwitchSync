// backend/src/types/database.ts

export interface Channel {
  id: number;
  twitch_id: string;
  username: string;
  display_name: string;
  profile_image_url: string | null;
  description: string | null;
  follower_count: number;
  is_active: boolean;
  last_vod_check: Date | null;
  last_game_check: Date | null;
  current_game_id: string | null;
  created_at: Date;
}

export interface CreateChannelRequest {
  twitch_id: string;
  username: string;
  display_name?: string;
  profile_image_url?: string;
  description?: string;
  follower_count?: number;
  is_active?: boolean;
  current_game_id?: string;
}

export interface UpdateChannelRequest {
  display_name?: string;
  profile_image_url?: string;
  description?: string;
  follower_count?: number;
  is_active?: boolean;
  current_game_id?: string;
}


export interface Game {
  id: number;
  twitch_game_id: string;
  name: string;
  box_art_url: string | null;
  is_active: boolean;
  last_checked: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface VOD {
  id: number;
  twitch_id: string;
  channel_id: number;
  game_id: string | null;
  user_id: number | null;
  title: string;
  description: string | null;
  duration: string;
  content_type: 'stream' | 'highlight' | 'upload' | 'clip' | 'premiere';
  status: 'pending' | 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'archived' | 'deleted';
  view_count: number;
  thumbnail_url: string | null;
  playlist_url: string | null;
  video_urls: Record<string, string>;
  resolution: string | null;
  fps: number | null;
  language: string | null;
  muted_segments: Array<Record<string, any>>;
  tags: string[];
  category_tags: string[];
  chat_replay_available: boolean;
  markers: Array<Record<string, any>>;
  highlights_timestamps: Array<Record<string, any>>;

  // Download management fields
  download_path: string | null;
  download_status: 'pending' | 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'archived' | 'deleted';
  download_priority: 'low' | 'normal' | 'high' | 'critical';
  download_progress: number;
  download_speed: number | null;
  downloaded_size: number | null;
  estimated_size: number | null;
  file_size: number | null;
  file_format: string | null;
  preferred_quality: 'source' | '1080p60' | '1080p' | '720p60' | '720p' | '480p' | '360p' | '160p';
  download_chat: boolean;
  download_markers: boolean;
  retry_count: number;
  max_retries: number;
  last_retry: Date | null;
  error_message: string | null;
  scheduled_for: Date | null;
  target_directory: string | null;
  auto_delete: boolean;
  retention_days: number | null;

  // Technical metadata
  checksum: string | null;
  video_metadata: Record<string, any> | null;
  processing_metadata: Record<string, any> | null;
  processing_options: {
    transcode: boolean;
    extract_chat: boolean;
  };
  deletion_scheduled_at: Date | null;

  // Timestamps
  started_at: Date | null;
  downloaded_at: Date | null;
  processed_at: Date | null;
  published_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface VODChapter {
  id: number;
  vod_id: number;
  game_id: number | null;
  title: string;
  description: string | null;
  start_time: string;
  duration: string;
  thumbnail_url: string | null;
  category: string | null;
  markers: Array<Record<string, any>>;
  view_count: number;
  highlight_clip_id: string | null;
  highlight_url: string | null;
  download_separately: boolean;
  metadata: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

export interface VODSegment {
  id: number;
  vod_id: number;
  chapter_id: number | null;
  segment_number: number;
  segment_url: string;
  start_time: string;
  duration: string;
  file_path: string | null;
  file_size: number | null;
  video_quality: 'source' | '1080p60' | '1080p' | '720p60' | '720p' | '480p' | '360p' | '160p';
  download_status: 'pending' | 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'archived' | 'deleted';
  download_progress: number;
  download_speed: number | null;
  retry_count: number;
  max_retries: number;
  last_retry: Date | null;
  error_message: string | null;
  checksum: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface VODMarker {
  id: number;
  vod_id: number;
  chapter_id: number | null;
  marker_type: string;
  title: string | null;
  description: string | null;
  timestamp: string;
  duration: string | null;
  category: string | null;
  tags: string[];
  metadata: Record<string, any> | null;
  created_at: Date;
}

export interface ChatMessage {
  id: number;
  vod_id: number;
  message_id: string;
  user_id: string;
  username: string;
  message_type: string;
  message: string | null;
  timestamp: string;
  badges: Array<Record<string, any>>;
  emotes: Array<Record<string, any>>;
  bits: number | null;
  metadata: Record<string, any> | null;
  created_at: Date;
}

export interface Task {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  task_type: 'channel' | 'game' | 'combined';
  channel_ids: number[];
  game_ids: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb: number | null;
  retention_days: number | null;
  auto_delete: boolean;
  is_active: boolean;
  status: 'pending' | 'active' | 'completed' | 'failed';
  priority: number;
  last_run: Date | null;
  next_run: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskHistory {
  id: number;
  task_id: number;
  status: 'success' | 'failed' | 'cancelled';
  start_time: Date;
  end_time: Date | null;
  error_message: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
}

export interface UserVODPreferences {
  id: number;
  user_id: number;
  channel_id: number;
  auto_download: boolean;
  preferred_quality: 'source' | '1080p60' | '1080p' | '720p60' | '720p' | '480p' | '360p' | '160p';
  download_chat: boolean;
  download_markers: boolean;
  download_priority: 'low' | 'normal' | 'high' | 'critical';
  retention_days: number | null;
  storage_path: string | null;
  notification_settings: {
    download_started: boolean;
    download_completed: boolean;
    download_failed: boolean;
    space_warning: boolean;
  };
  created_at: Date;
  updated_at: Date;
}

// Request DTOs
export type CreateTaskDTO = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'last_run' | 'next_run'>;

export interface CreateTaskRequest {
  name: string;
  description?: string;
  task_type: 'channel' | 'game' | 'combined';
  channel_ids?: number[];
  game_ids?: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: number;
}

export interface UpdateTaskRequest {
  name?: string;
  description?: string;
  channel_ids?: number[];
  game_ids?: number[];
  schedule_type?: 'interval' | 'cron' | 'manual';
  schedule_value?: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  is_active?: boolean;
  priority?: number;
}

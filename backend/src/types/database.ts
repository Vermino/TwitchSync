// Filepath: backend/src/types/database.ts

// Channel related types
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

// Game related types
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

// VOD related types
export type VodContentType = 'stream' | 'highlight' | 'upload' | 'clip' | 'premiere';
export type VodStatus = 'pending' | 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'archived' | 'deleted';
export type VideoQuality = 'source' | '1080p60' | '1080p' | '720p60' | '720p' | '480p' | '360p' | '160p';
export type DownloadPriority = 'low' | 'normal' | 'high' | 'critical';

export interface DatabaseVOD {
  id: number;
  task_id: number;
  channel_id: number;
  title: string;
  download_status: VodStatus;
  preferred_quality: string;
  language: string;
  file_size: number;
  download_speed: number | null;
  download_progress: number;
  error_message: string | null;
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
  content_type: VodContentType;
  status: VodStatus;
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
  download_status: VodStatus;
  download_priority: DownloadPriority;
  download_progress: number;
  download_speed: number | null;
  downloaded_size: number | null;
  estimated_size: number | null;
  file_size: number | null;
  file_format: string | null;
  preferred_quality: VideoQuality;
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
  video_quality: VideoQuality;
  download_status: VodStatus;
  download_progress: number;
  download_speed: number | null;
  retry_count: number;
  max_retries: number;
  last_retry: Date | null;
  error_message: string | null;
  checksum: string | null;
  started_at: Date | null;
  downloaded_at: Date | null;
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

// Completed VOD tracking for preventing re-downloads
export interface CompletedVOD {
  id: number;
  vod_id: number;
  task_id: number;
  twitch_id: string;
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  download_duration_seconds: number | null;
  download_speed_mbps: number | null;
  completed_at: Date;
  checksum_md5: string | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface CompletedVODRequest {
  vod_id: number;
  task_id: number;
  twitch_id: string;
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  download_duration_seconds?: number;
  download_speed_mbps?: number;
  checksum_md5?: string;
  metadata?: Record<string, any>;
}

// Task completion statistics
export interface TaskCompletionStats {
  total_vods: number;
  completed_vods: number;
  completion_percentage: number;
  total_size_bytes: number;
  avg_download_speed_mbps: number | null;
  avg_download_duration_seconds: number | null;
}

// Download related types
export interface Download {
  id: number;
  vod_id: number;
  download_path: string;
  metadata_path?: string;
  download_status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  started_at?: Date;
  completed_at?: Date;
  file_size?: number;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DownloadQueue {
  id: number;
  vod_id: number;
  priority: number;
  scheduled_for?: Date;
  attempts: number;
  max_attempts: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

// Task related types
export type TaskType = 'channel' | 'game' | 'combined';
export type TaskScheduleType = 'interval' | 'cron' | 'manual';
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  task_type: TaskType;
  channel_ids: number[];
  game_ids: number[];
  schedule_type: TaskScheduleType;
  schedule_value: string;
  storage_limit_gb: number | null;
  retention_days: number | null;
  auto_delete: boolean;
  is_active: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  last_run: Date | null;
  next_run: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskProgressInfo {
  percentage: number;
  completed: number;
  total: number;
  current_item?: {
    type: 'channel' | 'game';
    name: string;
    status: string;
  };
}

export interface TaskStorageInfo {
  used: number;
  limit: number;
  remaining: number;
}

export interface TaskVODStats {
  total_vods: number;
  total_size: number;
  average_duration: number;
  download_success_rate: number;
  vods_by_quality: Record<string, number>;
  vods_by_language: Record<string, number>;
}

export interface TaskDetails {
  id: number;
  task_id: number;
  progress: TaskProgress;
  storage: TaskStorage;
  vod_stats: TaskVODStats;
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

export interface TaskProgress {
  percentage: number;
  completed: number;
  total: number;
  current_item?: {
    type: 'channel' | 'game';
    name: string;
    status: string;
  };
}

export interface TaskStorage {
  used: number;
  limit: number;
  remaining: number;
}

export interface TaskVODStats {
  total_vods: number;
  total_size: number;
  average_duration: number;
  download_success_rate: number;
  vods_by_quality: Record<string, number>;
  vods_by_language: Record<string, number>;
}

export interface TaskDetails {
  id: number;
  task_id: number;
  progress: TaskProgress;
  storage: TaskStorage;
  vod_stats: TaskVODStats;
  created_at: Date;
  updated_at: Date;
}

export interface UserVODPreferences {
  id: number;
  user_id: number;
  channel_id: number;
  auto_download: boolean;
  preferred_quality: VideoQuality;
  download_chat: boolean;
  download_markers: boolean;
  download_priority: DownloadPriority;
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

// Discovery and Preference types
export interface UserPreferences {
  id: number;
  user_id: number;
  preferred_languages: string[];
  min_viewers: number;
  max_viewers: number;
  preferred_categories: string[];
  schedule_preference: string;
  content_rating: string;
  notify_only: boolean;
  schedule_match: boolean;
  confidence_threshold: number;
  created_at: Date;
  updated_at: Date;
}

export interface ChannelGameHistory {
  id: number;
  channel_id: number;
  game_id: string;
  start_time: Date;
  end_time: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserGamePreferences {
  id: number;
  user_id: number;
  game_id: string;
  interest_level: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserChannelPreferences {
  id: number;
  user_id: number;
  channel_id: number;
  notify_live: boolean;
  auto_record: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChannelMetrics {
  id: number;
  channel_id: number;
  viewer_count: number;
  follower_count: number;
  avg_viewers: number;
  peak_viewers: number;
  recorded_at: Date;
  created_at: Date;
}

// System Settings
export interface SystemSettings {
  id: number;
  user_id: number;
  settings: {
    downloads: {
      downloadPath: string;
      tempStorageLocation: string;
      concurrentDownloadLimit: number;
      bandwidthThrottle: number;
    };
    storage: {
      diskSpaceAlertThreshold: number;
      enableAutoCleanup: boolean;
      cleanupThresholdGB: number;
      minAgeForCleanupDays: number;
      keepMetadataOnCleanup: boolean;
    };
  };
  created_at: Date;
  updated_at: Date;
}

// Request DTOs
export type CreateTaskDTO = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'last_run' | 'next_run'>;

export interface CreateTaskRequest {
  name?: string;
  description?: string;
  task_type?: 'channel' | 'game' | 'combined';
  channel_ids: number[];
  game_ids: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb?: number;
  retention_days?: number;
  auto_delete?: boolean;
  priority?: 'low' | 'medium' | 'high';
  is_active?: boolean;
  user_id?: number;
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
  priority?: 'low' | 'medium' | 'high';
  is_active?: boolean;
}

// Discovery types
export interface PremiereEvent {
  id: string;
  type: 'CHANNEL_PREMIERE' | 'RISING_STAR' | 'SPECIAL_EVENT';
  channel_id: string;
  game_id: string;
  start_time: string;
  predicted_viewers: number;
  confidence_score: number;
  similar_channels: string[];
  viewer_trend: 'rising' | 'stable' | 'falling';
  metadata: Record<string, any>;
}

export interface ViewerTrend {
  channel_id: string;
  current_viewers: number;
  peak_viewers: number;
  growth_rate: number;
  trend: 'rising' | 'stable' | 'falling';
  measured_at: string;
}

export interface StreamFilters {
  languages?: string[];
  limit?: number;
  gameId?: string;
}

export interface DiscoveryStats {
  upcomingPremieres: number;
  trackedPremieres: number;
  risingChannels: number;
  pendingArchives: number;
  todayDiscovered: number;
}

export interface BaseRecommendation {
  type: 'channel' | 'game';
  id: string;
  compatibility_score: number;
}

export interface ChannelRecommendation extends BaseRecommendation {
  type: 'channel';
  display_name: string;
  login: string;
  profile_image_url: string | null;
  description: string | null;
  viewer_count: number;
  recommendation_reasons?: Array<{
    type: string;
    strength: number;
  }>;
}

export interface GameRecommendation extends BaseRecommendation {
  type: 'game';
  game_id: string;
  name: string;
  box_art_url: string;
}

export type Recommendation = ChannelRecommendation | GameRecommendation;

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tags: string[];
}

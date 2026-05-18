// Filepath: /backend/src/types/vod.ts

export type VodContentType = 'stream' | 'highlight' | 'upload' | 'clip' | 'premiere';
export type VodStatus = 'pending' | 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'archived' | 'deleted';
export type VideoQuality = 'source' | '1080p60' | '1080p' | '720p60' | '720p' | '480p' | '360p' | '160p';

export interface VOD {
  id: number;
  twitch_id: string;
  channel_id: number;
  game_id: string | null;
  user_id: number | null;
  task_id: number;
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
  download_priority: 'low' | 'normal' | 'high' | 'critical';
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

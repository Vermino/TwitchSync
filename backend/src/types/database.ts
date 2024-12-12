// Database table interfaces
export interface Channel {
  id: number;
  twitch_id: string;
  username: string;
  is_active: boolean;
  last_vod_check: Date | null;
  last_game_check: Date | null;
  current_game_id: string | null;
  created_at: Date;
}

export interface Game {
  id: number;
  twitch_game_id: string;
  name: string;
  is_active: boolean;
  last_checked: Date | null;
  created_at: Date;
}

export interface VOD {
  id: number;
  twitch_vod_id: string;
  channel_id: number;
  game_id: string | null;
  title: string;
  duration: string;
  view_count: number;
  created_at: Date;
  published_at: Date;
  type: string;
  url: string;
  thumbnail_url: string;
  processed_at: Date;
}

export interface VODDownload {
  id: number;
  vod_id: number;
  download_path: string | null;
  metadata_path: string | null;
  download_status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  started_at: Date;
  completed_at: Date | null;
  file_size: number | null;
  error_message: string | null;
}

export interface DownloadQueue {
  id: number;
  vod_id: number;
  chapter_id: number | null;
  priority: number;
  status: string;
  error_message: string | null;
  retry_count: number;
  created_at: Date;
}

export interface GameChange {
  id: number;
  channel_id: number;
  previous_game_id: string | null;
  new_game_id: string | null;
  changed_at: Date;
}

// Request types
export interface CreateChannelRequest {
  twitch_id: string;
  username: string;
}

export interface UpdateChannelRequest {
  is_active?: boolean;
  current_game_id?: string | null;
}

export interface CreateGameRequest {
  twitch_game_id: string;
  name: string;
}

export interface UpdateGameRequest {
  is_active?: boolean;
  name?: string;
}

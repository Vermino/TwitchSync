// Base Models
export interface BaseModel {
  id: number;
  created_at: string;
}

// Channel Models
export interface Channel extends BaseModel {
  twitch_id: string;
  username: string;
  is_active: boolean;
  last_vod_check: string | null;
  last_game_check: string | null;
  current_game_id: string | null;
}

// Game Models
export interface Game extends BaseModel {
  twitch_game_id: string;
  name: string;
  is_active: boolean;
  last_checked: string | null;
}

// VOD Models
export interface VOD extends BaseModel {
  twitch_vod_id: string;
  channel_id: number;
  channel_name?: string;
  game_id: string | null;
  title: string;
  duration: string;
  view_count: number;
  published_at: string;
  type: string;
  url: string;
  thumbnail_url: string;
  processed_at: string;
}

export interface VODWithChapters extends VOD {
  chapters: Chapter[];
}

export interface Chapter extends BaseModel {
  vod_id: number;
  game_id: string | null;
  title: string;
  start_time: number;
  end_time: number;
}

// Download Models
export interface Download extends BaseModel {
  vod_id: number;
  chapter_id: number | null;
  download_path: string | null;
  download_status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
  file_size: number | null;
  error_message: string | null;
}

export interface DownloadQueue extends BaseModel {
  vod_id: number;
  chapter_id: number | null;
  priority: number;
  status: 'pending' | 'downloading' | 'failed' | 'cancelled';
  error_message: string | null;
  retry_count: number;
}

// Game Change Models
export interface GameChange extends BaseModel {
  channel_id: number;
  previous_game_id: string | null;
  new_game_id: string | null;
  changed_at: string;
}

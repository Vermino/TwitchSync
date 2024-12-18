// Filepath: backend/src/types/twitch.ts
export interface ChapterInfo {
  id: string;
  title: string;
  description?: string;
  start_time: number;
  duration: number;
  thumbnail_url?: string;
  game_id?: string;
  game_name?: string;
  created_at?: string;
}

export interface VODInfo {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
  muted_segments?: Array<{
    duration: number;
    offset: number;
  }>;
}

export interface VODSegment {
  url: string;
  duration: number;
  index: number;
}

export interface VODQuality {
  name: string;
  segments: VODSegment[];
  resolution?: {
    width: number;
    height: number;
  };
  framerate?: number;
}

export interface VODPlaylist {
  qualities: Record<string, VODQuality>;
  duration: number;
  base_url?: string;
}

export interface VODMarker {
  id: string;
  created_at: string;
  description: string;
  position_seconds: number;
  type: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
  badges?: Array<{
    id: string;
    version: string;
  }>;
  bits?: number;
  emotes?: Array<{
    id: string;
    begin: number;
    end: number;
  }>;
}

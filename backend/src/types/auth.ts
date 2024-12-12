export interface User {
  id: number;
  email: string | null;
  username: string;
  password_hash: string | null;
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TwitchAccount {
  id: number;
  user_id: number;
  twitch_id: string;
  username: string;
  email: string | null;
  profile_image_url: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  scope: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  created_at: Date;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string | null;
  };
  twitch_account?: {
    username: string;
    profile_image_url: string | null;
  };
}

export interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export interface TwitchUserResponse {
  id: string;
  login: string;
  display_name: string;
  email: string;
  profile_image_url: string;
  type: string;
  broadcaster_type: string;
}

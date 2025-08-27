// Filepath: backend/src/types/auth.ts

import { Request } from 'express';

export interface User {
  id: number;
  email: string;
  username: string;
  password_hash?: string;
  twitch_id?: string;
  is_active: boolean;
  role: 'admin' | 'moderator' | 'user' | 'guest';
  status: 'active' | 'suspended' | 'banned' | 'pending';
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
  twitch_account?: TwitchAccount;
}

export interface TwitchAccount {
  id: number;
  user_id: number;
  username: string;
  display_name?: string;
  profile_image_url?: string | null;
  email?: string;
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: Date;
  scope?: string;
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

// TwitchSync specific user type for requests
export interface TwitchSyncUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

// Extended Request interface with user
export interface RequestWithUser extends Request {
  user?: TwitchSyncUser;
  userId?: number;  // Add userId property for middleware
}

// JWT Payload interface
export interface JwtPayload {
  id: number;
  twitch_id?: string;
  iat?: number;
  exp?: number;
}

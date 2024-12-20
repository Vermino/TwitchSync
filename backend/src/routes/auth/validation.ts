// Filepath: backend/src/routes/auth/validation.ts

import { z } from 'zod';

export const AuthCallbackSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'Authorization code is required'),
    state: z.string().optional()
  })
});

export const RefreshTokenSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1, 'Refresh token is required')
  })
});

export const LogoutSchema = z.object({
  headers: z.object({
    authorization: z.string().min(1, 'Authorization header is required')
  })
});

export type AuthCallbackRequest = z.infer<typeof AuthCallbackSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>;
export type LogoutRequest = z.infer<typeof LogoutSchema>;

export interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  email: string;
  profile_image_url: string;
  broadcaster_type: string;
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

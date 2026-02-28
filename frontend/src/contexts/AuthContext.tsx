// Filepath: frontend/src/contexts/AuthContext.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';
import { twitchAuth } from '../services/auth/twitch';

interface User {
  id: number;
  username: string;
  email: string | null;
}

interface TwitchAccount {
  username: string;
  profile_image_url: string | null;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  twitchAccount: TwitchAccount | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  connectTwitch: () => void;
  disconnectTwitch: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    twitchAccount: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const response = await fetch('/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Session expired');
        }

        const data = await response.json();
        setAuthState({
          isAuthenticated: true,
          user: data.user,
          twitchAccount: data?.user?.twitch_account || null,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        logger.error('Auth check failed:', error);
        localStorage.removeItem('auth_token');
        setAuthState({
          isAuthenticated: false,
          user: null,
          twitchAccount: null,
          isLoading: false,
          error: 'Session expired. Please log in again.',
        });
        navigate('/login');
      }
    };

    checkAuth();
  }, [navigate]);

  const login = async (code: string) => {
    try {
      logger.info('Starting Twitch login process');
      const token = await twitchAuth.handleCallback(code);
      localStorage.setItem('auth_token', token);

      // Fetch user data after successful login
      const response = await fetch('/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      setAuthState({
        isAuthenticated: true,
        user: data.user,
        twitchAccount: data?.user?.twitch_account || null,
        isLoading: false,
        error: null,
      });

      navigate('/dashboard');
    } catch (error) {
      logger.error('Login error:', error);
      setAuthState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to authenticate'
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await fetch('/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      logger.error('Logout error:', error);
    } finally {
      localStorage.removeItem('auth_token');
      setAuthState({
        isAuthenticated: false,
        user: null,
        twitchAccount: null,
        isLoading: false,
        error: null,
      });
      navigate('/login');
    }
  };

  const connectTwitch = async () => {
    try {
      const result = await twitchAuth.getAuthUrl();

      if (result.error) {
        // Handle configuration error
        setAuthState(prev => ({
          ...prev,
          error: result.error || null
        }));
        logger.error('Twitch connection error:', result.error);

        // Optionally redirect to settings or show instructions
        if (result.redirectTo) {
          // You could navigate to settings here if you have a settings page
          console.warn('Redirect to:', result.redirectTo);
        }
        return;
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('No auth URL returned');
      }
    } catch (error) {
      logger.error('Failed to initiate Twitch connection:', error);
      setAuthState(prev => ({
        ...prev,
        error: 'Failed to connect to Twitch. Please check your configuration.'
      }));
    }
  };

  const disconnectTwitch = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      await twitchAuth.disconnect(token);
      setAuthState(prev => ({
        ...prev,
        twitchAccount: null,
      }));
    } catch (error) {
      logger.error('Failed to disconnect Twitch:', error);
      throw error;
    }
  };

  const clearError = () => {
    setAuthState(prev => ({ ...prev, error: null }));
  };

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        logout,
        connectTwitch,
        disconnectTwitch,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

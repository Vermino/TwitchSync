// Filepath: frontend/src/contexts/AuthContext.tsx

import React, {createContext, useContext, useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../lib/api';
import {logger} from '../utils/logger';

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

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

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
        const data = await api.checkAuth();
        setAuthState({
          isAuthenticated: true,
          user: data.user,
          twitchAccount: data.user.twitch_account,
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

  const clearError = () => {
    setAuthState(prev => ({ ...prev, error: null }));
  };

  const retryWithDelay = async (fn: () => Promise<any>, attempt: number = 1): Promise<any> => {
    try {
      return await fn();
    } catch (error) {
      // Narrow the type of error
      if (error instanceof Error && attempt < MAX_RETRY_ATTEMPTS && error.message.includes('ERR_NETWORK')) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        return retryWithDelay(fn, attempt + 1);
      }
      throw error; // Re-throw the error if it's not recoverable
    }
  };

  const login = async (code: string) => {
    try {
      logger.info('Attempting login with code:', code.substring(0, 6) + '...');

      const loginAttempt = async () => {
        const response = await fetch('http://localhost:3001/auth/twitch/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Authentication failed');
        }

        return await response.json();
      };

      const data = await retryWithDelay(loginAttempt);
      localStorage.setItem('auth_token', data.token);

      setAuthState({
        isAuthenticated: true,
        user: data.user,
        twitchAccount: data.user.twitch_account || null,
        isLoading: false,
        error: null,
      });

      navigate('/');
    } catch (error) {
      logger.error('Login error:', error);
      const errorMessage = error instanceof Error
        ? (error.message === 'Network Error'
            ? 'Unable to connect to authentication server. Please check your connection and try again.'
            : error.message)
        : 'Failed to connect to authentication server';

      setAuthState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
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

  const connectTwitch = () => {
    const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_TWITCH_REDIRECT_URI;
    const scope = 'user:read:email user:read:follows';

    window.location.href = `https://id.twitch.tv/oauth2/authorize?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `force_verify=true`;
  };

  const disconnectTwitch = async () => {
    try {
      await api.revokeTwitchAccess();
      setAuthState(prev => ({
        ...prev,
        twitchAccount: null,
      }));
    } catch (error) {
      logger.error('Failed to disconnect Twitch:', error);
      throw error;
    }
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

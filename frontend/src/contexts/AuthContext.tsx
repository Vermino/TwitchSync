import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
}

interface AuthContextType extends AuthState {
  login: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  connectTwitch: () => void;
  disconnectTwitch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    twitchAccount: null,
    isLoading: true,
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAuthState({
          isAuthenticated: true,
          user: data.user,
          twitchAccount: data.twitch_account || null,
          isLoading: false,
        });
      } else {
        localStorage.removeItem('auth_token');
        setAuthState({
          isAuthenticated: false,
          user: null,
          twitchAccount: null,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const login = async (code: string) => {
    try {
      const response = await fetch('/api/auth/twitch/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      localStorage.setItem('auth_token', data.token);

      setAuthState({
        isAuthenticated: true,
        user: data.user,
        twitchAccount: data.twitch_account || null,
        isLoading: false,
      });

      navigate('/');
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('auth_token');
      setAuthState({
        isAuthenticated: false,
        user: null,
        twitchAccount: null,
        isLoading: false,
      });
      navigate('/login');
    }
  };

  const connectTwitch = () => {
    const clientId = process.env.REACT_APP_TWITCH_CLIENT_ID;
    const redirectUri = process.env.REACT_APP_TWITCH_REDIRECT_URI;
    const scopes = [
      'user:read:email',
      'user:read:broadcast',
      'channel:read:vods'
    ].join(' ');

    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}`;
    window.location.href = authUrl;
  };

  const disconnectTwitch = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/auth/twitch/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect Twitch account');
      }

      setAuthState(prev => ({
        ...prev,
        twitchAccount: null
      }));
    } catch (error) {
      console.error('Failed to disconnect Twitch:', error);
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

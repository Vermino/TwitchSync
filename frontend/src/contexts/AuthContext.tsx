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

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const response = await fetch('http://localhost:3001/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setAuthState({
            isAuthenticated: true,
            user: data.user,
            twitchAccount: data.user.twitch_account,
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
          navigate('/login');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkAuth();
  }, [navigate]);

  const login = async (code: string) => {
    try {
      console.log('Attempting login with code:', code.substring(0, 6) + '...');

      const response = await fetch('http://localhost:3001/auth/twitch/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Login failed with status:', response.status);
        console.error('Error details:', data);
        throw new Error(data.error || 'Login failed');
      }

      console.log('Login successful, setting token and state');
      localStorage.setItem('auth_token', data.token);

      setAuthState({
        isAuthenticated: true,
        user: data.user,
        twitchAccount: data.user.twitch_account || null,
        isLoading: false,
      });

      navigate('/');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await fetch('http://localhost:3001/auth/logout', {
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
    const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_TWITCH_REDIRECT_URI;
    const scope = 'user:read:email user:read:follows';

    window.location.href = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
  };

  const disconnectTwitch = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch('http://localhost:3001/auth/twitch/revoke', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setAuthState(prev => ({
          ...prev,
          twitchAccount: null
        }));
      }
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

import React, { useState, useEffect } from 'react';
import TwitchConnect from '../components/TwitchConnect';
import WatchConfig from '../components/WatchConfig';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const WatchPage: React.FC = () => {
  const [isConnected, setIsConnected] = useLocalStorage('twitch_connected', false);
  const [accessToken, setAccessToken] = useLocalStorage('twitch_token', '');

  useEffect(() => {
    // Check URL for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      handleOAuthCallback(code);
    }
  }, []);

  const handleOAuthCallback = async (code: string) => {
    try {
      const token = await twitchAuth.handleCallback(code);
      setAccessToken(token);
      setIsConnected(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      console.error('Failed to handle OAuth callback:', error);
    }
  };

  const handleWatchConfig = async (config: {
    channels: string[];
    games: string[];
    historyDays: number;
    syncForward: boolean;
  }) => {
    try {
      const response = await fetch('/api/watch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error('Failed to save watch configuration');
      }

      // Show success message or redirect
      console.log('Watch configuration saved successfully');
    } catch (error) {
      console.error('Failed to save watch configuration:', error);
    }
  };

  if (!isConnected) {
    return <TwitchConnect />;
  }

  return <WatchConfig onSave={handleWatchConfig} />;
};

export default WatchPage;

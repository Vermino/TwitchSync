import React from 'react';
import { TwitchAuth } from '../services/auth/twitch.ts';

const twitchAuth = new TwitchAuth({
  clientId: process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || '',
  redirectUri: `${window.location.origin}/auth/callback`,
  scope: ['user:read:subscriptions']
});

const TwitchConnect: React.FC = () => {
  const handleConnect = () => {
    window.location.href = twitchAuth.getAuthUrl();
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-lg shadow-lg text-center">
      <img
        src="/twitch-logo.png"
        alt="Twitch Logo"
        className="w-16 h-16 mx-auto mb-6"
      />

      <h2 className="text-2xl font-bold mb-4">Connect with Twitch</h2>

      <p className="text-gray-600 mb-8">
        In order to use TwitchSync and search for videos, you need to
        connect it with your Twitch Account. This step generates a necessary
        authentication token. No user data or personal information gets
        collected or shared.
      </p>

      <button
        onClick={handleConnect}
        className="w-full bg-purple-600 text-white py-3 px-6 rounded-lg
                 hover:bg-purple-700 transition-colors duration-200"
      >
        Connect with Twitch
      </button>

      <p className="text-sm text-gray-500 mt-4">
        You can always revoke this authorization from your Twitch Connections page
      </p>
    </div>
  );
};

export default TwitchConnect;

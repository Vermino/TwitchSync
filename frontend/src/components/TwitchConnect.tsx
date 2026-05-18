// Filepath: frontend/src/components/TwitchConnect.tsx

import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const TwitchConnect: React.FC = () => {
  const { connectTwitch, error, clearError } = useAuth();

  return (
    <div
      data-testid="connect-twitch-page"
      className="max-w-md mx-auto mt-20 p-8 bg-white rounded-lg shadow-lg text-center"
    >
      <img
        src="/api/placeholder/64/64"
        alt="Twitch Logo"
        className="w-16 h-16 mx-auto mb-6"
      />

      <h2 className="text-2xl font-bold mb-4">Connect with Twitch</h2>

      <p className="text-gray-600 mb-8">
        To use TwitchSync and search for videos, you need to
        connect it with your Twitch Account. This step generates a necessary
        authentication token. No user data or personal information gets
        collected or shared.
      </p>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div>{error}</div>
          <button
            type="button"
            onClick={clearError}
            className="mt-2 text-xs font-medium underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <button
        data-testid="connect-twitch-button"
        onClick={connectTwitch}
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

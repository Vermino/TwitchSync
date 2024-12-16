import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Link } from 'lucide-react';

const ConnectTwitch = () => {
  const { connectTwitch, logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Connect Your Twitch Account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {user ? `Welcome, ${user.username}! ` : ''}
          To continue, please connect your Twitch account.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <button
              onClick={connectTwitch}
              className="w-full flex justify-center items-center gap-3 py-3 px-4 rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              <Link className="w-5 h-5" />
              Connect Twitch Account
            </button>

            <button
              onClick={logout}
              className="w-full flex justify-center items-center gap-3 py-3 px-4 rounded-md shadow-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  Why connect with Twitch?
                </span>
              </div>
            </div>

            <div className="mt-6 text-sm text-gray-500">
              <ul className="list-disc pl-5 space-y-2">
                <li>Access your channel&#39;s VODs and clips</li>
                <li>Automatically download new content</li>
                <li>Track your favorite streamers</li>
                <li>Manage your content library</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectTwitch;

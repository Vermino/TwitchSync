import React, { useState, useEffect } from 'react';
import { PlusCircle, Trash2, CheckCircle, XCircle } from 'lucide-react';
import ChannelSearchModal from '../components/ChannelSearchModal';

interface Channel {
  id: number;
  twitch_id: string;
  username: string;
  is_active: boolean;
  last_vod_check: string | null;
  last_game_check: string | null;
  current_game_id: string | null;
  created_at: string;
}

const Channels = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      const response = await fetch('/api/channels');
      const data = await response.json();
      setChannels(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch channels');
      console.error('Error fetching channels:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannels = async (selectedChannels: Array<{ id: string, display_name: string, login: string }>) => {
    try {
      const responses = await Promise.all(
        selectedChannels.map(channel =>
          fetch('/api/channels', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              twitch_id: channel.id,
              username: channel.login
            }),
          })
        )
      );

      const newChannels = await Promise.all(
        responses.map(response => {
          if (!response.ok) throw new Error('Failed to add channel');
          return response.json();
        })
      );

      setChannels(prevChannels => [...prevChannels, ...newChannels]);
      setError(null);
    } catch (err) {
      setError('Failed to add channels');
      console.error('Error adding channels:', err);
    }
  };

  const deleteChannel = async (id: number) => {
    try {
      const response = await fetch(`/api/channels/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete channel');

      setChannels(channels.filter(channel => channel.id !== id));
      setError(null);
    } catch (err) {
      setError('Failed to delete channel');
      console.error('Error deleting channel:', err);
    }
  };

  const toggleChannelStatus = async (id: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/channels/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (!response.ok) throw new Error('Failed to update channel');

      const updatedChannel = await response.json();
      setChannels(channels.map(channel =>
        channel.id === id ? updatedChannel : channel
      ));
      setError(null);
    } catch (err) {
      setError('Failed to update channel');
      console.error('Error updating channel:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Channels</h1>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Channels</h1>
        <button
          onClick={() => setIsSearchModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          <PlusCircle className="w-5 h-5" />
          Add Channels
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Channels Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Twitch ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {channels.map((channel) => (
              <tr key={channel.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{channel.username}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">{channel.twitch_id}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => toggleChannelStatus(channel.id, channel.is_active)}
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      channel.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {channel.is_active ? (
                      <CheckCircle className="w-4 h-4 mr-1" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-1" />
                    )}
                    {channel.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {new Date(channel.created_at).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <button
                    onClick={() => deleteChannel(channel.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {channels.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No channels added yet. Click "Add Channels" to start tracking channels!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Channel Search Modal */}
      <ChannelSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelect={handleAddChannels}
        allowMultiple={true}
      />
    </div>
  );
};

export default Channels;

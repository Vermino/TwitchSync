import React, { useState, useEffect } from 'react';
import { PlusCircle, Trash2, CheckCircle, XCircle } from 'lucide-react';

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
  const [newChannel, setNewChannel] = useState({ twitch_id: '', username: '' });

  // Fetch channels
  const fetchChannels = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/channels');
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

  // Add new channel
  const addChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:3000/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newChannel),
      });

      if (!response.ok) throw new Error('Failed to add channel');

      const data = await response.json();
      setChannels([...channels, data]);
      setNewChannel({ twitch_id: '', username: '' });
      setError(null);
    } catch (err) {
      setError('Failed to add channel');
      console.error('Error adding channel:', err);
    }
  };

  // Delete channel
  const deleteChannel = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:3000/api/channels/${id}`, {
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

  // Toggle channel active status
  const toggleChannelStatus = async (id: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`http://localhost:3000/api/channels/${id}`, {
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

  useEffect(() => {
    fetchChannels();
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Channels</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading channels...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Channels</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Add new channel form */}
      <form onSubmit={addChannel} className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Twitch ID"
            value={newChannel.twitch_id}
            onChange={(e) => setNewChannel({ ...newChannel, twitch_id: e.target.value })}
            className="flex-1 p-2 border rounded"
            required
          />
          <input
            type="text"
            placeholder="Username"
            value={newChannel.username}
            onChange={(e) => setNewChannel({ ...newChannel, username: e.target.value })}
            className="flex-1 p-2 border rounded"
            required
          />
          <button
            type="submit"
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center gap-2"
          >
            <PlusCircle className="w-5 h-5" />
            Add Channel
          </button>
        </div>
      </form>

      {/* Channels list */}
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
                  No channels added yet. Add your first channel above!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Channels;

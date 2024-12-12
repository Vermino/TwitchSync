import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Check,
  X,
  Loader2,
  Users,
  Video
} from 'lucide-react';

interface Channel {
  id: string;
  display_name: string;
  login: string;
  profile_image_url: string;
  broadcaster_type: string;
  description: string;
  view_count: number;
}

interface ChannelStats {
  followers: number;
  totalViews: number;
  lastStreamDate: string;
}

interface ChannelSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (channels: Channel[]) => void;
  allowMultiple?: boolean;
}

const ChannelSearchModal: React.FC<ChannelSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  allowMultiple = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Channel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>([]);
  const [channelStats, setChannelStats] = useState<Record<string, ChannelStats>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchChannels = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/twitch/channels/search?query=${encodeURIComponent(searchTerm)}`, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to search channels');
        }

        const data = await response.json();
        setSearchResults(data);

        // Fetch stats for each channel
        const statsPromises = data.map((channel: Channel) =>
          fetch(`/api/twitch/channels/${channel.id}/stats`).then(res => res.json())
        );

        const stats = await Promise.all(statsPromises);
        const statsMap = data.reduce((acc: Record<string, ChannelStats>, channel: Channel, index: number) => {
          acc[channel.id] = stats[index];
          return acc;
        }, {});

        setChannelStats(statsMap);
      } catch (err) {
        setError('Failed to search channels. Please try again.');
        console.error('Channel search error:', err);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      if (searchTerm) {
        searchChannels();
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleSelectChannel = (channel: Channel) => {
    if (allowMultiple) {
      setSelectedChannels(prev => {
        const isSelected = prev.some(c => c.id === channel.id);
        if (isSelected) {
          return prev.filter(c => c.id !== channel.id);
        } else {
          return [...prev, channel];
        }
      });
    } else {
      setSelectedChannels([channel]);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const formatLastStreamDate = (date: string): string => {
    const streamDate = new Date(date);
    const now = new Date();
    const diff = now.getTime() - streamDate.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
      return streamDate.toLocaleDateString();
    }
  };

  const handleSubmit = () => {
    onSelect(selectedChannels);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">Search Channels</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for channels..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : error ? (
            <div className="p-4 text-red-600 text-center">{error}</div>
          ) : searchResults.length === 0 ? (
            <div className="p-4 text-gray-500 text-center">
              {searchTerm ? 'No channels found' : 'Start typing to search for channels'}
            </div>
          ) : (
            <div className="divide-y">
              {searchResults.map(channel => (
                <div
                  key={channel.id}
                  onClick={() => handleSelectChannel(channel)}
                  className={`flex items-start gap-4 p-4 cursor-pointer transition-colors ${
                    selectedChannels.some(c => c.id === channel.id)
                      ? 'bg-purple-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <img
                    src={channel.profile_image_url}
                    alt={channel.display_name}
                    className="w-16 h-16 rounded-full"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{channel.display_name}</h3>
                        <p className="text-gray-500">@{channel.login}</p>
                      </div>
                      {selectedChannels.some(c => c.id === channel.id) && (
                        <Check className="w-6 h-6 text-purple-600" />
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {channel.description || 'No channel description'}
                    </p>

                    {channelStats[channel.id] && (
                      <div className="flex items-center gap-6 mt-2 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {formatNumber(channelStats[channel.id].followers)} followers
                        </div>
                        <div className="flex items-center gap-1">
                          <Video className="w-4 h-4" />
                          {formatNumber(channelStats[channel.id].totalViews)} views
                        </div>
                        <div>
                          Last streamed: {formatLastStreamDate(channelStats[channel.id].lastStreamDate)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedChannels.length === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add {selectedChannels.length} {selectedChannels.length === 1 ? 'Channel' : 'Channels'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChannelSearchModal;

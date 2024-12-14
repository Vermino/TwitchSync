import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Check,
  X,
  Loader2,
  Video,
  Users,
  Info,
  AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';


interface TwitchSearchResult {
  id: string;
  broadcaster_login: string;
  display_name: string;
  thumbnail_url: string;  // This is the profile image URL from Twitch
  broadcaster_type: string;
  description?: string;
  game_id?: string;
  game_name?: string;
  tags?: string[];
}

interface Channel {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  broadcaster_type: string;
  description: string;
  view_count: number;
  follower_count?: number;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSearchResults([]);
      setSelectedChannels([]);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const searchChannels = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await api.searchTwitchChannels(searchTerm);
        console.log('Twitch search results:', data); // Debug log
        const processedData = Array.isArray(data) ? data.map(channel => ({
          ...channel,
          login: channel.login || '', // Ensure login is always present
        })) : [];
        console.log('Processed search results:', processedData); // Debug log
        setSearchResults(processedData);
      } catch (err) {
        console.error('Channel search error:', err);
        setError('Failed to search channels. Please try again.');
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

  const handleSelectChannel = (channel: TwitchSearchResult) => {
  console.log('Selecting channel:', channel);
  const processedChannel = {
    id: channel.id,
    login: channel.broadcaster_login,
    display_name: channel.display_name,
    profile_image_url: channel.thumbnail_url,  // Map the thumbnail URL to profile image
    broadcaster_type: channel.broadcaster_type || '',
    description: channel.description || '',
    view_count: 0,
    follower_count: 0
  };

  if (allowMultiple) {
    setSelectedChannels(prev => {
      const isSelected = prev.some(c => c.id === channel.id);
      if (isSelected) {
        return prev.filter(c => c.id !== channel.id);
      } else {
        return [...prev, processedChannel];
      }
    });
  } else {
    setSelectedChannels([processedChannel]);
  }
};

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      console.log('Selected channels before submit:', selectedChannels);
      await onSelect(selectedChannels);
      onClose();
    } catch (error) {
      console.error('Error saving channels:', error);
      setError('Failed to save channels. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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

        {/* Results section */}
        <div className="overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : error ? (
            <Alert variant="destructive" className="m-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
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
                  <Avatar className="w-16 h-16">
                    <AvatarImage
                      src={channel.thumbnail_url}  // Use thumbnail_url for the profile image
                      alt={channel.display_name}
                    />
                    <AvatarFallback>
                      {channel.display_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
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

                    <div className="flex items-center gap-6 mt-2 text-sm text-gray-500">
                      {typeof channel.view_count !== 'undefined' && (
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Video className="w-4 h-4" />
                              {formatNumber(channel.view_count)} views
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Total channel views</TooltipContent>
                        </Tooltip>
                      )}

                      {typeof channel.follower_count !== 'undefined' && (
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {formatNumber(channel.follower_count)} followers
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Follower count</TooltipContent>
                        </Tooltip>
                      )}

                      {channel.broadcaster_type && (
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-1">
                              <Info className="w-4 h-4" />
                              {channel.broadcaster_type.charAt(0).toUpperCase() +
                               channel.broadcaster_type.slice(1)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Broadcaster type</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {selectedChannels.length > 0 && (
              <span>{selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedChannels.length === 0 || isSubmitting}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              Add {selectedChannels.length > 0 ? selectedChannels.length : ''} Channel
              {selectedChannels.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelSearchModal;

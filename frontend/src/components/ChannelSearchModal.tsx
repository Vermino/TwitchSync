// Filepath: frontend/src/components/ChannelSearchModal.tsx

import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Check,
  X,
  Loader2,
  Users,
  GamepadIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface TwitchChannel {
  id: string;
  username?: string;
  display_name?: string;
  thumbnail_url?: string;
  profile_image_url?: string;
  broadcaster_login?: string;
  broadcaster_type: string;
  follower_count: number;
  view_count: number;
  description?: string;
  current_game?: {
    id: string;
    name: string;
    box_art_url: string;
  };
  tags?: string[];
  is_live?: boolean;
}

interface ChannelSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (channels: TwitchChannel[]) => Promise<void>;
  allowMultiple?: boolean;
  existingChannels: Array<{ twitch_id: string }>;
}


const formatNumber = (num: number | undefined | null): string => {
  if (num === undefined || num === null) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const getChannelDisplayName = (channel: Partial<TwitchChannel>): string => {
  return channel.display_name?.trim()
    || channel.username?.trim()
    || 'Unknown channel';
};

const getChannelUsername = (channel: Partial<TwitchChannel>): string => {
  return channel.username?.trim()
    || channel.display_name?.trim().toLowerCase().replace(/\s+/g, '')
    || 'unknownchannel';
};

const getChannelInitial = (channel: Partial<TwitchChannel>): string => {
  return getChannelDisplayName(channel).charAt(0).toUpperCase();
};

const ChannelSearchModal: React.FC<ChannelSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  allowMultiple = false,
  existingChannels
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<TwitchChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<TwitchChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSearchResults([]);
      setSelectedChannels([]);
      setError(null);
      setIsSubmitting(false);
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
        const normalizedResults = data.map((channel: TwitchChannel) => ({
          ...channel,
          display_name: getChannelDisplayName(channel),
          username: getChannelUsername(channel),
        }));
        // Filter out existing channels
        const filteredResults = normalizedResults.filter(channel =>
          !existingChannels?.some(existing => existing.twitch_id === channel.id)
        );
        setSearchResults(filteredResults);
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
  }, [searchTerm, existingChannels]);

  const handleSelectChannel = (channel: TwitchChannel) => {
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

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">Search Channels</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for channels..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              data-testid="channel-search-input"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
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
            <div className="divide-y overflow-x-hidden">
              {searchResults.map(channel => (
                <div
                  key={channel.id}
                  onClick={() => handleSelectChannel(channel)}
                  data-testid={`channel-search-result-${channel.id}`}
                  className={`flex items-start gap-4 overflow-hidden p-4 transition-colors ${selectedChannels.some(c => c.id === channel.id)
                      ? 'bg-purple-50'
                      : 'hover:bg-gray-50'
                    } cursor-pointer`}
                >
                  <div className="relative">
                    <Avatar className="w-16 h-16" data-testid={`channel-search-avatar-${channel.id}`}>
                      <AvatarImage
                        src={channel.profile_image_url || channel.thumbnail_url}
                        alt={getChannelDisplayName(channel)}
                      />
                      <AvatarFallback>
                        {getChannelInitial(channel)}
                      </AvatarFallback>
                    </Avatar>
                    {channel.is_live && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div>
                          <h3 className="font-semibold text-lg">{getChannelDisplayName(channel)}</h3>
                          <span className="text-gray-500 text-sm">@{getChannelUsername(channel)}</span>
                        </div>
                        {channel.follower_count > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-sm text-gray-600">
                            <Users className="w-4 h-4" />
                            <span>{formatNumber(channel.follower_count)} followers</span>
                          </div>
                        )}
                      </div>
                      {selectedChannels.some(c => c.id === channel.id) && (
                        <Check className="w-6 h-6 text-purple-600" />
                      )}
                    </div>

                    {channel.current_game && (
                      <div className="mt-2 flex items-center gap-2">
                        <GamepadIcon className="w-4 h-4 text-gray-600" />
                        <img
                          src={channel.current_game.box_art_url}
                          alt={channel.current_game.name}
                          className="w-8 h-10 rounded"
                        />
                        <span className="text-sm text-gray-600">{channel.current_game.name}</span>
                      </div>
                    )}

                    {channel.tags && channel.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {channel.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {channel.description && (
                      <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                        {channel.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-between items-center">
          <div className="text-sm text-gray-500">
            {selectedChannels.length > 0 && (
              <span>{selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          <div className="flex shrink-0 gap-3">
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

// Filepath: frontend/src/pages/Channels.tsx

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Trash2, Clock, Users } from 'lucide-react';
import ChannelSearchModal from '../components/ChannelSearchModal';
import { api } from '../lib/api';
import { ErrorBoundary } from 'react-error-boundary';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';

import type { Channel } from '../types';

interface Game {
  id: string;
  name: string;
  box_art_url: string;
}

const GameBox: React.FC<{ game: Game; className?: string }> = ({ game, className = "" }) => {
  if (!game?.box_art_url) return <span className="text-gray-500">No data</span>;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={game.box_art_url}
        alt={game.name}
        className="w-8 h-10 rounded"
      />
      <span className="text-sm text-gray-900">{game.name}</span>
    </div>
  );
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const Channels = () => {
  const [isSearchModalOpen, setIsSearchModalOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: channelsData, isLoading, error } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => {
      try {
        const response = await api.getChannels();
        console.log('Raw channels response:', response);
        console.log('Auth token in localStorage:', localStorage.getItem('auth_token'));
        // Transform the data to match our interface
        if (Array.isArray(response)) {
          return response.map(channel => ({
            id: channel.id,
            twitch_id: channel.twitch_id,
            username: channel.username,
            display_name: channel.display_name || channel.username,
            profile_image_url: channel.profile_image_url,
            description: channel.description || '',
            follower_count: channel.follower_count || 0,
            is_active: channel.is_active || true,
            is_live: channel.is_live || false,
            last_stream_date: channel.last_stream_date,
            last_game_id: channel.last_game_id,
            last_game_name: channel.last_game_name,
            last_game_box_art: channel.last_game_box_art,
            most_played_game: channel.most_played_game,
            created_at: channel.created_at,
          })) as Channel[];
        }
        return [];
      } catch (error) {
        console.error('API call failed:', error);
        console.error('Auth token:', localStorage.getItem('auth_token'));
        throw error;
      }
    },
    refetchInterval: 60000, // Refetch every minute to update live status
    retry: false, // Don't retry failed auth calls
  });

  const channels = channelsData || [];

  const deleteChannelMutation = useMutation({
    mutationFn: (id: number) => api.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  const addChannelMutation = useMutation({
    mutationFn: async (selectedChannels: any[]) => {
      const results = [];
      for (const channel of selectedChannels) {
        try {
          const result = await api.createChannel({
            twitch_id: channel.id || channel.twitch_id,
            username: channel.username || channel.display_name.toLowerCase(),
            display_name: channel.display_name,
            profile_image_url: channel.thumbnail_url || channel.profile_image_url,
            follower_count: channel.follower_count || 0,
            description: channel.description || ''
          });
          results.push(result);
        } catch (error: any) {
          // If it's just a duplicate channel error, continue with the next one
          if (error.message?.includes('already exists')) {
            console.warn(`Channel ${channel.display_name} already exists, skipping...`);
            continue;
          }
          // For other errors, throw them
          throw error;
        }
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setIsSearchModalOpen(false);
    },
    onError: (error: any) => {
      console.error('Failed to add channels:', error);
      // You might want to show an error toast or message here
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold mb-2">Error Loading Channels</h2>
          <p className="text-red-600">{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
          <p className="text-sm text-red-500 mt-2">Check browser console for details</p>
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Followers</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Stream Game</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Stream Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Most Played</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {channels?.map((channel) => (
              <tr key={channel.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={channel.profile_image_url || undefined} alt={channel.display_name} />
                        <AvatarFallback>{channel.display_name[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {channel.is_live && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{channel.display_name}</div>
                      <div className="text-sm text-gray-500">@{channel.username}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-900">{formatNumber(channel.follower_count)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {channel.last_game_id ? (
                    <GameBox game={{
                      id: channel.last_game_id,
                      name: channel.last_game_name || '',
                      box_art_url: channel.last_game_box_art || ''
                    }} />
                  ) : (
                    <span className="text-sm text-gray-500">No data</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-2 text-sm text-gray-900">
                        <Clock className="w-4 h-4" />
                        {channel.last_stream_date
                          ? new Date(channel.last_stream_date).toLocaleDateString()
                          : 'Never'
                        }
                      </TooltipTrigger>
                      {channel.last_stream_date && (
                        <TooltipContent>
                          {new Date(channel.last_stream_date).toLocaleString()}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {channel.most_played_game ? (
                    <span className="text-sm text-gray-900">{channel.most_played_game}</span>
                  ) : (
                    <span className="text-sm text-gray-500">No data</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <button
                    onClick={() => deleteChannelMutation.mutateAsync(channel.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ChannelSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelect={async (channels) => { await addChannelMutation.mutateAsync(channels); }}
        allowMultiple={true}
        existingChannels={channels?.map(channel => ({
          twitch_id: channel.twitch_id
        })) || []}
      />
    </div>
  );
};

export default function ChannelsWrapper() {
  return (
    <ErrorBoundary FallbackComponent={({ error }) => (
      <div className="p-4 text-red-500">Error: {error.message}</div>
    )}>
      <Channels />
    </ErrorBoundary>
  );
}

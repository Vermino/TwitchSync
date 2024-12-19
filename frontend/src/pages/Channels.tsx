import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Trash2, GamepadIcon, ClockIcon } from 'lucide-react';
import ChannelSearchModal from '../components/ChannelSearchModal';
import { api } from '../lib/api';
import { ErrorBoundary } from 'react-error-boundary';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
  </div>
);

const ErrorDisplay: React.FC<{ error: Error }> = ({ error }) => (
  <div className="p-4">
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
      {error.message}
    </div>
  </div>
);

const GameBox: React.FC<{
  game: {
    id: string;
    name: string;
    box_art_url: string;
  };
  tooltipContent?: React.ReactNode;
}> = ({ game, tooltipContent }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger className="flex items-center gap-2">
        <img
          src={game.box_art_url}
          alt={game.name}
          className="w-8 h-10 rounded"
        />
        <span className="text-sm text-gray-900">{game.name}</span>
      </TooltipTrigger>
      {tooltipContent && (
        <TooltipContent>
          <div className="text-sm">
            {tooltipContent}
          </div>
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
);

const formatNumber = (num: number) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const Channels = () => {
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: channels, isLoading, error } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
  });

  const addChannelMutation = useMutation({
    mutationFn: (selectedChannels: Array<{
      id: string;
      broadcaster_login: string;
      display_name: string;
      thumbnail_url: string;
      broadcaster_type: string;
      follower_count: number;
    }>) =>
      Promise.all(
        selectedChannels.map(channel => api.createChannel({
          twitch_id: channel.id,
          username: channel.broadcaster_login,
          display_name: channel.display_name,
          profile_image_url: channel.thumbnail_url,
          follower_count: channel.follower_count
        }))
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setIsSearchModalOpen(false);
    }
  });

  const deleteChannelMutation = useMutation({
    mutationFn: (id: number) => api.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error as Error} />;

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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Premieres</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {channels && channels.length > 0 ? (
              channels.map((channel) => (
                <tr key={channel.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Avatar className="h-10 w-10 mr-3">
                        <AvatarImage src={channel.profile_image_url} alt={channel.display_name} />
                        <AvatarFallback>{channel.display_name[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{channel.display_name}</div>
                        <div className="text-sm text-gray-500">@{channel.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatNumber(channel.follower_count || 0)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {channel.last_stream_game ? (
                      <GameBox
                        game={channel.last_stream_game}
                        tooltipContent={
                          <>
                            <p className="font-medium">{channel.last_stream_game.name}</p>
                            {channel.last_stream_duration && (
                              <p className="text-gray-500">Duration: {channel.last_stream_duration}</p>
                            )}
                          </>
                        }
                      />
                    ) : (
                      <span className="text-sm text-gray-500">No data</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-2 text-sm text-gray-900">
                          <ClockIcon className="w-4 h-4" />
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
                      <GameBox
                        game={channel.most_played_game}
                        tooltipContent={
                          <>
                            <p className="font-medium">{channel.most_played_game.name}</p>
                            <p className="text-gray-500">
                              {channel.most_played_game.hours.toFixed(1)} hours streamed
                            </p>
                          </>
                        }
                      />
                    ) : (
                      <span className="text-sm text-gray-500">No data</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {channel.premieres && channel.premieres.length > 0 ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <GamepadIcon className="w-3 h-3" />
                              {channel.premieres.length}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="p-2 space-y-2">
                              {channel.premieres.map((premiere, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <img
                                    src={premiere.game.box_art_url}
                                    alt={premiere.game.name}
                                    className="w-8 h-10 rounded"
                                  />
                                  <div className="text-sm">
                                    <p className="font-medium">{premiere.game.name}</p>
                                    <p className="text-gray-500">
                                      {new Date(premiere.date).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-sm text-gray-500">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => deleteChannelMutation.mutate(channel.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No channels added yet. Click &#34;Add Channels&#34; to start tracking channels!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ChannelSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelect={(selectedChannels) => addChannelMutation.mutate(selectedChannels)}
        allowMultiple={true}
      />
    </div>
  );
};

export default function ChannelsWrapper() {
  return (
    <ErrorBoundary FallbackComponent={ErrorDisplay}>
      <Channels />
    </ErrorBoundary>
  );
}

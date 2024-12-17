import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Trash2, CheckCircle, XCircle } from 'lucide-react';
import ChannelSearchModal from '../components/ChannelSearchModal';
import { api } from '../lib/api';
import { ErrorBoundary } from 'react-error-boundary';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';

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

const Channels = () => {
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch channels
  const { data: channels, isLoading, error } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
  });

// Add channel mutation
  const addChannelMutation = useMutation({
    mutationFn: (selectedChannels: Array<{
      id: string;
      login: string;
      display_name: string;
      profile_image_url: string;
      description: string;
      broadcaster_type: string;
      follower_count?: number;
    }>) =>
      Promise.all(
        selectedChannels.map(channel => {
          // Debug log
          console.log('Processing channel for creation:', channel);
          return api.createChannel({
            twitch_id: channel.id,
            username: channel.login,  // This should now be properly populated from broadcaster_login
            display_name: channel.display_name,
            profile_image_url: channel.profile_image_url,
            description: channel.description || '',
            follower_count: channel.follower_count || 0
          });
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      setIsSearchModalOpen(false);
    },
    onError: (error: any) => {
      console.error('Error adding channels:', error);
      // Add error message to UI
      alert(error.response?.data?.error || 'Failed to add channel');
    }
  });

  // Delete channel mutation
  const deleteChannelMutation = useMutation({
    mutationFn: (id: number) => api.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  // Toggle channel status mutation
  const toggleChannelMutation = useMutation({
    mutationFn: ({ id, currentStatus }: { id: number; currentStatus: boolean }) =>
      api.updateChannel(id, { is_active: !currentStatus }),
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

      {/* Channels Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Twitch ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {channels && channels.length > 0 ? (
              channels.map((channel) => (
                <tr key={channel.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Avatar className="h-10 w-10 mr-3">
                        <AvatarImage src={channel.profile_image_url} alt={channel.username} />
                        <AvatarFallback>{channel.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{channel.display_name}</div>
                        <div className="text-sm text-gray-500">@{channel.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{channel.twitch_id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleChannelMutation.mutate({
                        id: channel.id,
                        currentStatus: channel.is_active
                      })}
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
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No channels added yet. Click &#34;Add Channels&#34; to start tracking channels!
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
        onSelect={(selectedChannels) => addChannelMutation.mutate(selectedChannels)}
        allowMultiple={true}
      />
    </div>
  );
};

// Wrap with error boundary
export default function ChannelsWrapper() {
  return (
    <ErrorBoundary FallbackComponent={ErrorDisplay}>
      <Channels />
    </ErrorBoundary>
  );
}

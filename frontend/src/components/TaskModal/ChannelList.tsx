// Filepath: frontend/src/components/TaskModal/ChannelList.tsx

import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { api } from '@/lib/api';
import type { Channel } from '@/types/task';

interface ChannelListProps {
  selected: number[];
  onSelect: (channelId: number) => void;
  searchQuery: string;
}

const ChannelList: React.FC<ChannelListProps> = ({
  selected,
  onSelect,
  searchQuery
}) => {
  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => {
      const response = await api.getChannels();
      console.log('Raw channels response in ChannelList:', response);
      if (Array.isArray(response)) {
        return response;
      }
      return [];
    }
  });

  const filteredChannels = useMemo(() => {
    return channels.filter(channel =>
      channel.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [channels, searchQuery]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array(8).fill(0).map((_, i) => (
          <div key={i} className="animate-pulse flex p-4 border rounded-lg">
            <div className="h-10 w-10 bg-muted rounded-full" />
            <div className="ml-3 space-y-2 flex-1">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
      {filteredChannels.map(channel => (
        <button
          key={channel.id}
          type="button"
          onClick={() => onSelect(channel.id)}
          className={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${
            selected.includes(channel.id)
              ? 'border-purple-500 bg-purple-50/50'
              : 'border-border hover:bg-accent'
          }`}
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={channel.profile_image_url} />
            <AvatarFallback>
              {channel.display_name?.[0] || channel.username[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {channel.display_name || channel.username}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              @{channel.username}
            </p>
          </div>
          {selected.includes(channel.id) && (
            <Check className="h-4 w-4 text-purple-500 shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
};

export default ChannelList;

import React, { useState } from 'react';
import { Search, Check } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from '@tanstack/react-query';

interface ChannelsTabProps {
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

const ChannelsTab: React.FC<ChannelsTabProps> = ({
  selectedIds,
  onSelectionChange
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: channels = [], isLoading, error } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/channels', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch channels');
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Error fetching channels:', error);
        return [];
      }
    }
  });

  const filteredChannels = React.useMemo(() => {
    if (!Array.isArray(channels)) return [];

    return channels.filter(channel =>
      channel.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      channel.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [channels, searchQuery]);

  const handleChannelToggle = (channelId: number) => {
    const newIds = selectedIds.includes(channelId)
      ? selectedIds.filter(id => id !== channelId)
      : [...selectedIds, channelId];
    onSelectionChange(newIds);
  };

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error loading channels. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input
          placeholder="Search channels..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto p-1">
        {isLoading ? (
          Array(8).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse flex p-4 border rounded-lg">
              <div className="h-10 w-10 bg-muted rounded-full"/>
              <div className="ml-3 space-y-2 flex-1">
                <div className="h-4 bg-muted rounded w-3/4"/>
                <div className="h-3 bg-muted rounded w-1/2"/>
              </div>
            </div>
          ))
        ) : filteredChannels.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No channels found
          </div>
        ) : (
          filteredChannels.map(channel => (
            <button
              key={channel.id}
              type="button"
              onClick={() => handleChannelToggle(channel.id)}
              className={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${
                selectedIds.includes(channel.id)
                  ? 'border-purple-500 bg-purple-50/50'
                  : 'border-border hover:bg-accent'
              }`}
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={channel.profile_image_url}/>
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

              {selectedIds.includes(channel.id) && (
                <Check className="h-4 w-4 text-purple-500 shrink-0"/>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ChannelsTab;

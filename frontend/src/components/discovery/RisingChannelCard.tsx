// frontend/src/components/discovery/RisingChannelCard.tsx

import { TrendingUp, Users, Eye, Clock, Gamepad2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RisingChannelProps {
  channel: {
    id: string | number;
    display_name: string;
    username: string;
    profile_image_url?: string;
    current_game_name?: string;
    game_image?: string;
    avg_viewers?: number;
    growth_rate?: number;
    tags?: string[];
    metrics?: {
      followers?: number;
      averageViewers?: number;
      peakViewers?: number;
    };
  };
  onTrack?: (channelId: string) => void;
}

const RisingChannelCard = ({ channel, onTrack }: RisingChannelProps) => {
  if (!channel) return null;

  const growthPercent = channel.growth_rate ? (channel.growth_rate * 100).toFixed(1) : '0';
  const averageViewers = channel.avg_viewers || channel.metrics?.averageViewers || 0;
  const followers = channel.metrics?.followers || 0;
  const peakViewers = channel.metrics?.peakViewers || 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={channel.profile_image_url} alt={channel.display_name} />
              <AvatarFallback>{channel.display_name[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{channel.display_name}</div>
              <div className="text-sm text-gray-600 flex items-center gap-1">
                <TrendingUp size={14} className="text-green-500" />
                {growthPercent}% growth
              </div>
            </div>
          </div>
        </div>

        {(channel.current_game_name || channel.game_image) && (
          <div className="flex items-center gap-2 mb-3">
            {channel.game_image && (
              <img
                src={channel.game_image}
                className="w-8 h-8 rounded object-cover"
                alt={channel.current_game_name || 'Current game'}
              />
            )}
            {channel.current_game_name && (
              <span className="text-sm text-gray-600 flex items-center gap-1">
                <Gamepad2 size={14} />
                {channel.current_game_name}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-3 text-sm text-gray-600">
          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Users size={16} />
              <span>{followers.toLocaleString()}</span>
            </TooltipTrigger>
            <TooltipContent>Followers</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Eye size={16} />
              <span>{averageViewers.toLocaleString()}</span>
            </TooltipTrigger>
            <TooltipContent>Average viewers</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Clock size={16} />
              <span>{peakViewers.toLocaleString()}</span>
            </TooltipTrigger>
            <TooltipContent>Peak viewers</TooltipContent>
          </Tooltip>
        </div>

        {channel.tags && channel.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {channel.tags.map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {onTrack && (
          <button
            onClick={() => onTrack(channel.id.toString())}
            className="w-full px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
          >
            Track Channel
          </button>
        )}
      </CardContent>
    </Card>
  );
};

export default RisingChannelCard;

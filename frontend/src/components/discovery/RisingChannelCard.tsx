// frontend/src/components/discovery/RisingChannelCard.tsx

import React from 'react';
import { TrendingUp, Users, Eye, Clock, Gamepad2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RisingChannelCardProps } from '../../types/discovery';

const RisingChannelCard = ({ channel, onTrack }: RisingChannelCardProps) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={channel.avatar} alt={channel.name} />
              <AvatarFallback>{channel.name[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{channel.name}</div>
              <div className="text-sm text-gray-600 flex items-center gap-1">
                <TrendingUp size={14} className="text-green-500" />
                {(channel.metrics.growthRate * 100).toFixed(1)}% growth
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <img
            src={channel.gameImage}
            className="w-8 h-8 rounded object-cover"
            alt={channel.currentGame}
          />
          <span className="text-sm text-gray-600 flex items-center gap-1">
            <Gamepad2 size={14} />
            {channel.currentGame}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 text-sm text-gray-600">
          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Users size={16} />
              <span>{channel.metrics.followers.toLocaleString()}</span>
            </TooltipTrigger>
            <TooltipContent>Followers</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Eye size={16} />
              <span>{channel.metrics.averageViewers.toLocaleString()}</span>
            </TooltipTrigger>
            <TooltipContent>Average viewers</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Clock size={16} />
              <span>{channel.metrics.peakViewers.toLocaleString()}</span>
            </TooltipTrigger>
            <TooltipContent>Peak viewers</TooltipContent>
          </Tooltip>
        </div>

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

        <button
          onClick={() => onTrack(channel.id)}
          className="w-full px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
        >
          Track Channel
        </button>
      </CardContent>
    </Card>
  );
};

export default RisingChannelCard;

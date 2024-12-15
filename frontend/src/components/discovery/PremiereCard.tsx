// frontend/src/components/discovery/PremiereCard.tsx

import React from 'react';
import { Clock, Users, Trophy, Radio, Heart, TrendingUp } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { PremiereCardProps } from '../../types/discovery';

const PremiereCard = ({ premiere, onTrack, onIgnore }: PremiereCardProps) => {
  const formatTimeDifference = (startTime: string) => {
    const diff = new Date(startTime).getTime() - new Date().getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return hours > 24
      ? `${Math.floor(hours / 24)}d ${hours % 24}h`
      : `${hours}h ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}m`;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={premiere.channel.avatar} alt={premiere.channel.name} />
              <AvatarFallback>{premiere.channel.name[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{premiere.channel.name}</div>
              <div className="text-sm text-gray-600">
                {premiere.type === 'CHANNEL_PREMIERE' ? 'First time playing' : 'Rising Star'}
              </div>
            </div>
          </div>
          {premiere.metrics.viewerTrend === 'rising' && (
            <TrendingUp className="text-green-500" size={20} />
          )}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <img
            src={premiere.game.boxArt}
            className="w-8 h-8 rounded object-cover"
            alt={premiere.game.name}
          />
          <span>{premiere.game.name}</span>
          <div className="ml-auto flex items-center gap-1 text-sm text-gray-600">
            <Clock size={16} />
            <span>In {formatTimeDifference(premiere.startTime)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 text-sm text-gray-600">
          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Users size={16} />
              <span>{premiere.metrics.predictedViewers.toLocaleString()}</span>
            </TooltipTrigger>
            <TooltipContent>Predicted viewers</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Trophy size={16} />
              <span>{(premiere.metrics.confidence * 100).toFixed(0)}%</span>
            </TooltipTrigger>
            <TooltipContent>Confidence score</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <Radio size={16} />
              <span>{premiere.metrics.similarChannels} similar</span>
            </TooltipTrigger>
            <TooltipContent>Similar channels streaming this game</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTrack(premiere.id)}
            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm flex-1"
          >
            Track Stream
          </button>
          <button
            onClick={() => onIgnore(premiere.id)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            Ignore
          </button>
          <button className="p-1.5 text-gray-400 hover:text-red-500">
            <Heart size={20} />
          </button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PremiereCard;

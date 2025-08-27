// frontend/src/components/discovery/RecommendationCard.tsx

import React from 'react';
import { Users, Gamepad2, TrendingUp, BarChart2, Star } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type {
  RecommendationCardProps,
  ChannelRecommendation,
  GameRecommendation
} from '@/types/discovery';

const RecommendationCard: React.FC<RecommendationCardProps> = ({ item, type, onAction }) => {
  const renderReasons = () => (
    <div className="space-y-2 mb-3">
      {item.reasons.map((reason, index) => (
        <div key={`${reason.type}-${index}`} className="flex items-center gap-2">
          <Progress value={reason.strength * 100} className="h-2" />
          <span className="text-sm text-gray-600 min-w-[100px]">
            {reason.type.split('_').map(word =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ')}
          </span>
        </div>
      ))}
    </div>
  );

  if (type === 'channel') {
    const channelRec = item as ChannelRecommendation;
    const { channel } = channelRec;

    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-12 h-12">
              <AvatarImage src={channel.avatar} alt={channel.name} />
              <AvatarFallback>{channel.name[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{channel.name}</div>
              <div className="text-sm text-gray-600 flex items-center gap-1">
                <Gamepad2 size={14} />
                {channel.currentGame}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm font-medium">{(channelRec.score * 100).toFixed(0)}%</div>
              <div className="text-xs text-gray-600">Match</div>
            </div>
          </div>

          {renderReasons()}

          <div className="grid grid-cols-3 gap-2 mb-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Users size={16} />
              <span>{channel.followers.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <BarChart2 size={16} />
              <span>{channel.averageViewers.toLocaleString()}/stream</span>
            </div>
            <div className="flex items-center gap-1">
              <Star size={16} />
              <span>{channel.language}</span>
            </div>
          </div>

          <button
            onClick={() => onAction(channelRec.id)}
            className="w-full px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
          >
            Follow Channel
          </button>
        </CardContent>
      </Card>
    );
  }

  const gameRec = item as GameRecommendation;
  const { game } = gameRec;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <img
            src={game.boxArt}
            alt={game.name}
            className="w-12 h-12 rounded object-cover"
          />
          <div>
            <div className="font-medium">{game.name}</div>
            <div className="text-sm text-gray-600">
              {game.genres.slice(0, 2).join(', ')}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-sm font-medium">{(gameRec.score * 100).toFixed(0)}%</div>
            <div className="text-xs text-gray-600">Match</div>
          </div>
        </div>

        {renderReasons()}

        <div className="grid grid-cols-3 gap-2 mb-3 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Users size={16} />
            <span>{gameRec.metrics.activeChannels.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <BarChart2 size={16} />
            <span>{gameRec.metrics.averageViewers.toLocaleString()}/stream</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp size={16} />
            <span>{gameRec.metrics.totalViewers.toLocaleString()}</span>
          </div>
        </div>

        <button
          onClick={() => onAction(gameRec.id)}
          className="w-full px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
        >
          Track Game
        </button>
      </CardContent>
    </Card>
  );
};

export default RecommendationCard;

// frontend/src/components/discovery/RecommendationCard.tsx

import React from 'react';
import { Users, Gamepad2, Star, EyeOff } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type {
  RecommendationCardProps,
  ChannelRecommendation,
  GameRecommendation
} from '@/types/discovery';

const RecommendationCard: React.FC<RecommendationCardProps> = ({ item, type, onAction, onIgnore }) => {
  const renderReasons = () => (
    <div className="space-y-2 mb-3">
      {item.recommendation_reasons.map((reason, index) => (
        <div key={`${reason.type}-${index}`} className="flex items-center gap-2">
          <Progress value={reason.strength * 100} className="h-2" />
          <span className="text-sm text-gray-600 min-w-[100px]">
            {reason.type.split('_').map((word: string) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ')}
          </span>
        </div>
      ))}
    </div>
  );

  if (type === 'channel') {
    const channelRec = item as ChannelRecommendation;

    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-12 h-12">
              <AvatarImage src={channelRec.profile_image_url} alt={channelRec.display_name} />
              <AvatarFallback>{channelRec.display_name[0]?.toUpperCase() || 'C'}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{channelRec.display_name}</div>
              <div className="text-sm text-gray-600 flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px]">
                <Gamepad2 size={14} className="shrink-0" />
                {channelRec.current_game?.name || 'Multiple Games'}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm font-medium">{(channelRec.compatibility_score * 100).toFixed(0)}%</div>
              <div className="text-xs text-gray-600">Match</div>
            </div>
          </div>

          {renderReasons()}

          <div className="grid grid-cols-2 gap-2 mb-3 text-sm text-gray-600">
            <div className="flex items-center gap-1" title="VOD Views">
              <Users size={16} />
              <span>{channelRec.viewer_count.toLocaleString()} Views</span>
            </div>
            {channelRec.tags && channelRec.tags.length > 0 && (
              <div className="flex items-center gap-1 overflow-hidden" title="Tags">
                <Star size={16} className="shrink-0" />
                <span className="truncate">{channelRec.tags.slice(0, 1).join(', ')}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onAction(channelRec.id)}
              className="flex-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
            >
              Follow Channel
            </button>
            {onIgnore && (
              <button
                onClick={() => onIgnore(channelRec.id)}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition-colors"
                title="Don't show this channel again"
              >
                <EyeOff size={16} className="inline mr-1" />
                Ignore
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const gameRec = item as GameRecommendation;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <img
            src={gameRec.box_art_url}
            alt={gameRec.name}
            className="w-12 h-16 rounded object-cover border border-gray-200"
          />
          <div>
            <div className="font-medium">{gameRec.name}</div>
            <div className="text-sm text-gray-600 truncate max-w-[150px]">
              {gameRec.tags?.slice(0, 2).join(', ') || 'Game'}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-sm font-medium">{(gameRec.compatibility_score * 100).toFixed(0)}%</div>
            <div className="text-xs text-gray-600">Match</div>
          </div>
        </div>

        {renderReasons()}

        <div className="flex gap-2">
          <button
            onClick={() => onAction(gameRec.id)}
            className="flex-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
          >
            Track Game
          </button>
          {onIgnore && (
            <button
              onClick={() => onIgnore(gameRec.id)}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition-colors"
              title="Don't show this game again"
            >
              <EyeOff size={16} className="inline mr-1" />
              Ignore
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecommendationCard;

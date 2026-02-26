// frontend/src/components/discovery/RecommendationCard.tsx

import React, { useState } from 'react';
import { Users, Gamepad2, Star, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type {
  RecommendationCardProps,
  ChannelRecommendation,
  GameRecommendation
} from '@/types/discovery';

const RecommendationCard: React.FC<RecommendationCardProps> = ({ item, type, onAction, onIgnore }) => {
  const [vodIndex, setVodIndex] = useState(0);
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
              <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1 mt-1">
                {channelRec.shared_games_list && channelRec.shared_games_list.length > 0 ? (
                  channelRec.shared_games_list.map(g => (
                    <span key={g.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                      <Gamepad2 size={10} />
                      {g.name}
                    </span>
                  ))
                ) : (
                  <span className="flex items-center gap-1 text-xs">
                    <Gamepad2 size={12} />
                    {channelRec.current_game?.name || 'Multiple Games'}
                  </span>
                )}
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

          {channelRec.recent_vods && channelRec.recent_vods.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-medium text-gray-500 block">
                  Recent VOD Previews
                  <span className="font-normal border bg-gray-50 border-gray-200 rounded px-1 ml-1">
                    {vodIndex + 1}/{channelRec.recent_vods.length}
                  </span>
                </span>
                {channelRec.recent_vods.length > 1 && (
                  <div className="flex gap-1 relative z-50">
                    <button
                      onClick={(e) => { e.preventDefault(); setVodIndex(prev => prev > 0 ? prev - 1 : channelRec.recent_vods!.length - 1); }}
                      className="p-1 border border-gray-200 bg-white hover:bg-gray-100 rounded transition-colors shadow-sm"
                      title="Previous VOD"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); setVodIndex(prev => prev < channelRec.recent_vods!.length - 1 ? prev + 1 : 0); }}
                      className="p-1 border border-gray-200 bg-white hover:bg-gray-100 rounded transition-colors shadow-sm"
                      title="Next VOD"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="relative h-32 w-full mt-1">
                {channelRec.recent_vods.map((vod, i) => {
                  let diff = i - vodIndex;
                  if (diff < 0) diff += channelRec.recent_vods!.length;

                  // Show up to 4 cards in the stack visually
                  const isVisible = diff < 4;

                  return (
                    <a
                      key={vod.title + i}
                      href={vod.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-x-0 top-0 h-32 block group overflow-hidden rounded-md border border-gray-200 transition-all duration-300 ease-in-out origin-top shadow-sm bg-black"
                      style={{
                        zIndex: 40 - diff,
                        transform: `translateY(${diff * 6}px) scale(${1 - diff * 0.04})`,
                        opacity: isVisible ? 1 - (diff * 0.15) : 0,
                        pointerEvents: diff === 0 ? 'auto' : 'none'
                      }}
                    >
                      <img
                        src={vod.thumbnail_url}
                        alt={vod.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                          Watch on Twitch
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] sm:text-xs truncate px-2 py-1 flex items-center gap-1">
                        <Gamepad2 size={12} className="shrink-0 text-gray-300" />
                        {vod.game_name}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onAction(channelRec.id)}
              className="flex-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium shadow hover:bg-purple-700 hover:shadow-md transition-all active:scale-[0.98]"
            >
              Add Channel
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

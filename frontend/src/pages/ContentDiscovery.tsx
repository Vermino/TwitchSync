import React, { useState } from 'react';
import { Star, Sparkles, Trophy, Clock, Users, Gamepad2, Heart, TrendingUp,
         Radio, Filter, Bell, Calendar, Settings } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';

interface StreamPremiereEvent {
  id: string;
  type: 'CHANNEL_PREMIERE' | 'GAME_PREMIERE' | 'RISING_STAR';
  channel: {
    id: string;
    name: string;
    avatar: string;
    followerCount: number;
    averageViewers: number;
  };
  game: {
    id: string;
    name: string;
    boxArt: string;
    releaseDate?: string;
    genres: string[];
  };
  startTime: string;
  metrics: {
    predictedViewers: number;
    similarChannels: number;
    viewerTrend: 'rising' | 'stable' | 'falling';
    confidence: number;
  };
  tags: string[];
}

const ContentDiscovery = () => {
  const [activeTab, setActiveTab] = useState<'premieres' | 'discover'>('premieres');
  const [filters, setFilters] = useState({
    minViewers: 100,
    maxViewers: 50000,
    preferredLanguages: ['EN'],
    contentRating: 'all',
    notifyOnly: false,
    scheduleMatch: true,
    confidenceThreshold: 0.7
  });

  const FilterPanel = () => (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="font-medium mb-2">Viewer Range</h3>
          <div className="flex gap-2 items-center">
            <input
              type="range"
              min="0"
              max="50000"
              value={filters.minViewers}
              onChange={(e) => setFilters({...filters, minViewers: parseInt(e.target.value)})}
              className="w-full"
            />
            <span className="text-sm text-gray-600">{filters.minViewers}+</span>
          </div>
        </div>

        <div>
          <h3 className="font-medium mb-2">Content Settings</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.scheduleMatch}
                onChange={(e) => setFilters({...filters, scheduleMatch: e.target.checked})}
                className="rounded text-purple-600"
              />
              <span>Match my schedule</span>
            </label>
          </div>
        </div>

        <div>
          <h3 className="font-medium mb-2">Language Preferences</h3>
          <div className="flex flex-wrap gap-2">
            {['EN', 'ES', 'FR', 'DE', 'JP'].map(lang => (
              <button
                key={lang}
                className={`px-3 py-1 rounded-full text-sm ${
                  filters.preferredLanguages.includes(lang)
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
                onClick={() => {
                  const newLangs = filters.preferredLanguages.includes(lang)
                    ? filters.preferredLanguages.filter(l => l !== lang)
                    : [...filters.preferredLanguages, lang];
                  setFilters({...filters, preferredLanguages: newLangs});
                }}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const PremiereCard: React.FC<{ premiere: StreamPremiereEvent }> = ({ premiere }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <img
              src={premiere.channel.avatar}
              className="w-10 h-10 rounded-full"
              alt={premiere.channel.name}
            />
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
            className="w-8 h-8 rounded"
            alt={premiere.game.name}
          />
          <span>{premiere.game.name}</span>
          <div className="ml-auto flex items-center gap-1 text-sm text-gray-600">
            <Clock size={16} />
            <span>Starts {new Date(premiere.startTime).toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Users size={16} />
            <span>{premiere.metrics.predictedViewers.toLocaleString()} viewers</span>
          </div>
          <div className="flex items-center gap-1">
            <Trophy size={16} />
            <span>{premiere.metrics.confidence * 100}% match</span>
          </div>
          <div className="flex items-center gap-1">
            <Radio size={16} />
            <span>{premiere.metrics.similarChannels} similar</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm flex-1">
            Track Channel
          </button>
          <button className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
            Notify
          </button>
          <button className="p-1.5 text-gray-400 hover:text-red-500">
            <Heart size={20} />
          </button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Content Discovery</h1>
        <div className="flex items-center gap-3">
          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            <Bell size={20} />
          </button>
          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            <Filter size={20} />
          </button>
          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('premieres')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeTab === 'premieres' ? 'bg-purple-100 text-purple-700' : 'text-gray-600'
          }`}
        >
          <Star size={20} />
          Premieres
        </button>
        <button
          onClick={() => setActiveTab('discover')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeTab === 'discover' ? 'bg-purple-100 text-purple-700' : 'text-gray-600'
          }`}
        >
          <Sparkles size={20} />
          Discover
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar */}
        <div className="col-span-3 space-y-6">
          <FilterPanel />

          {/* Quick Stats */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">Today's Activity</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">New Premieres</span>
                  <span className="font-medium">12</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Rising Channels</span>
                  <span className="font-medium">5</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Matches</span>
                  <span className="font-medium">8</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="col-span-9 space-y-6">
          {activeTab === 'premieres' && (
            <div className="grid grid-cols-2 gap-6">
              {/* Channel Premieres */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Channel Premieres</h2>
                  <span className="text-sm text-purple-600">3 New</span>
                </div>

                {/* Sample premiere events */}
                {Array.from({length: 3}).map((_, i) => (
                  <PremiereCard
                    key={i}
                    premiere={{
                      id: `premiere-${i}`,
                      type: 'CHANNEL_PREMIERE',
                      channel: {
                        id: `channel-${i}`,
                        name: `Popular Streamer ${i + 1}`,
                        avatar: `/api/placeholder/40/40`,
                        followerCount: 100000,
                        averageViewers: 5000
                      },
                      game: {
                        id: `game-${i}`,
                        name: 'New Game Title',
                        boxArt: '/api/placeholder/60/40',
                        genres: ['Action', 'RPG']
                      },
                      startTime: new Date(Date.now() + 7200000).toISOString(),
                      metrics: {
                        predictedViewers: 15000,
                        similarChannels: 5,
                        viewerTrend: 'rising',
                        confidence: 0.85
                      },
                      tags: ['First Play', 'English']
                    }}
                  />
                ))}
              </div>

              {/* Game Premieres */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Rising Stars</h2>
                  <span className="text-sm text-green-600">5 Active</span>
                </div>

                {/* Sample rising stars */}
{Array.from({length: 3}).map((_, i) => (
  <PremiereCard
    key={i}
    premiere={{
      id: `rising-${i}`,
      type: 'RISING_STAR',
      channel: {
        id: `rising-channel-${i}`,
        name: `Rising Star ${i + 1}`,
        avatar: `/api/placeholder/40/40`,
        followerCount: 50000,
        averageViewers: 2000
      },
      game: {
        id: `favorite-game-${i}`,
        name: 'Favorite Game Title',
        boxArt: '/api/placeholder/60/40',
        genres: ['Strategy', 'Simulation']
      },
      startTime: new Date(Date.now() + 3600000).toISOString(),
      metrics: {
        predictedViewers: 8000,
        similarChannels: 3,
        viewerTrend: 'rising',
        confidence: 0.92
      },
      tags: ['Rising Star', 'English']
    }}
  />
))}
              </div>
            </div>
          )}

          {activeTab === 'discover' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Recommended Channels</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center text-gray-500 py-6">
                      Discovery recommendations will appear here as you track more content
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Similar Games</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center text-gray-500 py-6">
                      Game recommendations will appear here based on your interests
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentDiscovery;

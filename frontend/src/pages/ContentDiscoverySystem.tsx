import React, { useState } from 'react';
import {
  Star, Sparkles, Trophy, Clock, Users, Gamepad2,
  Heart, TrendingUp, Radio, Filter, Bell, Calendar,
  Settings, History, BookMarked
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'premieres' | 'discover' | 'history'>('premieres');
  const [filters, setFilters] = useState({
    minViewers: 100,
    maxViewers: 50000,
    preferredLanguages: ['EN'],
    contentRating: 'all',
    autoArchive: true,
    notifyOnly: false,
    scheduleMatch: true,
    confidenceThreshold: 0.7
  });

  const PremiereCard = ({ premiere }: { premiere: StreamPremiereEvent }) => (
    <div className="bg-white rounded-lg shadow p-4">
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
          Archive Stream
        </button>
        <button className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
          Notify
        </button>
        <button className="p-1.5 text-gray-400 hover:text-red-500">
          <Heart size={20} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto bg-gray-50 min-h-screen">
      {/* Header Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold">Content Discovery</h1>
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
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                    activeTab === 'history' ? 'bg-purple-100 text-purple-700' : 'text-gray-600'
                  }`}
                >
                  <History size={20} />
                  History
                </button>
              </div>
            </div>

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
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="col-span-3 space-y-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="space-y-4">
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
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-medium mb-3">Today's Activity</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">New Premieres</span>
                  <span className="font-medium">12</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Archived Streams</span>
                  <span className="font-medium">5</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Storage Used</span>
                  <span className="font-medium">2.1 TB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="col-span-9">
            {activeTab === 'premieres' && (
              <div className="grid grid-cols-2 gap-6">
                {/* Channel Premieres */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Channel Premieres</h2>
                    <span className="text-sm text-purple-600">3 New</span>
                  </div>

                  {/* Sample premieres */}
                  {[1, 2, 3].map((_, i) => (
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
                    <h2 className="text-lg font-semibold">Game Premieres</h2>
                    <span className="text-sm text-green-600">5 Active</span>
                  </div>

                  {/* Sample game premieres */}
                  {[1, 2, 3].map((_, i) => (
                    <PremiereCard
                      key={i}
                      premiere={{
                        id: `game-premiere-${i}`,
                        type: 'GAME_PREMIERE',
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentDiscovery;

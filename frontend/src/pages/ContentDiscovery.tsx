// frontend/src/pages/ContentDiscovery.tsx

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { api } from '@/lib/api';
import { discoveryService } from '@/services/discovery';
import DiscoveryHeader from '../components/discovery/DiscoveryHeader';
import FilterPanel from '../components/discovery/FilterPanel';
import StatsCard from '../components/discovery/StatsCard';
import RecommendationCard from '../components/discovery/RecommendationCard';
import PremiereCard from '../components/discovery/PremiereCard';
import RisingChannelCard from '../components/discovery/RisingChannelCard';
import { RefreshCw, Settings as SettingsIcon, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  DiscoveryFeedResponse,
  FilterSettings,
  DiscoveryStats,
  ChannelRecommendation,
  GameRecommendation,
  StreamPremiereEvent,
  RisingChannel
} from '@/types/discovery';

// Component state interfaces
interface RecommendationsState {
  channels: ChannelRecommendation[];
  games: GameRecommendation[];
  lastUpdated: Date | null;
  loading: boolean;
}

const defaultDiscoveryData: DiscoveryFeedResponse = {
  preferences: {
    minViewers: 100,
    maxViewers: 50000,
    preferredLanguages: ['EN'],
    contentRating: 'all',
    notifyOnly: false,
    scheduleMatch: true,
    confidenceThreshold: 0.7
  },
  premieres: [],
  risingChannels: [],
  recommendations: {
    channels: [],
    games: []
  },
  trending: [],
  stats: {
    upcomingPremieres: 0,
    trackedPremieres: 0,
    risingChannels: 0,
    pendingArchives: 0,
    todayDiscovered: 0
  }
};

const ContentDiscovery: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'premieres' | 'discover' | 'history'>('discover');
  const [recommendations, setRecommendations] = useState<RecommendationsState>({
    channels: [],
    games: [],
    lastUpdated: null,
    loading: true
  });
  const [stats, setStats] = useState<DiscoveryStats | null>(null);
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    minViewers: 100,
    maxViewers: 50000,
    preferredLanguages: ['EN'],
    contentRating: 'all',
    notifyOnly: false,
    scheduleMatch: true,
    confidenceThreshold: 0.7
  });
  const [discoveryData, setDiscoveryData] = useState<DiscoveryFeedResponse>(defaultDiscoveryData);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadRecommendations = async () => {
    setRecommendations(prev => ({ ...prev, loading: true }));
    setIsRefreshing(true);
    try {
      const [channels, games] = await Promise.all([
        discoveryService.getChannelRecommendations(filterSettings),
        discoveryService.getGameRecommendations(filterSettings)
      ]);

      setRecommendations({
        channels,
        games,
        lastUpdated: new Date(),
        loading: false
      });

      // Also update stats
      const statsData = await api.getDiscoveryStats();
      setStats(statsData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Error",
        description: `Failed to load recommendations: ${errorMessage}`,
        variant: "destructive"
      });
      setRecommendations(prev => ({ ...prev, loading: false }));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadRecommendations();
  }, [filterSettings]);

  const handleTrackChannel = async (channelId: string) => {
    try {
      await api.trackChannel(channelId, {
        quality: 'best',
        notifications: true,
        autoArchive: true
      });

      toast({
        title: "Success",
        description: "Channel will be tracked",
      });

      // Remove from recommendations
      setRecommendations(prev => ({
        ...prev,
        channels: prev.channels.filter(c => c.id !== channelId)
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Error",
        description: `Failed to track channel: ${errorMessage}`,
        variant: "destructive"
      });
    }
  };

  const handleTrackGame = async (gameId: string) => {
    try {
      await api.trackGame(gameId, {
        notifications: true,
        autoArchive: true
      });

      toast({
        title: "Success",
        description: "Game will be tracked",
      });

      // Remove from recommendations
      setRecommendations(prev => ({
        ...prev,
        games: prev.games.filter(g => g.id !== gameId)
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Error",
        description: `Failed to track game: ${errorMessage}`,
        variant: "destructive"
      });
    }
  };

  const renderRecommendations = () => {
    if (recommendations.loading) {
      return (
        <div className="flex justify-center items-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      );
    }

    return (
      <>
        {/* Channel Recommendations */}
        <div className="space-y-4 mb-8">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Channel Recommendations</h2>
            <span className="text-sm text-gray-500">
              {recommendations.channels.length} channels found
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {recommendations.channels.map(channel => (
              <RecommendationCard
                key={`channel-${channel.id}`}
                item={channel}
                type="channel"
                onAction={handleTrackChannel}
              />
            ))}
          </div>
        </div>

        {/* Game Recommendations */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Game Recommendations</h2>
            <span className="text-sm text-gray-500">
              {recommendations.games.length} games found
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {recommendations.games.map(game => (
              <RecommendationCard
                key={`game-${game.id}`}
                item={game}
                type="game"
                onAction={handleTrackGame}
              />
            ))}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DiscoveryHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsClick={() => {/* TODO: Implement settings modal */}}
        notificationCount={stats?.pendingArchives ?? 0}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="col-span-3 space-y-6">
            <FilterPanel
              settings={filterSettings}
              onChange={setFilterSettings}
            />
            {stats && <StatsCard stats={stats} />}
          </div>

          {/* Main Content */}
          <div className="col-span-9">
            <div className="flex justify-between items-center mb-6">
              <div>
                {recommendations.lastUpdated && (
                  <p className="text-sm text-gray-500">
                    Last updated: {recommendations.lastUpdated.toLocaleString()}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                onClick={loadRecommendations}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {activeTab === 'discover' && renderRecommendations()}

            {activeTab === 'premieres' && (
              <div className="grid grid-cols-2 gap-6">
                {discoveryData.premieres.map(premiere => (
                  <PremiereCard
                    key={`premiere-${premiere.id}`}
                    premiere={premiere}
                    onTrack={handleTrackChannel}
                    onIgnore={async () => {/* TODO: Implement ignore */}}
                  />
                ))}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="text-center py-12 text-gray-500">
                History view coming soon...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentDiscovery;

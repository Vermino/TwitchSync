// frontend/src/pages/ContentDiscovery.tsx

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { discoveryService } from '@/services/discovery';
import DiscoveryHeader from '../components/discovery/DiscoveryHeader';
import FilterPanel from '../components/discovery/FilterPanel';
import StatsCard from '../components/discovery/StatsCard';
import RecommendationCard from '../components/discovery/RecommendationCard';
import PremiereCard from '../components/discovery/PremiereCard';
import DiscoverySettings from '../components/discovery/DiscoverySettings';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  DiscoveryFeedResponse,
  FilterSettings,
  DiscoveryStats,
  ChannelRecommendation,
  GameRecommendation
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
  const [discoveryData, _setDiscoveryData] = useState<DiscoveryFeedResponse>(defaultDiscoveryData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userSettings, setUserSettings] = useState({
    notifications: {
      premieres: true,
      risingStars: true,
      recommendations: false
    },
    archiving: {
      autoArchive: true,
      quality: 'best',
      retention: 30
    },
    discovery: {
      scheduleMatch: true,
      minConfidence: 0.7,
      autoTrack: false
    }
  });

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
      const statsData = await discoveryService.getDiscoveryStats();
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
      // Find the channel data to get the actual name
      const channel = recommendations.channels.find(c => c.id === channelId);
      const channelName = channel?.channel.name || channelId;

      await discoveryService.trackChannel(channelName, {
        quality: 'best',
        notifications: true,
        autoArchive: true
      });

      toast({
        title: "Success",
        description: `${channelName} is now being tracked`,
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
      // Find the game data to get the actual name
      const game = recommendations.games.find(g => g.id === gameId);
      const gameName = game?.game.name || gameId;

      await discoveryService.trackGame(gameName, {
        notifications: true,
        autoArchive: true
      });

      toast({
        title: "Success",
        description: `${gameName} is now being tracked`,
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

  const handleIgnoreChannel = async (channelId: string) => {
    try {
      await discoveryService.ignoreChannel(channelId);
      toast({
        title: 'Channel ignored',
        description: 'This channel will no longer appear in recommendations.',
      });
      setRecommendations(prev => ({
        ...prev,
        channels: prev.channels.filter(c => c.id !== channelId)
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: 'Error',
        description: `Failed to ignore channel: ${errorMessage}`,
        variant: 'destructive'
      });
    }
  };

  const handleIgnoreGame = async (gameId: string) => {
    try {
      await discoveryService.ignoreGame(gameId);
      toast({
        title: 'Game ignored',
        description: 'This game will no longer appear in recommendations.',
      });
      setRecommendations(prev => ({
        ...prev,
        games: prev.games.filter(g => g.id !== gameId)
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: 'Error',
        description: `Failed to ignore game: ${errorMessage}`,
        variant: 'destructive'
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

    const hasChannels = recommendations.channels.length > 0;
    const hasGames = recommendations.games.length > 0;

    if (!hasChannels && !hasGames) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No recommendations found</h3>
          <p className="text-gray-600 mb-6">
            We couldn't find any recommendations based on your current preferences.<br />
            Try adjusting your filters or check back later.
          </p>
          <Button
            onClick={loadRecommendations}
            variant="outline"
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Try Again
          </Button>
        </div>
      );
    }

    return (
      <>
        {/* Channel Recommendations */}
        {hasChannels && (
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
                  onAction={(id) => handleTrackChannel(id)}
                  onIgnore={(id) => handleIgnoreChannel(id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Game Recommendations */}
        {hasGames && (
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
                  onAction={(id) => handleTrackGame(id)}
                  onIgnore={(id) => handleIgnoreGame(id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Show individual empty states if only one type is missing */}
        {!hasChannels && hasGames && (
          <div className="mb-8 text-center py-8 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-1">No channel recommendations</h3>
            <p className="text-sm text-gray-600">Try adjusting your filters to see more options.</p>
          </div>
        )}

        {hasChannels && !hasGames && (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-1">No game recommendations</h3>
            <p className="text-sm text-gray-600">Try adjusting your filters to see more options.</p>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DiscoveryHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsClick={() => setShowSettings(true)}
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
                    onIgnore={async (id) => await handleIgnoreChannel(id)}
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

      {/* Settings Modal */}
      <DiscoverySettings
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={userSettings}
        onSettingsChange={setUserSettings}
      />
    </div>
  );
};

export default ContentDiscovery;

// frontend/src/pages/ContentDiscovery.tsx

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { discoveryService } from '@/services/discovery';
import { api } from '@/lib/api';
import DiscoveryHeader from '../components/discovery/DiscoveryHeader';
import FilterPanel from '../components/discovery/FilterPanel';
import RecommendationCard from '../components/discovery/RecommendationCard';
import DiscoverySettings from '../components/discovery/DiscoverySettings';
import TaskModal from '@/components/TaskModal/TaskModal';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  FilterSettings,
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


const ContentDiscovery: React.FC = () => {
  const { toast } = useToast();
  const [recommendations, setRecommendations] = useState<RecommendationsState>({
    channels: [],
    games: [],
    lastUpdated: null,
    loading: true
  });
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    minViewers: 100,
    maxViewers: 50000,
    preferredLanguages: ['EN'],
    contentRating: 'all',
    notifyOnly: false,
    confidenceThreshold: 0.7
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userSettings, setUserSettings] = useState({
    notifications: {
      recommendations: false
    },
    archiving: {
      autoArchive: true,
      quality: 'best',
      retention: 30
    },
    discovery: {
      minConfidence: 0.7,
      autoTrack: false
    }
  });

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [pendingTask, setPendingTask] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

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

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Error",
        description: `Failed to load recommendations: ${errorMessage} `,
        variant: "destructive"
      });
      setRecommendations(prev => ({ ...prev, loading: false }));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    api.getDiscoveryFeed().then(feed => {
      if (mounted && feed?.preferences) {
        const prefs = feed.preferences as any;
        setFilterSettings(prev => ({
          ...prev,
          minViewers: prefs.min_viewers ?? prefs.minViewers ?? 0,
          maxViewers: prefs.max_viewers ?? prefs.maxViewers ?? 1000000,
          preferredLanguages: prefs.preferred_languages ?? prefs.preferredLanguages ?? ['en'],
          contentRating: prefs.content_rating ?? prefs.contentRating ?? 'all',
          notifyOnly: prefs.notify_only ?? prefs.notifyOnly ?? false,
          confidenceThreshold: prefs.confidence_threshold ?? prefs.confidenceThreshold ?? 0.7
        }));
      }
      if (mounted) setIsInitialized(true);
    }).catch((e: any) => {
      console.error("Failed to load initial discovery preferences", e);
      if (mounted) setIsInitialized(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (isInitialized) {
      loadRecommendations();
    }
  }, [filterSettings, isInitialized]);

  const handleTrackChannel = async (channelId: string) => {
    const channel = recommendations.channels.find(c => c.id === channelId);
    if (!channel) return;

    try {
      await api.createChannel({
        twitch_id: channel.id,
        username: channel.login,
        display_name: channel.display_name,
        profile_image_url: channel.profile_image_url,
        follower_count: channel.viewer_count // fallback if we don't have exact followers
      });

      toast({
        title: "Channel Added",
        description: `Successfully started tracking ${channel.display_name}.`,
      });

      // Remove from recommendations proactively
      setRecommendations(prev => ({
        ...prev,
        channels: prev.channels.filter(c => c.id !== channelId)
      }));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add channel.",
        variant: "destructive"
      });
    }
  };

  const handleTrackGame = async (gameId: string) => {
    const game = recommendations.games.find(g => g.id === gameId);
    if (!game) return;

    try {
      await api.createGame({
        twitch_game_id: game.id,
        name: game.name,
        box_art_url: game.box_art_url
      });

      toast({
        title: "Game Tracked",
        description: `Successfully started tracking ${game.name}.`,
      });

      // Remove from recommendations proactively
      setRecommendations(prev => ({
        ...prev,
        games: prev.games.filter(g => g.id !== gameId)
      }));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to track game.",
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
        description: `Failed to ignore channel: ${errorMessage} `,
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
        description: `Failed to ignore game: ${errorMessage} `,
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
            <RefreshCw className={`w - 4 h - 4 mr - 2 ${isRefreshing ? 'animate-spin' : ''} `} />
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
                  key={`channel - ${channel.id} `}
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
                  key={`game - ${game.id} `}
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
        onSettingsClick={() => setShowSettings(true)}
        notificationCount={0}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="col-span-3 space-y-6">
            <FilterPanel
              settings={filterSettings}
              onChange={setFilterSettings}
            />
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
                <RefreshCw className={`w - 4 h - 4 mr - 2 ${isRefreshing ? 'animate-spin' : ''} `} />
                Refresh
              </Button>
            </div>

            {renderRecommendations()}
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

      {/* Task Creation Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={async () => { }}
        task={pendingTask}
      />
    </div>
  );
};

export default ContentDiscovery;



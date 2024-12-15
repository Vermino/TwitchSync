// frontend/src/pages/ContentDiscovery.tsx

import React, { useState, useEffect } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { api } from '@/lib/api';
import DiscoveryHeader from '../components/discovery/DiscoveryHeader';
import FilterPanel from '../components/discovery/FilterPanel';
import StatsCard from '../components/discovery/StatsCard';
import PremiereCard from '../components/discovery/PremiereCard';
import RisingChannelCard from '../components/discovery/RisingChannelCard';
import RecommendationCard from '../components/discovery/RecommendationCard';
import type {
  DiscoveryFeedResponse,
  FilterSettings,
  StreamPremiereEvent,
  RisingChannel,
  DiscoveryStats
} from '@/types/discovery';

const ContentDiscovery = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'premieres' | 'discover' | 'history'>('premieres');
  const [loading, setLoading] = useState(true);
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

  const [discoveryData, setDiscoveryData] = useState<DiscoveryFeedResponse | null>(null);
  const [premieres, setPremieres] = useState<StreamPremiereEvent[]>([]);
  const [risingChannels, setRisingChannels] = useState<RisingChannel[]>([]);

  // Load initial data
  useEffect(() => {
  const loadDiscoveryData = async () => {
    setLoading(true);
    try {
      // Load discovery feed
      const feed = await api.getDiscoveryFeed();
      setDiscoveryData(feed);
      setPremieres(feed.premieres);
      setRisingChannels(feed.risingChannels);

      // Load discovery stats
      const statsData = await api.getDiscoveryStats();
      setStats(statsData);

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load discovery data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  loadDiscoveryData();
}, []);

  // Handle filter changes
  const handleFilterChange = async (newSettings: FilterSettings) => {
    setFilterSettings(newSettings);
    try {
      // Update user preferences
      await api.updateDiscoveryPreferences(newSettings);

      // Refresh data with new filters
      const feed = await api.getDiscoveryFeed();
      setDiscoveryData(feed);
      setPremieres(feed.premieres);
      setRisingChannels(feed.risingChannels);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update preferences. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle premiere tracking
  const handleTrackPremiere = async (premiereId: string) => {
    try {
      await api.trackPremiereEvent(premiereId, {
        quality: 'best',
        retention: 30,
        notify: true
      });

      toast({
        title: "Success",
        description: "Premiere will be tracked and archived.",
      });

      // Refresh stats after tracking
      const statsData = await api.getDiscoveryStats();
      setStats(statsData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to track premiere. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle premiere ignore
  const handleIgnorePremiere = async (premiereId: string) => {
    try {
      await api.ignorePremiereEvent(premiereId);

      // Remove from local state
      setPremieres(prev => prev.filter(p => p.id !== premiereId));

      toast({
        title: "Success",
        description: "Premiere has been ignored.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to ignore premiere. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle channel tracking
  const handleTrackChannel = async (channelId: string) => {
    try {
      const response = await api.createChannel({ id: channelId });

      toast({
        title: "Success",
        description: "Channel will be tracked.",
      });

      // Refresh rising channels
      const feed = await api.getDiscoveryFeed();
      setRisingChannels(feed.risingChannels);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to track channel. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <DiscoveryHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsClick={() => {/* TODO: Implement settings modal */}}
        notificationCount={stats?.pendingArchives || 0}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="col-span-3 space-y-6">
            <FilterPanel
              settings={filterSettings}
              onChange={handleFilterChange}
            />
            {stats && <StatsCard stats={stats} />}
          </div>

          {/* Main Content Area */}
          <div className="col-span-9">
            {loading ? (
              <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
              </div>
            ) : (
              <>
                {activeTab === 'premieres' && (
                  <div className="grid grid-cols-2 gap-6">
                    {/* Channel Premieres */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Channel Premieres</h2>
                        <span className="text-sm text-purple-600">
                          {premieres.filter(p => p.type === 'CHANNEL_PREMIERE').length} New
                        </span>
                      </div>
                      {premieres
                        .filter(p => p.type === 'CHANNEL_PREMIERE')
                        .map(premiere => (
                          <PremiereCard
                            key={premiere.id}
                            premiere={premiere}
                            onTrack={handleTrackPremiere}
                            onIgnore={handleIgnorePremiere}
                          />
                        ))}
                    </div>

                    {/* Rising Stars */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Rising Stars</h2>
                        <span className="text-sm text-green-600">
                          {risingChannels.length} Active
                        </span>
                      </div>
                      {risingChannels.map(channel => (
                        <RisingChannelCard
                          key={channel.id}
                          channel={channel}
                          onTrack={handleTrackChannel}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'discover' && discoveryData && (
                  <div className="space-y-6">
                    {/* Channel Recommendations */}
                    <div className="grid grid-cols-2 gap-6">
                      {discoveryData.recommendations.channels.map(channel => (
                        <RecommendationCard
                          key={channel.id}
                          item={channel}
                          type="channel"
                          onAction={handleTrackChannel}
                        />
                      ))}
                    </div>

                    {/* Game Recommendations */}
                    <div className="grid grid-cols-2 gap-6">
                      {discoveryData.recommendations.games.map(game => (
                        <RecommendationCard
                          key={game.id}
                          item={game}
                          type="game"
                          onAction={(id) => {/* TODO: Implement game tracking */}}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="text-center py-12 text-gray-500">
                    History view coming soon...
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentDiscovery;

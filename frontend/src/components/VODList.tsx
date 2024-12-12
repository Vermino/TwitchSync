import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Eye, Game, User, Filter } from 'lucide-react';

interface VOD {
  id: number;
  twitch_vod_id: string;
  channel_name: string;
  game_name: string;
  title: string;
  duration: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
}

interface VODListProps {
  channelFilter?: string[];
  gameFilter?: string[];
}

const VODList: React.FC<VODListProps> = ({ channelFilter, gameFilter }) => {
  const [vods, setVods] = useState<VOD[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    showDownloaded: false,
    showPending: true,
    showProcessing: true
  });

  useEffect(() => {
    fetchVODs();
  }, [channelFilter, gameFilter]);

  const fetchVODs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (channelFilter?.length) {
        params.append('channels', channelFilter.join(','));
      }
      if (gameFilter?.length) {
        params.append('games', gameFilter.join(','));
      }

      const response = await fetch(`/api/vods?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch VODs');
      }

      const data = await response.json();
      setVods(data.vods);
      setError(null);
    } catch (err) {
      setError('Failed to load VODs');
      console.error('Error fetching VODs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (vodId: number) => {
    try {
      const response = await fetch(`/api/vods/${vodId}/download`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to start download');
      }
      // Update VOD status in list
      fetchVODs();
    } catch (err) {
      console.error('Error starting download:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-purple-600" />
          <span className="font-medium">Filters:</span>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={filters.showDownloaded}
              onChange={(e) => setFilters({ ...filters, showDownloaded: e.target.checked })}
              className="rounded border-gray-300 text-purple-600"
            />
            <span className="ml-2">Downloaded</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={filters.showPending}
              onChange={(e) => setFilters({ ...filters, showPending: e.target.checked })}
              className="rounded border-gray-300 text-purple-600"
            />
            <span className="ml-2">Pending</span>
          </label>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={filters.showProcessing}
              onChange={(e) => setFilters({ ...filters, showProcessing: e.target.checked })}
              className="rounded border-gray-300 text-purple-600"
            />
            <span className="ml-2">Processing</span>
          </label>
        </div>
      </div>

      {/* VOD Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vods.map((vod) => (
          <div key={vod.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
            {vod.thumbnail_url && (
              <img
                src={vod.thumbnail_url}
                alt={vod.title}
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-2 line-clamp-2">{vod.title}</h3>

              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center">
                  <User className="w-4 h-4 mr-2" />
                  {vod.channel_name}
                </div>

                <div className="flex items-center">
                  <Game className="w-4 h-4 mr-2" />
                  {vod.game_name}
                </div>

                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-2" />
                  {new Date(vod.created_at).toLocaleDateString()}
                </div>

                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  {vod.duration}
                </div>

                <div className="flex items-center">
                  <Eye className="w-4 h-4 mr-2" />
                  {vod.view_count.toLocaleString()} views
                </div>
              </div>

              <button
                onClick={() => handleDownload(vod.id)}
                className="mt-4 w-full bg-purple-600 text-white py-2 px-4 rounded-lg
                         hover:bg-purple-700 transition-colors duration-200"
              >
                Download VOD
              </button>
            </div>
          </div>
        ))}
      </div>

      {vods.length === 0 && !error && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="text-gray-500">No VODs found matching your criteria</div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default VODList;

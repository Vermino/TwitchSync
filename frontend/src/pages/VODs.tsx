import React, { useState, useEffect } from 'react';
import { Clock, Eye, Calendar } from 'lucide-react';

interface VOD {
  id: number;
  twitch_vod_id: string;
  channel_id: number;
  game_id: string;
  title: string;
  duration: string;
  view_count: number;
  created_at: string;
  published_at: string;
  type: string;
  url: string;
  thumbnail_url: string;
  channel_name?: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

const VODs = () => {
  const [vods, setVods] = useState<VOD[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0
  });

  const fetchVODs = async (page: number = 1) => {
    try {
      const response = await fetch(`http://localhost:3000/api/vods?page=${page}&limit=10`);
      if (!response.ok) throw new Error('Failed to fetch VODs');

      const data = await response.json();
      setVods(data.vods);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      setError('Failed to fetch VODs');
      console.error('Error fetching VODs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVODs();
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">VODs</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading VODs...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">VODs</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vods.map((vod) => (
          <div key={vod.id} className="bg-white rounded-lg shadow overflow-hidden">
            {vod.thumbnail_url ? (
              <img
                src={vod.thumbnail_url}
                alt={vod.title}
                className="w-full h-48 object-cover"
              />
            ) : (
              <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                <span className="text-gray-400">No thumbnail</span>
              </div>
            )}

            <div className="p-4">
              <h3 className="font-semibold text-lg mb-2 line-clamp-2">{vod.title}</h3>

              <div className="flex items-center text-sm text-gray-500 mb-2">
                <Calendar className="w-4 h-4 mr-1" />
                {new Date(vod.created_at).toLocaleDateString()}
              </div>

              <div className="flex items-center text-sm text-gray-500 mb-2">
                <Clock className="w-4 h-4 mr-1" />
                {vod.duration}
              </div>

              <div className="flex items-center text-sm text-gray-500">
                <Eye className="w-4 h-4 mr-1" />
                {vod.view_count.toLocaleString()} views
              </div>

              {vod.channel_name && (
                <div className="mt-2 text-sm text-purple-600">
                  Channel: {vod.channel_name}
                </div>
              )}

              <a
                href={vod.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 w-full text-center"
              >
                Watch VOD
              </a>
            </div>
          </div>
        ))}
      </div>

      {vods.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          No VODs found. They will appear here when channels are tracked.
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => fetchVODs(pagination.currentPage - 1)}
            disabled={pagination.currentPage === 1}
            className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>
          <button
            onClick={() => fetchVODs(pagination.currentPage + 1)}
            disabled={pagination.currentPage === pagination.totalPages}
            className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default VODs;

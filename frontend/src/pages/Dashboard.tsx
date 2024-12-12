import { useState, useEffect } from 'react';
import { Users, GamepadIcon, Video, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import type { DashboardStats } from '@/types';

const initialStats: DashboardStats = {
  channels: { total: 0, active: 0 },
  games: { total: 0, active: 0 },
  vods: { total: 0, totalViews: 0 },
  downloads: { active: 0, pending: 0, completed: 0, failed: 0 }
};

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await api.getDashboardStats();
        console.log('Fetched stats:', data); // Debug log
        setStats(data || initialStats);
        setError(null);
      } catch (err) {
        console.error('Error fetching stats:', err); // Debug log
        setError(api.handleError(err));
        setStats(initialStats);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Channels Card */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Channels</h3>
            <Users className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-3xl font-bold text-gray-900">{stats.channels.total}</p>
              <p className="text-sm text-gray-500">Total Channels</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-green-600">{stats.channels.active}</p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>

        {/* Games Card */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Games</h3>
            <GamepadIcon className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-3xl font-bold text-gray-900">{stats.games.total}</p>
              <p className="text-sm text-gray-500">Total Games</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-green-600">{stats.games.active}</p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>

        {/* VODs Card */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">VODs</h3>
            <Video className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-3xl font-bold text-gray-900">{stats.vods.total}</p>
              <p className="text-sm text-gray-500">Total VODs</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-purple-600">
                {stats.vods.totalViews.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">Total Views</p>
            </div>
          </div>
        </div>

        {/* Downloads Card */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Downloads</h3>
            <Activity className="w-6 h-6 text-purple-600" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Active</span>
              <span className="font-medium text-purple-600">{stats.downloads.active}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Pending</span>
              <span className="font-medium text-blue-600">{stats.downloads.pending}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Completed</span>
              <span className="font-medium text-green-600">{stats.downloads.completed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Failed</span>
              <span className="font-medium text-red-600">{stats.downloads.failed}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

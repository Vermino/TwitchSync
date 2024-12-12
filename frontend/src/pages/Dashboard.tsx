import React from 'react';
import { Users, Gamepad, Video, Activity } from 'lucide-react';
import { useQuery } from 'react-query';

interface DashboardStats {
  channels: {
    total: number;
    active: number;
  };
  games: {
    total: number;
    active: number;
  };
  vods: {
    total: number;
    totalViews: number;
  };
  downloads: {
    active: number;
    pending: number;
    completed: number;
    failed: number;
  };
}

const StatCard: React.FC<{
  title: string;
  total: number;
  active?: number;
  subtitle?: string;
  icon: React.FC<any>;
  items?: Array<{ label: string; value: number; color?: string }>;
}> = ({ title, total, active, subtitle, icon: Icon, items }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex justify-between items-start mb-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{total}</span>
          {active !== undefined && (
            <span className="text-green-500">{active} Active</span>
          )}
        </div>
        {subtitle && <p className="text-gray-500 text-sm">{subtitle}</p>}
      </div>
      <Icon className="w-8 h-8 text-purple-600" />
    </div>
    {items && (
      <div className="space-y-1">
        {items.map((item, index) => (
          <div key={index} className="flex justify-between text-sm">
            <span className="text-gray-600">{item.label}</span>
            <span className={item.color || 'text-gray-900'}>{item.value}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const Dashboard: React.FC = () => {
  const { data: stats, isLoading } = useQuery<DashboardStats>('dashboardStats', async () => {
    const response = await fetch('/api/dashboard/stats');
    if (!response.ok) throw new Error('Failed to fetch stats');
    return response.json();
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Channels Card */}
        <StatCard
          title="Channels"
          total={stats?.channels.total || 0}
          active={stats?.channels.active || 0}
          subtitle="Total Channels"
          icon={Users}
        />

        {/* Games Card */}
        <StatCard
          title="Games"
          total={stats?.games.total || 0}
          active={stats?.games.active || 0}
          subtitle="Total Games"
          icon={Gamepad}
        />

        {/* VODs Card */}
        <StatCard
          title="VODs"
          total={stats?.vods.total || 0}
          subtitle="Total Views"
          icon={Video}
        />

        {/* Downloads Card */}
        <StatCard
          title="Downloads"
          total={stats?.downloads.active || 0}
          icon={Activity}
          items={[
            { label: 'Active', value: stats?.downloads.active || 0, color: 'text-purple-600' },
            { label: 'Pending', value: stats?.downloads.pending || 0, color: 'text-blue-600' },
            { label: 'Completed', value: stats?.downloads.completed || 0, color: 'text-green-600' },
            { label: 'Failed', value: stats?.downloads.failed || 0, color: 'text-red-600' }
          ]}
        />
      </div>
    </div>
  );
};

export default Dashboard;

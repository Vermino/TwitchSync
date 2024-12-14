// frontend/src/pages/Dashboard.tsx

import React from 'react';
import { Users, Gamepad, ListChecks } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ErrorBoundary } from 'react-error-boundary';

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

const DashboardError: React.FC<{ error: Error }> = ({ error }) => (
  <div className="p-4">
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
      {error.message || 'Failed to load dashboard stats'}
    </div>
  </div>
);

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center min-h-[200px]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
  </div>
);

const Dashboard: React.FC = () => {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => api.getDashboardStats(),
    staleTime: 30000,
    cacheTime: 60000,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error instanceof Error) {
    return <DashboardError error={error} />;
  }

  if (!stats) {
    return null;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Channels"
          total={stats.channels.total}
          active={stats.channels.active}
          subtitle="Total Channels"
          icon={Users}
        />

        <StatCard
          title="Games"
          total={stats.games.total}
          active={stats.games.active}
          subtitle="Total Games"
          icon={Gamepad}
        />

        <StatCard
          title="Tasks"
          total={stats.tasks.active + stats.tasks.pending}
          icon={ListChecks}
          items={[
            { label: 'Active', value: stats.tasks.active, color: 'text-purple-600' },
            { label: 'Pending', value: stats.tasks.pending, color: 'text-blue-600' },
            { label: 'Completed', value: stats.tasks.completed, color: 'text-green-600' },
            { label: 'Failed', value: stats.tasks.failed, color: 'text-red-600' }
          ]}
        />
      </div>
    </div>
  );
};

export default function DashboardWrapper() {
  return (
    <ErrorBoundary FallbackComponent={DashboardError}>
      <Dashboard />
    </ErrorBoundary>
  );
}

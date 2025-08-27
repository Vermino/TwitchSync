// frontend/src/components/discovery/StatsCard.tsx

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import {
  Star, TrendingUp, Clock, Archive,
  Users, Radio, Sparkles
} from 'lucide-react';
import type { StatsCardProps } from '../../types/discovery';

const StatsCard = ({ stats }: StatsCardProps) => {
  const statItems = [
    {
      icon: <Clock className="w-4 h-4 text-blue-500" />,
      label: 'Upcoming Premieres',
      value: stats.upcomingPremieres,
    },
    {
      icon: <Archive className="w-4 h-4 text-purple-500" />,
      label: 'Tracked Premieres',
      value: stats.trackedPremieres,
    },
    {
      icon: <TrendingUp className="w-4 h-4 text-green-500" />,
      label: 'Rising Channels',
      value: stats.risingChannels,
    },
    {
      icon: <Star className="w-4 h-4 text-yellow-500" />,
      label: 'Pending Archives',
      value: stats.pendingArchives,
    }
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <h3 className="font-medium text-sm text-gray-600">Today&#39;s Activity</h3>
        <Sparkles className="w-4 h-4 text-purple-500" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {statItems.map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {item.icon}
                <span className="text-sm text-gray-600">{item.label}</span>
              </div>
              <span className="font-medium">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Discovery Score</span>
            <span className="text-sm font-medium text-purple-600">
              {stats.todayDiscovered} new
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Users size={16} className="text-gray-400" />
              <span className="text-sm text-gray-600">
                {stats.upcomingPremieres + stats.risingChannels} channels
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Radio size={16} className="text-gray-400" />
              <span className="text-sm text-gray-600">
                {stats.trackedPremieres} tracked
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatsCard;

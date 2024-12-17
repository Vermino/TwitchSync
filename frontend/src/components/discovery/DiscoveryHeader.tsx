// frontend/src/components/discovery/DiscoveryHeader.tsx

import React from 'react';
import { Star, Sparkles, History, Settings, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface DiscoveryHeaderProps {
  activeTab: 'premieres' | 'discover' | 'history';
  onTabChange: (tab: 'premieres' | 'discover' | 'history') => void;
  onSettingsClick: () => void;
  notificationCount?: number;
}

const DiscoveryHeader = ({
  activeTab,
  onTabChange,
  onSettingsClick,
  notificationCount = 0
}: DiscoveryHeaderProps) => {
  const tabs = [
    {
      id: 'premieres' as const,
      label: 'Premieres',
      icon: Star
    },
    {
      id: 'discover' as const,
      label: 'Discover',
      icon: Sparkles
    },
    {
      id: 'history' as const,
      label: 'History',
      icon: History
    }
  ];

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">Content Discovery</h1>
            <div className="flex gap-2">
              {tabs.map(tab => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'ghost'}
                  onClick={() => onTabChange(tab.id)}
                  className="flex items-center gap-2"
                >
                  <tab.icon size={20} />
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell size={20} />
                  {notificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                      {notificationCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50">
                <DropdownMenuItem>View All Notifications</DropdownMenuItem>
                <DropdownMenuItem>Mark All as Read</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon"
              onClick={onSettingsClick}
            >
              <Settings size={20} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoveryHeader;

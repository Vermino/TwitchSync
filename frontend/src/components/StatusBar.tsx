import React, { useState, useEffect } from 'react';
import { Activity, Disc, Radio, Database } from 'lucide-react';

interface SystemStatus {
  activeChannels: number;
  activeGames: number;
  pendingDownloads: number;
  activeDownloads: number;
  diskSpace?: {
    free: number;
    total: number;
    used: number;
  };
}

const StatusBar: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus | null>({
    activeChannels: 0,
    activeGames: 0,
    pendingDownloads: 0,
    activeDownloads: 0,
    diskSpace: {
      free: 0,
      total: 0,
      used: 0
    }
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/system/status');
        if (!response.ok) throw new Error('Failed to fetch status');
        const data = await response.json();
        setStatus(data);
      } catch (error) {
        console.error('Error fetching system status:', error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Early return if status is null
  if (!status) {
    return null;
  }

  const diskSpacePercentage = status.diskSpace
    ? ((status.diskSpace.used / status.diskSpace.total) * 100)
    : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 text-white p-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-6">
        {/* Channel Status */}
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-purple-400" />
          <span>{status.activeChannels} channels watching</span>
        </div>

        {/* Game Status */}
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-400" />
          <span>{status.activeGames} games tracking</span>
        </div>

        {/* Download Status */}
        <div className="flex items-center gap-2">
          <Disc className="w-4 h-4 text-purple-400" />
          <span>
            {status.activeDownloads} downloading, {status.pendingDownloads} pending
          </span>
        </div>
      </div>

      {/* Disk Space */}
      {status.diskSpace && (
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-purple-400" />
          <div className="flex items-center gap-4">
            <span>Free: {formatBytes(status.diskSpace.free)}</span>
            <span>Used: {formatBytes(status.diskSpace.used)}</span>
            <div className="w-32 bg-gray-600 rounded-full h-2">
              <div
                className="bg-purple-400 rounded-full h-2 transition-all duration-300"
                style={{ width: `${diskSpacePercentage}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusBar;

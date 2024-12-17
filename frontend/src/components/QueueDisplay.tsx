// Filepath: frontend/src/components/QueueDisplay.tsx

import React from 'react';
import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { TaskProgress } from '@/types/task';

interface QueueDisplayProps {
  queue: TaskProgress['queue'];
  compact?: boolean;
}

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return <Clock className="h-4 w-4 text-gray-400" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return null;
  }
};

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'pending':
      return 'text-gray-500';
    case 'processing':
      return 'text-blue-500';
    case 'completed':
      return 'text-green-500';
    case 'failed':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
};

export const QueueDisplay: React.FC<QueueDisplayProps> = ({ queue, compact = false }) => {
  if (!queue?.length) {
    return (
      <div className="text-sm text-gray-500">
        No items in queue
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1">
        {queue.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              {getStatusIcon(item.status)}
              <span className="truncate">{item.name}</span>
            </div>
            <span className={`text-xs ${getStatusColor(item.status)}`}>
              {item.status}
            </span>
          </div>
        ))}
        {queue.length > 3 && (
          <div className="text-xs text-gray-500">
            +{queue.length - 3} more items
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {queue.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between p-2 rounded-lg bg-gray-50"
        >
          <div className="flex items-center gap-3">
            {getStatusIcon(item.status)}
            <div>
              <div className="font-medium">{item.name}</div>
              <div className="text-sm text-gray-500">
                {item.type === 'channel' ? 'Channel' : 'Game'}
                {item.size && ` • ${(item.size / (1024 * 1024)).toFixed(1)} MB`}
              </div>
            </div>
          </div>
          <span className={`text-sm ${getStatusColor(item.status)}`}>
            {item.status}
          </span>
        </div>
      ))}
    </div>
  );
};

export default QueueDisplay;

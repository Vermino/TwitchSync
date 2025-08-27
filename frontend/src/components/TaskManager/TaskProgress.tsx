// Filepath: frontend/src/components/TaskManager/TaskProgress.tsx

import { Task } from '@/types/task';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Download, 
  Play, 
  Pause, 
  CheckCircle, 
  XCircle,
  AlertCircle 
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TaskProgressProps {
  task: Task;
}

export default function TaskProgress({ task }: TaskProgressProps) {
  // Format speed for display
  const formatSpeed = (speedMBps?: number) => {
    if (!speedMBps) return null;
    if (speedMBps < 1) {
      return `${(speedMBps * 1024).toFixed(0)} KB/s`;
    }
    return `${speedMBps.toFixed(1)} MB/s`;
  };

  // Format ETA for display
  const formatETA = (seconds?: number) => {
    if (!seconds || seconds <= 0) return null;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${Math.ceil(seconds)}s`;
  };

  // Get status icon and color
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'running':
        return {
          icon: <Play className="h-3 w-3" />,
          color: 'text-green-500',
          variant: 'default' as const
        };
      case 'paused':
        return {
          icon: <Pause className="h-3 w-3" />,
          color: 'text-yellow-500',
          variant: 'secondary' as const
        };
      case 'completed':
        return {
          icon: <CheckCircle className="h-3 w-3" />,
          color: 'text-green-500',
          variant: 'default' as const
        };
      case 'failed':
        return {
          icon: <XCircle className="h-3 w-3" />,
          color: 'text-red-500',
          variant: 'destructive' as const
        };
      case 'cancelled':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          color: 'text-yellow-500',
          variant: 'secondary' as const
        };
      default:
        return {
          icon: <Clock className="h-3 w-3" />,
          color: 'text-muted-foreground',
          variant: 'outline' as const
        };
    }
  };

  const statusDisplay = getStatusDisplay(task.status);
  const currentProgress = task.progress?.current_progress;
  const currentItem = currentProgress?.current_item;
  
  // Enhanced progress data from backend (with segment info, speed, ETA)
  const downloadSpeed = (currentItem as any)?.download_speed;
  const eta = (currentItem as any)?.eta;
  const currentSegment = (currentItem as any)?.current_segment;
  const totalSegments = (currentItem as any)?.total_segments;

  return (
    <div className="space-y-3">
      {/* Status and Progress Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`${statusDisplay.color}`}>
            {statusDisplay.icon}
          </span>
          <Badge variant={statusDisplay.variant} className="text-xs">
            {task.status}
          </Badge>
        </div>
        <div className="text-sm font-medium">
          {task.progress?.percentage?.toFixed(1) || 0}%
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <Progress value={task.progress?.percentage || 0} className="h-2" />
        
        {/* Enhanced Progress Details */}
        {task.status === 'running' && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              {/* Speed Display */}
              {downloadSpeed && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        <span>{formatSpeed(downloadSpeed)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Download Speed</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              
              {/* Segment Progress */}
              {currentSegment && totalSegments && (
                <span>{currentSegment}/{totalSegments} segments</span>
              )}
            </div>

            {/* ETA Display */}
            {eta && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatETA(eta)}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Estimated Time Remaining</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>

      {/* Current Item Processing */}
      {currentItem && (
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            {task.progress?.status_message || 'Processing'}
          </div>
          <div className="text-sm font-medium truncate" title={currentItem.name}>
            {currentItem.name}
          </div>
          {currentItem.progress !== undefined && (
            <Progress value={currentItem.progress} className="h-1" />
          )}
        </div>
      )}

      {/* VODs Progress Summary */}
      {currentProgress && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">
            {currentProgress.completed} / {currentProgress.total} VODs
          </span>
          {currentProgress.total > 0 && (
            <span className="ml-2">
              ({((currentProgress.completed / currentProgress.total) * 100).toFixed(0)}% complete)
            </span>
          )}
        </div>
      )}

      {/* Last Run Timestamp */}
      <div className="text-xs text-muted-foreground border-t pt-2">
        Last run: {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
      </div>
    </div>
  );
}

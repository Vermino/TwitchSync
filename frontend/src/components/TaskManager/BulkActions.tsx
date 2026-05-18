// Filepath: frontend/src/components/TaskManager/BulkActions.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Pause, 
  Play, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  MoreHorizontal,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { QueueStats } from '@/types/queue';

interface BulkActionsProps {
  stats: QueueStats;
  selectedItems: string[];
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  onClearCompleted: () => Promise<void>;
  onCancelAll: () => Promise<void>;
  onSetPriority: (priority: 'high' | 'normal' | 'low') => Promise<void>;
  onRefresh: () => Promise<void>;
  isLoading?: boolean;
}

export default function BulkActions({
  stats,
  selectedItems,
  onPauseAll,
  onResumeAll,
  onClearCompleted,
  onCancelAll,
  onSetPriority,
  onRefresh,
  isLoading = false
}: BulkActionsProps) {
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action);
    try {
      await fn();
    } finally {
      setActionLoading(null);
    }
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatSpeed = (speedMBps?: number) => {
    if (!speedMBps) return '0 MB/s';
    return `${speedMBps.toFixed(1)} MB/s`;
  };

  return (
    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
      <div className="flex items-center gap-6">
        {/* Queue Stats */}
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground font-medium">VOD Queue</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{stats.total_items} Total VODs</Badge>
            {stats.downloading > 0 && (
              <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                {stats.downloading} Downloading
              </Badge>
            )}
            {stats.pending > 0 && (
              <Badge variant="secondary">{stats.pending} Pending</Badge>
            )}
            {stats.paused > 0 && (
              <Badge variant="secondary">{stats.paused} Paused</Badge>
            )}
            {stats.failed > 0 && (
              <Badge variant="destructive">{stats.failed} Failed</Badge>
            )}
          </div>
        </div>

        {/* Performance Stats */}
        {(stats.total_download_speed || stats.estimated_completion_time) && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {stats.total_download_speed && (
              <span>Speed: {formatSpeed(stats.total_download_speed)}</span>
            )}
            {stats.estimated_completion_time && (
              <span>ETA: {formatTime(stats.estimated_completion_time)}</span>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Primary Actions */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAction('refresh', onRefresh)}
          disabled={isLoading || actionLoading === 'refresh'}
        >
          <RefreshCw className={`h-4 w-4 ${actionLoading === 'refresh' ? 'animate-spin' : ''}`} />
        </Button>

        {stats.downloading > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction('pause', onPauseAll)}
            disabled={isLoading || actionLoading === 'pause'}
          >
            <Pause className="h-4 w-4" />
            <span className="ml-1">Pause All</span>
          </Button>
        )}

        {(stats.paused > 0 || stats.pending > 0) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction('resume', onResumeAll)}
            disabled={isLoading || actionLoading === 'resume'}
          >
            <Play className="h-4 w-4" />
            <span className="ml-1">Resume All</span>
          </Button>
        )}

        {/* More Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isLoading}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Priority Actions */}
            <DropdownMenuItem
              onClick={() => handleAction('priority-high', () => onSetPriority('high'))}
              disabled={selectedItems.length === 0 || actionLoading === 'priority-high'}
            >
              <ArrowUp className="h-4 w-4 mr-2" />
              Set High Priority
              {selectedItems.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {selectedItems.length}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleAction('priority-normal', () => onSetPriority('normal'))}
              disabled={selectedItems.length === 0 || actionLoading === 'priority-normal'}
            >
              <ArrowDown className="h-4 w-4 mr-2" />
              Set Normal Priority
              {selectedItems.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {selectedItems.length}
                </Badge>
              )}
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            {/* Cleanup Actions */}
            {stats.completed > 0 && (
              <DropdownMenuItem
                onClick={() => setShowClearDialog(true)}
                disabled={actionLoading === 'clear'}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Completed
                <Badge variant="secondary" className="ml-auto text-xs">
                  {stats.completed}
                </Badge>
              </DropdownMenuItem>
            )}
            
            {stats.total_items > 0 && (
              <DropdownMenuItem
                onClick={() => setShowCancelDialog(true)}
                disabled={actionLoading === 'cancel'}
                className="text-destructive focus:text-destructive"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Cancel All
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Clear Completed Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Completed Downloads</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {stats.completed} completed items from the queue. 
              The downloaded files will remain on your system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await handleAction('clear', onClearCompleted);
                setShowClearDialog(false);
              }}
              disabled={actionLoading === 'clear'}
            >
              {actionLoading === 'clear' ? 'Clearing...' : 'Clear Completed'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel All Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel All Downloads</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel all {stats.total_items} items in the queue. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Downloads</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await handleAction('cancel', onCancelAll);
                setShowCancelDialog(false);
              }}
              disabled={actionLoading === 'cancel'}
              className="bg-destructive hover:bg-destructive/90"
            >
              {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
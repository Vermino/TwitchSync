// Filepath: frontend/src/components/TaskManager/DownloadHistory.tsx

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Trash2,
  MoreHorizontal,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  HardDrive
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { QueueClient } from '@/lib/api/queueClient';
import type { DownloadHistoryItem, QueueFilters, QueueSortOptions } from '@/types/queue';

const queueClient = new QueueClient();

interface DownloadHistoryProps {
  taskId?: number;
}

export default function DownloadHistory({ taskId }: DownloadHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('completed_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Build filters and sort options
  const filters: QueueFilters = useMemo(() => {
    const filters: QueueFilters = {};
    if (searchTerm) filters.search = searchTerm;
    if (statusFilter !== 'all') {
      filters.status = [statusFilter as any];
    }
    if (taskId) filters.task_id = [taskId];
    return filters;
  }, [searchTerm, statusFilter, taskId]);

  const sort: QueueSortOptions = useMemo(() => ({
    field: sortField as any,
    direction: sortDirection
  }), [sortField, sortDirection]);

  // Query for download history
  const { data: historyData, isLoading, error, refetch } = useQuery({
    queryKey: ['downloadHistory', filters, sort, page, limit],
    queryFn: () => queueClient.getHistory(filters, sort, page, limit),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const history = historyData?.items || [];
  const totalPages = historyData?.totalPages || 1;

  const handleRetry = async (itemId: string) => {
    try {
      await queueClient.retryFromHistory(itemId);
      refetch();
    } catch (error) {
      console.error('Failed to retry download:', error);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await queueClient.deleteHistoryItem(itemId);
      refetch();
    } catch (error) {
      console.error('Failed to delete history item:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatSpeed = (rawMbps: number | string | null | undefined) => {
    if (!rawMbps) return '0 KB/s';
    const mbps = Number(rawMbps);
    if (isNaN(mbps) || mbps === 0) return '0 KB/s';
    if (mbps < 1) return `${(mbps * 1024).toFixed(0)} KB/s`;
    return `${mbps.toFixed(1)} MB/s`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Download className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'cancelled':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center text-destructive">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load download history</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Download History</CardTitle>
            <CardDescription>
              {historyData?.total || 0} completed downloads
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search downloads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setSortField('completed_at'); setSortDirection('desc'); }}>
                <Calendar className="h-4 w-4 mr-2" />
                Newest First
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortField('completed_at'); setSortDirection('asc'); }}>
                <Calendar className="h-4 w-4 mr-2" />
                Oldest First
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setSortField('file_size'); setSortDirection('desc'); }}>
                <HardDrive className="h-4 w-4 mr-2" />
                Largest Files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortField('download_speed'); setSortDirection('desc'); }}>
                <Download className="h-4 w-4 mr-2" />
                Fastest Downloads
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No download history found</p>
            {searchTerm && (
              <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')} className="mt-2">
                Clear Search
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((item: DownloadHistoryItem) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-20 h-12 rounded overflow-hidden bg-muted-foreground/10">
                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url.replace(/%{width}x%{height}/, '160x90')}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {getStatusIcon(item.status)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{item.title}</h3>
                      <Badge variant={getStatusVariant(item.status)}>
                        {item.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.channel_name}
                      {item.game_name && ` • ${item.game_name}`}
                      {item.duration && ` • ${item.duration}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Completed: {new Date(item.completed_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {formatFileSize(item.file_size)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatSpeed(item.download_speed)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDuration(item.download_time)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {item.error_message && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">{item.error_message}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {item.status === 'failed' && (
                        <DropdownMenuItem onClick={() => handleRetry(item.id)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry Download
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDelete(item.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove from History
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
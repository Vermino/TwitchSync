// Filepath: frontend/src/components/TaskManager/VodList.tsx

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Download, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDurationString, isValidDuration } from '@/utils/duration';

interface VodListProps {
  taskId: number;
  loading: boolean;
}

export default function VodList({ taskId, loading }: VodListProps) {
  const { data: vods = [] } = useQuery({
    queryKey: ['vods'],
    queryFn: () => api.getVods(),
    refetchInterval: 30000
  });

  const taskVods = vods.filter(vod => vod.task_id === taskId);

  const formatVodDuration = (duration: string | null | undefined) => {
    if (!duration) return 'Calculating duration...';
    if (!isValidDuration(duration)) return 'Processing...';
    return formatDurationString(duration);
  };

  const formatThumbnailUrl = (url: string | null | undefined) => {
    if (!url) return null;
    // Replace Twitch's template with actual dimensions
    return url.replace(/%{width}x%{height}/, '320x180');
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600 mx-auto"></div>
      </div>
    );
  }

  if (taskVods.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No VODs found for this task
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {taskVods.map((vod) => (
        <div
          key={vod.id}
          className="flex items-center justify-between p-2 rounded-lg bg-muted"
        >
          <div className="flex items-center gap-3">
            <div className="w-24 h-16 rounded overflow-hidden bg-muted-foreground/10">
              {vod.thumbnail_url ? (
                <img
                  src={formatThumbnailUrl(vod.thumbnail_url)}
                  alt={vod.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Download className="h-6 w-6 text-muted-foreground/50" />
                </div>
              )}
            </div>
            <div>
              <div className="font-medium truncate max-w-[500px]">{vod.title}</div>
              <div className="text-sm text-muted-foreground">
                Duration: {formatVodDuration(vod.duration)} • Created: {new Date(vod.created_at).toLocaleString()}
              </div>
              {vod.channel_name && (
                <div className="text-sm text-muted-foreground">
                  Channel: {vod.channel_name}
                  {vod.game_name && ` • Game: ${vod.game_name}`}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right min-w-[120px]">
              {vod.download_status === 'downloading' && (
                <div className="mb-2 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{vod.download_progress?.toFixed(1) || 0}%</span>
                  </div>
                  <Progress value={vod.download_progress || 0} className="h-1 w-24" />
                  {/* Enhanced progress details */}
                  {(vod as any).segments && (
                    <div className="text-xs text-muted-foreground">
                      {(vod as any).current_segment}/{(vod as any).total_segments} segments
                    </div>
                  )}
                  {(vod as any).download_speed && (
                    <div className="text-xs text-muted-foreground">
                      {((vod as any).download_speed < 1 ?
                        `${((vod as any).download_speed * 1024).toFixed(0)} KB/s` :
                        `${(vod as any).download_speed.toFixed(1)} MB/s`)}
                    </div>
                  )}
                  {(vod as any).eta && (
                    <div className="text-xs text-muted-foreground">
                      ETA: {Math.floor((vod as any).eta / 60)}:{String((vod as any).eta % 60).padStart(2, '0')}
                    </div>
                  )}
                </div>
              )}
              <Badge variant={
                vod.download_status === 'completed' ? 'default' :
                  vod.download_status === 'failed' ? 'destructive' :
                    vod.download_status === 'downloading' ? 'default' :
                      vod.download_status === 'paused' ? 'secondary' :
                        'outline'
              }>
                {vod.download_status}
              </Badge>
            </div>
            {vod.error_message && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{vod.error_message}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

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

  const formatVodDuration = (duration: string | null | undefined) => {
    if (!duration || !isValidDuration(duration)) {
      return 'Unknown duration';
    }
    return formatDurationString(duration);
  };

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
                  src={vod.thumbnail_url}
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
              <div className="font-medium">{vod.title}</div>
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
            <div className="text-right">
              {vod.download_progress < 100 && vod.status !== 'failed' && (
                <div className="mb-1">
                  <Progress value={vod.download_progress} className="h-1 w-24" />
                </div>
              )}
              <Badge variant={
                vod.status === 'completed' ? 'default' :
                vod.status === 'failed' ? 'destructive' :
                'secondary'
              }>
                {vod.status}
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

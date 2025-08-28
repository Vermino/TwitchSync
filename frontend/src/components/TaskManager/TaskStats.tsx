// Filepath: frontend/src/components/TaskManager/TaskStats.tsx

import { Task, Channel, Game } from '@/types/task';
import { Users, Gamepad2, Download, Filter, Shield } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface TaskStatsProps {
  task: Task;
  channels: Channel[] | undefined;
  games: Game[] | undefined;
  channelsLoading: boolean;
  gamesLoading: boolean;
}

export default function TaskStats({ task, channels = [], games = [], channelsLoading, gamesLoading }: TaskStatsProps) {
  // Early return if dependent data is still loading to prevent race condition
  if (channelsLoading || gamesLoading) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Loading task details...</div>
      </div>
    );
  }


  const { data: vods = [] } = useQuery({
    queryKey: ['vods'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/vods', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch VODs');
        }
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error fetching VODs:', error);
        return [];
      }
    },
    refetchInterval: 5000 // Refresh every 5 seconds for real-time updates
  });

  const getTaskVods = (taskId: number) => {
    return vods.filter(vod => vod.task_id === taskId);
  };

  const getTaskChannels = (channelIds: number[] = []) => {
    if (!Array.isArray(channels)) return [];
    return channels.filter(channel => channelIds.includes(channel.id));
  };

  const getTaskGames = (gameIds: number[] = []) => {
    if (!Array.isArray(games)) return [];
    return games.filter(game => gameIds.includes(game.id));
  };

  const taskVods = getTaskVods(task.id);
  const completedVods = taskVods.filter(vod => vod.download_status === 'completed').length;
  const downloadingVods = taskVods.filter(vod => vod.download_status === 'downloading').length;
  const failedVods = taskVods.filter(vod => vod.download_status === 'failed').length;
  const pendingVods = taskVods.filter(vod => vod.download_status === 'pending').length;
  const totalVods = taskVods.length;

  const taskChannels = getTaskChannels(task.channel_ids);
  const taskGames = getTaskGames(task.game_ids);

  return (
    <>
      {/* Channels section */}
      <div className="space-y-2">
        <div className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Channels ({taskChannels.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {taskChannels.map(channel => (
            <TooltipProvider key={channel.id}>
              <Tooltip>
                <TooltipTrigger>
                  <img
                    src={channel.profile_image_url || ''}
                    alt={channel.display_name}
                    className="w-8 h-8 rounded-full"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {channel.display_name}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>

      {/* Games section */}
      <div className="space-y-2">
        <div className="text-sm font-medium flex items-center gap-2">
          <Gamepad2 className="h-4 w-4" />
          Games ({taskGames.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {taskGames.map(game => (
            <TooltipProvider key={game.id}>
              <Tooltip>
                <TooltipTrigger>
                  <img
                    src={game.box_art_url || ''}
                    alt={game.name}
                    className="w-8 h-12 rounded"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {game.name}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>

      {/* Enhanced Downloads section */}
      <div className="space-y-2">
        <div className="text-sm font-medium flex items-center gap-2">
          <Download className="h-4 w-4" />
          Downloads
        </div>
        <div className="space-y-1">
          {task.status === 'scanning' ? (
            <div className="text-sm text-blue-600 font-medium">
              Scanning for new VODs...
            </div>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{completedVods}</span> / {totalVods} VODs completed
              </div>
              {downloadingVods > 0 && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-green-600">{downloadingVods}</span> downloading
                </div>
              )}
              {pendingVods > 0 && task.status === 'downloading' && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-blue-600">{pendingVods}</span> pending
                </div>
              )}
              {failedVods > 0 && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-red-600">{failedVods}</span> failed
                </div>
              )}
              {totalVods > 0 && (
                <div className="text-xs text-muted-foreground">
                  {((completedVods / totalVods) * 100).toFixed(0)}% complete
                </div>
              )}
              {totalVods === 0 && task.status === 'ready' && (
                <div className="text-sm text-blue-600 font-medium">
                  Ready to activate - VODs found and queued
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Extra info */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        {task.conditions && Object.keys(task.conditions).length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span>{Object.keys(task.conditions).length} conditions applied</span>
          </div>
        )}
        {task.restrictions && Object.keys(task.restrictions).length > 0 && (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>{Object.keys(task.restrictions).length} restrictions applied</span>
          </div>
        )}
      </div>
    </>
  );
}

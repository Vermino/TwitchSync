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
}

export default function TaskStats({ task, channels = [], games = [] }: TaskStatsProps) {
  const { data: vods = [] } = useQuery({
    queryKey: ['vods'],
    queryFn: async () => {
      const response = await fetch('/api/vods', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      const data = await response.json();
      return data;
    }
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

  const completedVods = getTaskVods(task.id).filter(vod => vod.status === 'completed').length;
  const totalVods = getTaskVods(task.id).length;

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

      {/* Stats section */}
      <div className="space-y-2">
        <div className="text-sm font-medium flex items-center gap-2">
          <Download className="h-4 w-4" />
          Downloads
        </div>
        <div className="text-sm text-muted-foreground">
          {completedVods} / {totalVods} VODs completed
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

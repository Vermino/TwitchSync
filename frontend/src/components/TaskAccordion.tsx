// Filepath: frontend/src/components/TaskAccordion.tsx

import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HardDrive, Users, Gamepad2, Clock, Calendar, PlayCircle, Trash2, Settings2 } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Task, TaskProgress, TaskStorage } from '@/types/task';

interface TaskAccordionProps {
  task: Task;
  progress: TaskProgress;
  storage: TaskStorage;
  onEdit?: () => void;
  onDelete?: () => void;
  onRun?: () => void;
}

const formatSchedule = (type: string, value: string): string => {
  switch (type) {
    case 'interval':
      const seconds = parseInt(value);
      if (seconds < 60) return `Every ${seconds} seconds`;
      if (seconds < 3600) return `Every ${Math.floor(seconds / 60)} minutes`;
      return `Every ${Math.floor(seconds / 3600)} hours`;
    case 'cron':
      return 'Custom schedule';
    case 'manual':
      return 'Manual execution';
    default:
      return value;
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export const TaskAccordion: React.FC<TaskAccordionProps> = ({
  task,
  progress,
  storage,
  onEdit,
  onDelete,
  onRun
}) => {
  // Fetch channels and games data
  const { data: channels } = useQuery({
    queryKey: ['channels', task.channel_ids],
    queryFn: () => Promise.all(task.channel_ids.map(id => api.getChannels().then(channels => channels.find(c => c.id === id)))),
    enabled: task.channel_ids.length > 0
  });

  const { data: games } = useQuery({
    queryKey: ['games', task.game_ids],
    queryFn: () => Promise.all(task.game_ids.map(id => api.getGames().then(games => games.find(g => g.id === id)))),
    enabled: task.game_ids.length > 0
  });

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value={`task-${task.id}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex flex-1 items-center justify-between pr-4">
            <div className="space-y-1 text-left">
              <h4 className="text-sm font-medium leading-none">{task.name}</h4>
              <p className="text-sm text-muted-foreground">
                {task.description || formatSchedule(task.schedule_type, task.schedule_value)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {task.channel_ids.length}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Gamepad2 className="h-4 w-4" />
                {task.game_ids.length}
              </div>
              {progress.percentage > 0 && (
                <Progress value={progress.percentage} className="w-24 h-2" />
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 px-1">
            {/* Selected Channels */}
            {channels && channels.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Selected Channels</h4>
                <div className="grid grid-cols-2 gap-2">
                  {channels.map((channel) => channel && (
                    <div key={channel.id} className="flex items-center gap-2 p-2 rounded-lg border">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={channel.profile_image_url} alt={channel.display_name} />
                        <AvatarFallback>{channel.display_name?.[0] || channel.username[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{channel.display_name || channel.username}</p>
                        <p className="text-xs text-muted-foreground truncate">@{channel.username}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Games */}
            {games && games.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Selected Games</h4>
                <div className="grid grid-cols-3 gap-2">
                  {games.map((game) => game && (
                    <div key={game.id} className="flex items-center gap-2 p-2 rounded-lg border">
                      {game.box_art_url && (
                        <img
                          src={game.box_art_url.replace('{width}', '32').replace('{height}', '32')}
                          alt={game.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <p className="text-sm font-medium truncate flex-1">{game.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parameters Section */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Parameters</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {formatSchedule(task.schedule_type, task.schedule_value)}
                </div>
                {task.retention_days && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {task.retention_days} days retention
                  </div>
                )}
                {task.storage_limit_gb && (
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    {task.storage_limit_gb}GB limit
                  </div>
                )}
              </div>
            </div>

            {/* Progress Section */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Progress</h4>
              <div className="space-y-1">
                <Progress value={progress.percentage} className="h-2" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{progress.completed} / {progress.total} items processed</span>
                  <span>{progress.percentage}%</span>
                </div>
                {progress.current_item && (
                  <p className="text-sm text-muted-foreground">
                    Currently processing: {progress.current_item.name}
                  </p>
                )}
              </div>
            </div>

            {/* Storage Section */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Storage Usage</h4>
              <div className="space-y-1">
                <Progress
                  value={(storage.used / storage.limit) * 100}
                  className="h-2"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{formatBytes(storage.used)} used</span>
                  <span>{formatBytes(storage.remaining)} remaining</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between pt-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRun}
                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                >
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Run Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Edit Settings
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default TaskAccordion;

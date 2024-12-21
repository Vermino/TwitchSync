// Filepath: /frontend/src/pages/TaskManager.tsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Pause,
  Settings,
  Plus,
  Trash,
  Users,
  Gamepad2,
  Filter,
  Shield,
  Download,
  AlertCircle
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { api } from '@/lib/api';
import TaskModal from '@/components/TaskModal';
import { Task, Channel, Game } from '@/types/task';
import { useToast } from '@/components/ui/use-toast';

const STATUS_CYCLE = {
  'running': 'pending',
  'pending': 'inactive',
  'inactive': 'running'
} as const;

export default function TaskManager() {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = React.useState<number[]>([]);
  const [hoveredItem, setHoveredItem] = React.useState<{ type: 'channel' | 'game', id: number } | null>(null);
  const { toast } = useToast();

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks()
  });

  const { data: channelsData } = useQuery<Channel[]>({
    queryKey: ['channelsData'],
    queryFn: async () => {
      const response = await api.getChannels();
      return Array.isArray(response) ? response : [];
    }
  });

  const { data: gamesData } = useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: async () => {
      const response = await api.getGames();
      return Array.isArray(response) ? response : [];
    }
  });

  const { data: vods = [] } = useQuery({
    queryKey: ['vods'],
    queryFn: () => api.getVods()
  });

  const channels = channelsData || [];
  const games = gamesData || [];

  const handleStatusToggle = async (taskId: number, currentStatus: keyof typeof STATUS_CYCLE) => {
    try {
      await api.updateTask(taskId, { status: STATUS_CYCLE[currentStatus] });
      toast({
        title: "Success",
        description: `Task status updated to ${STATUS_CYCLE[currentStatus]}`,
      });
      await refetch();
    } catch (error) {
      console.error('Error updating task status:', error);
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
    }
  };

  const getTaskChannels = (channelIds: number[] = []) => {
    return channels.filter(channel => channelIds.includes(channel.id));
  };

  const getTaskGames = (gameIds: number[] = []) => {
    return games.filter(game => gameIds.includes(game.id));
  };

  const getTaskVods = (taskId: number) => {
    return vods.filter(vod => vod.task_id === taskId);
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      await api.deleteTask(taskId);
      toast({
        title: "Success",
        description: "Task deleted successfully",
      });
      await refetch();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    }
  };

  const renderHoverCard = (item: Channel | Game, type: 'channel' | 'game') => {
    if (type === 'channel') {
      const channel = item as Channel;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg w-64">
          <div className="flex items-center gap-3">
            <img
              src={channel.profile_image_url}
              alt={channel.display_name}
              className="w-16 h-16 rounded-full"
            />
            <div>
              <h3 className="font-medium">{channel.display_name}</h3>
              <p className="text-sm text-muted-foreground">{channel.description}</p>
            </div>
          </div>
        </div>
      );
    } else {
      const game = item as Game;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg w-64">
          <div className="flex gap-3">
            <img
              src={game.box_art_url}
              alt={game.name}
              className="w-20 h-24 rounded-lg object-cover"
            />
            <div>
              <h3 className="font-medium">{game.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {game.category || 'No category'}
              </p>
            </div>
          </div>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Task Manager</h1>
          <p className="text-muted-foreground">Manage your download tasks</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4 mr-2" />
          Create Task
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Tasks</CardTitle>
          <CardDescription>Monitor and manage your running tasks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tasks.map((task) => (
            <Accordion
              key={task.id}
              type="single"
              collapsible
              className="border rounded-lg"
            >
              <AccordionItem value="task-content" className="border-none">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{task.name}</span>
                          <Badge
                            variant={task.status === 'failed' ? 'destructive' : 'default'}
                            className="cursor-pointer hover:opacity-80"
                            onClick={() => handleStatusToggle(task.id, task.status)}
                          >
                            {task.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {task.description || 'No description'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {task.status === 'running' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusToggle(task.id, 'running')}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusToggle(task.id, 'inactive')}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedTask(task);
                            setIsModalOpen(true);
                          }}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Channels ({task.channel_ids?.length || 0})
                      </div>
                      <TooltipProvider>
                        <div className="flex relative">
                          {getTaskChannels(task.channel_ids || []).slice(0, 4).map((channel, index) => (
                            <Tooltip key={channel.id}>
                              <TooltipTrigger asChild>
                                <div
                                  className={`h-12 w-12 rounded-full border border-gray-300 overflow-hidden shadow-md transition-transform hover:scale-105 cursor-pointer absolute`}
                                  style={{ left: `${index * 20}px`, zIndex: index }}
                                  onMouseEnter={() => setHoveredItem({ type: 'channel', id: channel.id })}
                                  onMouseLeave={() => setHoveredItem(null)}
                                >
                                  <img
                                    src={channel.profile_image_url}
                                    alt={`${channel.display_name}'s profile`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {renderHoverCard(channel, 'channel')}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TooltipProvider>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Gamepad2 className="h-4 w-4" />
                        Games ({task.game_ids?.length || 0})
                      </div>
                      <TooltipProvider>
                        <div className="flex relative h-16">
                          {getTaskGames(task.game_ids || []).slice(0, 4).map((game, index) => (
                            <Tooltip key={game.id}>
                              <TooltipTrigger asChild>
                                <div
                                  className="absolute h-16 w-12 rounded-lg border border-gray-300 overflow-hidden shadow-md transition-transform hover:scale-105 cursor-pointer"
                                  style={{
                                    left: `${index * 20}px`,
                                    zIndex: index,
                                    transform: `rotate(${index * 2}deg)`
                                  }}
                                  onMouseEnter={() => setHoveredItem({ type: 'game', id: game.id })}
                                  onMouseLeave={() => setHoveredItem(null)}
                                >
                                  <img
                                    src={game.box_art_url}
                                    alt={game.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" sideOffset={5}>
                                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
                                  <div className="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                                    {getTaskGames(task.game_ids || []).map((tooltipGame) => (
                                      <div
                                        key={tooltipGame.id}
                                        className="flex flex-col gap-2 items-center"
                                      >
                                        <img
                                          src={tooltipGame.box_art_url}
                                          alt={tooltipGame.name}
                                          className="w-32 h-44 rounded-lg object-cover"
                                        />
                                        <span className="text-sm font-medium text-center">
                                          {tooltipGame.name}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {task.game_ids && task.game_ids.length > 4 && (
                            <div
                              className="absolute h-16 w-12 rounded-lg shadow-md overflow-hidden"
                              style={{
                                left: `${4 * 20}px`,
                                zIndex: 4,
                                transform: 'rotate(8deg)',
                                position: 'relative'
                              }}
                            >
                              <img
                                src="https://static-cdn.jtvnw.net/ttv-boxart/492741.jpg"
                                alt="More games"
                                className="w-full h-full object-cover"
                              />
                              <div
                                className="absolute inset-0 bg-black/30 flex items-center justify-center text-sm font-medium text-white"
                              >
                                +{task.game_ids.length - 4}
                              </div>
                            </div>
                          )}
                        </div>
                      </TooltipProvider>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        Downloads
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {task.total_vods || 0} VODs ({task.completed_vods || 0} completed)
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground flex justify-between">
                        <span>Progress</span>
                        <span>{task.progress?.percentage?.toFixed(1) || 0}%</span>
                      </div>
                      <Progress value={task.progress?.percentage || 0} className="h-2" />
                      <div className="text-xs text-muted-foreground">
                        Last run: {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
                      </div>
                    </div>
                  </div>

                  {task.conditions && Object.keys(task.conditions).length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Filter className="h-4 w-4" />
                      <span>{Object.keys(task.conditions).length} conditions applied</span>
                    </div>
                  )}

                  {task.restrictions && Object.keys(task.restrictions).length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Shield className="h-4 w-4" />
                      <span>{Object.keys(task.restrictions).length} restrictions applied</span>
                    </div>
                  )}
                </div>

                <AccordionTrigger className="px-4 py-2 hover:no-underline">
                  <span className="text-sm font-medium">View VODs</span>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {getTaskVods(task.id).map((vod) => (
                      <div
                        key={vod.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-16 rounded overflow-hidden">
                            <img
                              src={vod.thumbnail_url}
                              alt={vod.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <div className="font-medium">{vod.title}</div>
                            <div className="text-sm text-muted-foreground">
                              Duration: {vod.duration} • Created: {new Date(vod.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={vod.status === 'completed' ? 'default' : 'destructive'}>
                            {vod.status}
                          </Badge>
                          {vod.error_message && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{vod.error_message}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ))}
        </CardContent>
      </Card>

      {isModalOpen && (
        <TaskModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          onSubmit={async (data) => {
            try {
              if (selectedTask) {
                await api.updateTask(selectedTask.id, data);
                toast({
                  title: "Success",
                  description: "Task updated successfully",
                });
              } else {
                await api.createTask(data);
                toast({
                  title: "Success",
                  description: "Task created successfully",
                });
              }
              setIsModalOpen(false);
              setSelectedTask(null);
              refetch();
            } catch (error) {
              console.error('Error saving task:', error);
              toast({
                title: "Error",
                description: error.message || "Failed to save task",
                variant: "destructive",
              });
            }
          }}
          task={selectedTask}
          availableChannels={channels}
          availableGames={games}
        />
      )}
    </div>
  );
}

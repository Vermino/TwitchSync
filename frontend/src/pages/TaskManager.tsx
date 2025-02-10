// Filepath: frontend/src/pages/TaskManager.tsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useTaskMonitoring } from '@/hooks/useTaskMonitoring';
import type {
  Task,
  Channel,
  Game,
  TaskStatus,
  CreateTaskRequest,
  UpdateTaskRequest
} from '@/types/task';
import { useToast } from '@/components/ui/use-toast';

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  'running': 'pending',
  'pending': 'inactive',
  'inactive': 'running',
  'completed': 'pending',
  'failed': 'pending',
  'cancelled': 'pending'
} as const;

const renderTaskProgress = (task: Task) => (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground flex justify-between">
        <span>Progress</span>
        <span>{task.progress?.percentage?.toFixed(1) || 0}%</span>
      </div>
      <Progress value={task.progress?.percentage || 0} className="h-2" />
      <div className="text-sm text-muted-foreground">
        {task.progress?.status_message || 'No status message'}
        {task.progress?.current_progress && (
            <span className="ml-2">
          ({task.progress.current_progress.completed} / {task.progress.current_progress.total})
        </span>
        )}
      </div>
      {task.progress?.current_progress?.current_item && (
          <div className="text-sm text-muted-foreground">
            Processing: {task.progress.current_progress.current_item.name}
          </div>
      )}
      <div className="text-xs text-muted-foreground">
        Last run: {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
      </div>
    </div>
);

export default function TaskManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Tasks queries
  const { data: tasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      try {
        const result = await api.getTasks();
        return Array.isArray(result) ? result : [];
      } catch (error) {
        console.error('Error fetching tasks:', error);
        toast({
          title: "Error",
          description: "Failed to fetch tasks. Please try again.",
          variant: "destructive",
        });
        return [];
      }
    },
    refetchInterval: 5000,
    staleTime: 1000
  });

  // Channel and game queries
  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () => api.getChannels()
  });

  const { data: games = [] } = useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: () => api.getGames()
  });

  const { data: vods = [], isLoading: vodsLoading } = useQuery({
    queryKey: ['vods'],
    queryFn: () => api.getVods(),
    refetchInterval: 30000
  });

  // Task mutations
  const createTaskMutation = useMutation({
    mutationFn: (data: CreateTaskRequest) => api.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
      toast({
        title: "Success",
        description: "Task created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create task",
        variant: "destructive",
      });
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: UpdateTaskRequest }) =>
        api.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
      toast({
        title: "Success",
        description: "Task updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update task",
        variant: "destructive",
      });
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => api.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
      toast({
        title: "Success",
        description: "Task deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete task",
        variant: "destructive",
      });
    }
  });

  // Task operations
  const handleRunTask = async (taskId: number) => {
    try {
      await api.runTask(taskId);
      toast({
        title: "Success",
        description: "Task started successfully",
      });
      queryClient.invalidateQueries(['tasks']);
    } catch (error) {
      console.error('Error running task:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to run task",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      await deleteTaskMutation.mutateAsync(taskId);
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleStatusToggle = async (taskId: number, currentStatus: TaskStatus) => {
    try {
      const newStatus = STATUS_CYCLE[currentStatus];
      await updateTaskMutation.mutateAsync({
        id: taskId,
        data: { status: newStatus }
      });
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const handleTaskSubmit = async (data: CreateTaskRequest | UpdateTaskRequest) => {
    try {
      if (selectedTask) {
        await updateTaskMutation.mutateAsync({
          id: selectedTask.id,
          data: data as UpdateTaskRequest
        });
      } else {
        await createTaskMutation.mutateAsync(data as CreateTaskRequest);
      }
      setIsModalOpen(false);
      setSelectedTask(null);
      await refetchTasks();
    } catch (error) {
      console.error('Error saving task:', error);
      throw error;
    }
  };

  // Utility functions
  const getTaskVods = (taskId: number) => {
    return vods.filter(vod => vod.task_id === taskId);
  };

  const getTaskChannels = (channelIds: number[] = []) => {
    return channels.filter(channel => channelIds.includes(channel.id));
  };

  const getTaskGames = (gameIds: number[] = []) => {
    return games.filter(game => gameIds.includes(game.id));
  };

  const getCompletedVods = (taskId: number) => {
    return getTaskVods(taskId).filter(vod => vod.status === 'completed').length;
  };

  const getTotalVods = (taskId: number) => {
    return getTaskVods(taskId).length;
  };

  // Loading state
  if (tasksLoading) {
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
            {tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No tasks found. Create a task to get started.
                </div>
            ) : (
                tasks.map((task) => (
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
                                        onClick={() => handleRunTask(task.id)}
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
                            {/* Channels section */}
                            <div className="space-y-2">
                              <div className="text-sm font-medium flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Channels ({task.channel_ids?.length || 0})
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {getTaskChannels(task.channel_ids).map(channel => (
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
                                Games ({task.game_ids?.length || 0})
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {getTaskGames(task.game_ids).map(game => (
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
                                {getCompletedVods(task.id)} / {getTotalVods(task.id)} VODs completed
                        </div>
                      </div>

                      {/* Progress section */}
                      {renderTaskProgress(task)}
                    </div>

                    {/* Task conditions and restrictions */}
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
                  </div>

                  {/* VODs section */}
                  <AccordionTrigger className="px-4 py-2 hover:no-underline">
                    <span className="text-sm font-medium">View VODs</span>
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pb-4">
                    {vodsLoading ? (
                      <div className="p-4 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600 mx-auto"></div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {getTaskVods(task.id).length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            No VODs found for this task
                          </div>
                        ) : (
                          getTaskVods(task.id).map((vod) => (
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
                                    Duration: {vod.duration} • Created: {new Date(vod.created_at).toLocaleString()}
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
                          ))
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ))
          )}
        </CardContent>
      </Card>

      {/* Task Modal */}
      {isModalOpen && (
        <TaskModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          onSubmit={handleTaskSubmit}
          task={selectedTask}
          availableChannels={channels}
          availableGames={games}
        />
      )}
    </div>
  );
}

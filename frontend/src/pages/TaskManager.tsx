// Filepath: frontend/src/pages/TaskManager.tsx

import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Settings2, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import TaskModal from '@/components/TaskModal';
import TaskAccordion from '@/components/TaskAccordion';
import { api } from '@/lib/api';
import type { Task, TaskDetails, CreateTaskRequest } from '@/types/task';

const generateTaskName = (data: CreateTaskRequest, channels: any[], games: any[]): string => {
  const parts: string[] = [];

  // Add channels
  if (data.channel_ids?.length) {
    const channelNames = data.channel_ids
      .map(id => channels.find(c => c.id === id)?.display_name || 'Unknown Channel')
      .slice(0, 2);

    if (channelNames.length === 1) {
      parts.push(channelNames[0]);
    } else if (channelNames.length === 2) {
      parts.push(`${channelNames[0]} and ${channelNames[1]}`);
    } else {
      parts.push(`${channelNames[0]} and ${data.channel_ids.length - 1} others`);
    }
  }

  // Add games
  if (data.game_ids?.length) {
    const gameNames = data.game_ids
      .map(id => games.find(g => g.id === id)?.name || 'Unknown Game')
      .slice(0, 2);

    if (gameNames.length === 1) {
      parts.push(gameNames[0]);
    } else if (gameNames.length === 2) {
      parts.push(`${gameNames[0]} and ${gameNames[1]}`);
    } else {
      parts.push(`${gameNames[0]} and ${data.game_ids.length - 1} others`);
    }
  }

  // Add task type descriptor
  const taskType = parts.length > 1 ? 'Combined' : (data.channel_ids?.length ? 'Channel' : 'Game');

  return parts.length ? `${taskType} Task: ${parts.join(' - ')}` : 'New Task';
};

const generateTaskDescription = (data: CreateTaskRequest): string => {
  const parts: string[] = [];

  if (data.channel_ids?.length) {
    parts.push(`${data.channel_ids.length} channel${data.channel_ids.length > 1 ? 's' : ''}`);
  }

  if (data.game_ids?.length) {
    parts.push(`${data.game_ids.length} game${data.game_ids.length > 1 ? 's' : ''}`);
  }

  const schedule = data.schedule_type === 'interval'
    ? `Every ${parseInt(data.schedule_value) / 3600} hours`
    : data.schedule_type === 'cron'
      ? 'Custom schedule'
      : 'Manual execution';

  return `Monitoring ${parts.join(' and ')} - ${schedule}`;
};

const TaskManager = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all required data
  const { data: tasks, isLoading, error, refetch } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks(),
  });

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
  });

  const { data: games } = useQuery({
    queryKey: ['games'],
    queryFn: () => api.getGames(),
  });

  const { data: taskDetails } = useQuery({
    queryKey: ['taskDetails', tasks?.map(t => t.id)],
    queryFn: async () => {
      if (!tasks) return {};
      const details: Record<number, TaskDetails> = {};
      await Promise.all(
        tasks.map(async (task) => {
          try {
            details[task.id] = await api.getTaskDetails(task.id);
          } catch (error) {
            console.error(`Error fetching details for task ${task.id}:`, error);
          }
        })
      );
      return details;
    },
    enabled: !!tasks,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Mutations
  const createTaskMutation = useMutation({
    mutationFn: (data: CreateTaskRequest) => {
      // Auto-generate name and description if not provided
      if (!data.name) {
        data.name = generateTaskName(data, channels || [], games || []);
      }
      if (!data.description) {
        data.description = generateTaskDescription(data);
      }
      return api.createTask(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsModalOpen(false);
      toast({
        title: "Success",
        description: "Task created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: (data: { id: number; data: any }) =>
      api.updateTask(data.id, data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSelectedTask(null);
      setIsModalOpen(false);
      toast({
        title: "Success",
        description: "Task updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => api.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({
        title: "Success",
        description: "Task deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  // Implement Run Now mutation
  const runTaskMutation = useMutation({
    mutationFn: (id: number) => api.runTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskDetails'] });
      toast({
        title: "Success",
        description: "Task started successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start task",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleCreateTask = async (data: CreateTaskRequest) => {
    createTaskMutation.mutate(data);
  };

  const handleUpdateTask = async (id: number, data: any) => {
    updateTaskMutation.mutate({ id, data });
  };

  const handleDeleteTask = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      deleteTaskMutation.mutate(id);
    }
  };

  const handleRunTask = async (id: number) => {
    runTaskMutation.mutate(id);
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          Error loading tasks. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Task Manager</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setSelectedTask(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Task
          </Button>
        </div>
      </div>

      {/* Task List */}
      <div className="grid gap-4">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="p-4">
              <div className="animate-pulse flex space-x-4">
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            </Card>
          ))
        ) : tasks?.length === 0 ? (
          // Empty state
          <Card className="p-8 text-center">
            <Settings2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No tasks created yet
            </h3>
            <p className="text-gray-500 mb-4">
              Create your first task to start monitoring channels and games.
            </p>
            <Button
              onClick={() => {
                setSelectedTask(null);
                setIsModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Task
            </Button>
          </Card>
        ) : (
          // Task list
          tasks?.map((task) => (
            <Card key={task.id} className="p-4">
              <TaskAccordion
                task={task}
                progress={taskDetails?.[task.id]?.progress || {
                  percentage: 0,
                  completed: 0,
                  total: 0
                }}
                storage={taskDetails?.[task.id]?.storage || {
                  used: 0,
                  limit: 0,
                  remaining: 0
                }}
                onEdit={() => handleEditTask(task)}
                onDelete={() => handleDeleteTask(task.id)}
                onRun={() => handleRunTask(task.id)}
              />
            </Card>
          ))
        )}
      </div>

      {/* Task Modal */}
      <TaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
        }}
        onSubmit={(data) => {
          if (selectedTask) {
            handleUpdateTask(selectedTask.id, data);
          } else {
            handleCreateTask(data);
          }
        }}
        task={selectedTask}
      />
    </div>
  );
};

export default TaskManager;

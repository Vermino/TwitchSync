// Filepath: frontend/src/pages/TaskManager.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus } from 'lucide-react';
import TaskModal from '@/components/TaskModal';
import TaskList from '@/components/TaskManager/TaskList';
import TaskSummary from '@/components/TaskManager/TaskSummary';
import type { Task, Channel, Game, TaskStatus } from '@/types/task';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { QueueClient } from '@/lib/api/queueClient';

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  'running': 'pending',
  'pending': 'running',
  'active': 'running',
  'paused': 'running',
  'completed': 'pending',
  'failed': 'pending',
  'cancelled': 'pending',
  'inactive': 'running',
  'scanning': 'pending', // Cannot interrupt scanning
  'ready': 'pending',    // Ready tasks can be deactivated
  'downloading': 'paused' // Downloading tasks can be paused
} as const;

const queueClient = new QueueClient();

export default function TaskManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
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

  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => {
      return await api.getChannels();
    }
  });

  const { data: games = [], isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: async () => {
      return await api.getGames();
    }
  });

  const { isLoading: vodsLoading } = useQuery({
    queryKey: ['vods'],
    queryFn: async () => {
      return await api.getVods();
    },
    refetchInterval: 5000 // Updated to refresh every 5 seconds for real-time updates
  });


  // Task scheduler status
  const { data: schedulerStatus, isLoading: schedulerLoading } = useQuery({
    queryKey: ['taskSchedulerStatus'],
    queryFn: async () => {
      try {
        return await api.getTaskSchedulerStatus();
      } catch (error) {
        console.error('Error fetching scheduler status:', error);
        return { enabled: false, intervalMs: 60000 };
      }
    },
    refetchInterval: 10000, // Check every 10 seconds
  });

  // Mutations
  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      return await api.createTask(data);
    },
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
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await api.updateTask(id, data);
    },
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
    mutationFn: async (id: number) => {
      return await api.deleteTask(id);
    },
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

  const toggleSchedulerMutation = useMutation({
    mutationFn: async () => {
      return await api.toggleTaskScheduler();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['taskSchedulerStatus']);
      toast({
        title: "Success",
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to toggle task scheduler",
        variant: "destructive",
      });
    }
  });

  // Event handlers
  const handleTaskSubmit = async (data: any) => {
    try {
      if (selectedTask) {
        await updateTaskMutation.mutateAsync({
          id: selectedTask.id,
          data
        });
      } else {
        await createTaskMutation.mutateAsync(data);
      }
      setIsModalOpen(false);
      setSelectedTask(null);
      await refetchTasks();
    } catch (error) {
      console.error('Error saving task:', error);
      throw error;
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }
    await deleteTaskMutation.mutateAsync(taskId);
  };

  const handleStatusToggle = async (taskId: number, currentStatus: TaskStatus) => {
    try {
      // Determine the next status based on current status
      const nextStatus = STATUS_CYCLE[currentStatus];

      // Use updateTask for all status changes
      await updateTaskMutation.mutateAsync({
        id: taskId,
        data: {
          status: nextStatus,
          is_active: nextStatus === 'running'
        }
      });

      // Refetch tasks to update the UI
      await refetchTasks();
    } catch (error) {
      console.error('Error updating task status:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update task status",
        variant: "destructive",
      });
    }
  };



  const handleToggleScheduler = async () => {
    try {
      const currentlyEnabled = schedulerStatus?.enabled || false;
      
      if (currentlyEnabled) {
        // Disabling: First pause all downloads, then disable scheduler
        toast({
          title: "Stopping downloads...",
          description: "Pausing all active downloads and disabling task scheduler",
        });
        
        await queueClient.pauseDownloadManager();
        await toggleSchedulerMutation.mutateAsync();
        
        toast({
          title: "Task Manager Disabled",
          description: "All downloads paused and automatic task execution disabled",
        });
      } else {
        // Enabling: First enable scheduler, then resume downloads  
        toast({
          title: "Starting Task Manager...",
          description: "Enabling task scheduler and resuming downloads",
        });
        
        await toggleSchedulerMutation.mutateAsync();
        await queueClient.resumeDownloadManager();
        
        toast({
          title: "Task Manager Enabled", 
          description: "Task scheduler enabled and downloads resumed",
        });
      }
      
      // Refresh data to show updated states
      await Promise.all([
        refetchTasks(),
        queryClient.invalidateQueries(['vods']),
        queryClient.invalidateQueries(['taskSchedulerStatus'])
      ]);
      
    } catch (error) {
      console.error('Error toggling scheduler:', error);
      toast({
        title: "Error",
        description: "Failed to toggle task manager. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (tasksLoading || channelsLoading || gamesLoading || schedulerLoading) {
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
          <Plus className="w-4 h-4 mr-2"/>
          Create Task
        </Button>
      </div>

      {/* Task Manager Toggle */}
      <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium">Task Manager</div>
          <Switch
            checked={schedulerStatus?.enabled || false}
            onCheckedChange={handleToggleScheduler}
            disabled={toggleSchedulerMutation.isPending}
          />
          <div className="text-xs text-muted-foreground">
            {schedulerStatus?.enabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {schedulerStatus?.enabled 
            ? 'Tasks will automatically scan for new VODs based on their schedules'
            : 'Automatic task execution is disabled. Tasks must be run manually.'
          }
        </div>
      </div>

      {/* Task Summary */}
      <TaskSummary 
        tasks={tasks} 
        schedulerEnabled={schedulerStatus?.enabled || false}
      />


      <TaskList
        tasks={tasks}
        channels={channels}
        games={games}
        channelsLoading={channelsLoading}
        gamesLoading={gamesLoading}
        vodsLoading={vodsLoading}
        onTaskUpdate={handleStatusToggle}
        onTaskDelete={handleDeleteTask}
        onTaskEdit={(task) => {
          setSelectedTask(task);
          setIsModalOpen(true);
        }}
        onRefreshTasks={refetchTasks}
      />

      {isModalOpen && (
        <TaskModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          onSubmit={handleTaskSubmit}
          task={selectedTask}
        />
      )}
    </div>
  );
}

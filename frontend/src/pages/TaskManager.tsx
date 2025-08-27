// Filepath: frontend/src/pages/TaskManager.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';
import TaskModal from '@/components/TaskModal';
import TaskList from '@/components/TaskManager/TaskList';
import BulkActions from '@/components/TaskManager/BulkActions';
import type { Task, Channel, Game, TaskStatus } from '@/types/task';
import type { QueueStats } from '@/types/queue';
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
  'inactive': 'running'
} as const;

const queueClient = new QueueClient();

export default function TaskManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedQueueItems, setSelectedQueueItems] = useState<string[]>([]);
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

  // Queue stats for bulk actions
  const { data: queueStats, isLoading: queueStatsLoading } = useQuery<QueueStats>({
    queryKey: ['queueStats'],
    queryFn: async () => {
      try {
        return await queueClient.getQueueStats();
      } catch (error) {
        console.error('Error fetching queue stats:', error);
        // Return default stats if API isn't available yet
        return {
          total_items: 0,
          pending: 0,
          downloading: 0,
          completed: 0,
          failed: 0,
          paused: 0,
        };
      }
    },
    refetchInterval: 5000,
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

  // Bulk Action Handlers
  const handleBulkAction = async (action: () => Promise<void>, actionName: string) => {
    try {
      await action();
      await Promise.all([
        refetchTasks(),
        queryClient.invalidateQueries(['queueStats']),
        queryClient.invalidateQueries(['vods']),
        queryClient.invalidateQueries(['downloadHistory'])
      ]);
      toast({
        title: "Success",
        description: `${actionName} completed successfully`,
      });
    } catch (error) {
      console.error(`Error ${actionName}:`, error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${actionName}`,
        variant: "destructive",
      });
    }
  };

  const handlePauseAll = () => handleBulkAction(() => queueClient.pauseAll(), 'pause all downloads');
  const handleResumeAll = () => handleBulkAction(() => queueClient.resumeAll(), 'resume all downloads');
  const handleClearCompleted = () => handleBulkAction(() => queueClient.clearCompleted(), 'clear completed downloads');
  const handleCancelAll = () => handleBulkAction(() => queueClient.executeBulkAction({ type: 'cancel_all', target: 'all' }), 'cancel all downloads');
  
  const handleSetPriority = (priority: 'high' | 'normal' | 'low') => 
    handleBulkAction(() => queueClient.executeBulkAction({ 
      type: 'set_priority', 
      target: 'selected', 
      priority,
      item_ids: selectedQueueItems 
    }), `set priority to ${priority}`);

  const handleRefreshAll = async () => {
    await Promise.all([
      refetchTasks(),
      queryClient.invalidateQueries(['queueStats']),
      queryClient.invalidateQueries(['vods']),
      queryClient.invalidateQueries(['downloadHistory'])
    ]);
  };

  if (tasksLoading || channelsLoading || gamesLoading) {
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

      {/* Bulk Actions for Queue Management */}
      {queueStats && !queueStatsLoading && (
        <BulkActions
          stats={queueStats}
          selectedItems={selectedQueueItems}
          onPauseAll={handlePauseAll}
          onResumeAll={handleResumeAll}
          onClearCompleted={handleClearCompleted}
          onCancelAll={handleCancelAll}
          onSetPriority={handleSetPriority}
          onRefresh={handleRefreshAll}
          isLoading={tasksLoading}
        />
      )}

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

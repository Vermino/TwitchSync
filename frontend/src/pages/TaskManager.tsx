// Filepath: frontend/src/pages/TaskManager.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';
import TaskModal from '@/components/TaskModal';
import TaskList from '@/components/TaskManager/TaskList';
import type { Task, Channel, Game, TaskStatus } from '@/types/task';
import { useToast } from '@/components/ui/use-toast';

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
        const response = await fetch('/api/tasks', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch tasks');
        }

        const result = await response.json();
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

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => {
      const response = await fetch('/api/channels', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      const data = await response.json();
      return data;
    }
  });

  const { data: games = [] } = useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: async () => {
      const response = await fetch('/api/games', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      const data = await response.json();
      return data;
    }
  });

  const { isLoading: vodsLoading } = useQuery({
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
    },
    refetchInterval: 30000
  });

  // Mutations
  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        throw new Error('Failed to create task');
      }
      return response.json();
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
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        throw new Error('Failed to update task');
      }
      return response.json();
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
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to delete task');
      }
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

      if (currentStatus === 'running') {
        // If task is running, pause it
        const response = await fetch(`/api/tasks/${taskId}/status/pause`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to pause task');
        }
      } else if (nextStatus === 'running') {
        // If next status is running, activate the task
        const response = await fetch(`/api/tasks/${taskId}/activate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to activate task');
        }

        // After activation, queue VODs
        await fetch(`/api/tasks/${taskId}/queue-vods`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });
      } else {
        // For other status changes, use the update endpoint
        await updateTaskMutation.mutateAsync({
          id: taskId,
          data: {
            status: nextStatus,
            is_active: nextStatus === 'running'
          }
        });
      }

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
          <Plus className="w-4 h-4 mr-2"/>
          Create Task
        </Button>
      </div>

      <TaskList
        tasks={tasks}
        channels={channels}
        games={games}
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

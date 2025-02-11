// Filepath: frontend/src/pages/TaskManager.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import TaskModal from '@/components/TaskModal';
import TaskList from '@/components/TaskManager/TaskList';
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

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () => api.getChannels()
  });

  const { data: games = [] } = useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: () => api.getGames()
  });

  const { isLoading: vodsLoading } = useQuery({
    queryKey: ['vods'],
    queryFn: () => api.getVods(),
    refetchInterval: 30000
  });

  // Mutations
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

  // Event handlers
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

  const handleDeleteTask = async (taskId: number) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }
    await deleteTaskMutation.mutateAsync(taskId);
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

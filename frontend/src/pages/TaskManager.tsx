// Filepath: frontend/src/pages/TaskManager.tsx

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useWebSocket } from '@/hooks/useWebSocket';
import { Plus } from 'lucide-react';
import TaskModal from '@/components/TaskModal';
import TaskList from '@/components/TaskManager/TaskList';
import TaskSummary from '@/components/TaskManager/TaskSummary';
import type { Task, Channel, Game, TaskStatus } from '@/types/task';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { QueueClient } from '@/lib/api/queueClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from 'lucide-react';

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
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean, taskId: number | null, info: any | null, loading: boolean }>({
    isOpen: false,
    taskId: null,
    info: null,
    loading: false
  });
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

  const { joinTask } = useWebSocket({
    onDownloadProgress: (data) => {
      queryClient.setQueryData(['vods'], (oldVods: any) => {
        if (!oldVods) return oldVods;
        let found = false;
        const newVods = oldVods.map((vod: any) => {
          if (vod.id === data.vodId) {
            found = true;
            return {
              ...vod,
              status: data.status,
              download_progress: data.progress,
              current_segment: data.currentSegment,
              total_segments: data.totalSegments,
              download_speed: data.speed,
              eta: data.eta
            };
          }
          return vod;
        });
        return found ? newVods : oldVods;
      });
    },
    onDownloadStatusChange: (data) => {
      queryClient.setQueryData(['vods'], (oldVods: any) => {
        if (!oldVods) return oldVods;
        let found = false;
        const newVods = oldVods.map((vod: any) => {
          if (vod.id === data.vodId) {
            found = true;
            return { ...vod, status: data.status, download_progress: data.progress };
          }
          return vod;
        });
        return found ? newVods : oldVods;
      });
    }
  });

  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    tasks.forEach((task: Task) => {
      if (['running', 'downloading', 'scanning', 'active'].includes(task.status)) {
        joinTask(task.id);
      }
    });
  }, [tasks, joinTask]);


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
    setDeleteDialog({ isOpen: true, taskId, info: null, loading: true });
    try {
      const info = await api.getDeleteTaskInfo(taskId);
      setDeleteDialog(prev => ({ ...prev, info, loading: false }));
    } catch (error) {
      setDeleteDialog(prev => ({ ...prev, loading: false }));
      toast({
        title: "Error",
        description: "Failed to fetch deletion information.",
        variant: "destructive",
      });
    }
  };

  const confirmDeleteTask = async () => {
    if (!deleteDialog.taskId) return;
    try {
      await deleteTaskMutation.mutateAsync(deleteDialog.taskId);
    } finally {
      setDeleteDialog({ isOpen: false, taskId: null, info: null, loading: false });
    }
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
          <Plus className="w-4 h-4 mr-2" />
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

      <AlertDialog open={deleteDialog.isOpen} onOpenChange={(isOpen) => !isOpen && setDeleteDialog(prev => ({ ...prev, isOpen: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-4 text-sm text-muted-foreground">
                <p>
                  This will permanently delete the task <strong>{deleteDialog.info?.task_name || 'selected task'}</strong>.
                </p>
                {deleteDialog.loading ? (
                  <div className="flex items-center gap-2 text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Calculating data to be removed...</span>
                  </div>
                ) : deleteDialog.info && (
                  <div className="rounded-md bg-red-50 p-4 border border-red-200">
                    <p className="text-red-800 font-medium mb-2">The following data will be permanently deleted from your disk:</p>
                    <ul className="list-disc list-inside text-red-700 space-y-1">
                      <li><strong>{deleteDialog.info.files_to_delete}</strong> downloaded VOD files</li>
                      <li><strong>~{Math.round(deleteDialog.info.freed_bytes / (1024 * 1024))} MB</strong> of disk space freed</li>
                      {deleteDialog.info.queued_vods > 0 && (
                        <li><strong>{deleteDialog.info.queued_vods}</strong> VODs in queue will be cancelled</li>
                      )}
                    </ul>
                  </div>
                )}
                <p className="text-red-600 font-medium">
                  This action cannot be undone. All downloaded video files will be permanently erased.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTaskMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteTask();
              }}
              disabled={deleteDialog.loading || deleteTaskMutation.isPending}
              className="bg-red-600 focus:ring-red-600 hover:bg-red-700 text-white"
            >
              {deleteTaskMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : 'Yes, delete task and files'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

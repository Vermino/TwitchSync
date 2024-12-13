// frontend/src/pages/TaskManager.tsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusCircle,
  Trash2,
  PlayCircle,
  PauseCircle,
  Clock,
  Calendar,
  Settings,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import TaskModal from '../components/TaskModal';
import { api } from '@/lib/api';

interface Task {
  id: number;
  name: string;
  description: string | null;
  task_type: 'channel' | 'game' | 'combined';
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  is_active: boolean;
  priority: number;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
  </div>
);

const ErrorDisplay: React.FC<{ error: Error }> = ({ error }) => (
  <div className="p-4">
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
      {error.message}
    </div>
  </div>
);

const formatDateTime = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString();
};

const formatSchedule = (type: string, value: string) => {
  if (type === 'interval') {
    const seconds = parseInt(value);
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  }
  if (type === 'cron') return `Cron: ${value}`;
  return 'Manual';
};

const TaskManager = () => {
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const queryClient = useQueryClient();

  // Fetch tasks
  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks()
  });

  // Task mutations
  const createTaskMutation = useMutation({
    mutationFn: (taskData: any) => api.createTask(taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsTaskModalOpen(false);
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsTaskModalOpen(false);
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: number) => api.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });

  const runTaskMutation = useMutation({
    mutationFn: (id: number) => api.runTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });

  const handleCreateTask = () => {
    setSelectedTask(null);
    setIsTaskModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleToggleTask = (task: Task) => {
    updateTaskMutation.mutate({
      id: task.id,
      data: { is_active: !task.is_active }
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error as Error} />;

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Task Manager</h1>
        <button
          onClick={handleCreateTask}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          <PlusCircle className="w-5 h-5" />
          Create Task
        </button>
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Run</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Run</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tasks && tasks.length > 0 ? (
              tasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div
                      className="flex flex-col cursor-pointer"
                      onClick={() => handleEditTask(task)}
                    >
                      <span className="text-sm font-medium text-gray-900">{task.name}</span>
                      {task.description && (
                        <span className="text-xs text-gray-500 mt-1 line-clamp-1">
                          {task.description}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {task.task_type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center text-sm text-gray-500">
                      {task.schedule_type === 'interval' && <Clock className="w-4 h-4 mr-1" />}
                      {task.schedule_type === 'cron' && <Calendar className="w-4 h-4 mr-1" />}
                      {task.schedule_type === 'manual' && <Settings className="w-4 h-4 mr-1" />}
                      {formatSchedule(task.schedule_type, task.schedule_value)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleTask(task)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        task.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {task.is_active ? (
                        <CheckCircle className="w-4 h-4 mr-1" />
                      ) : (
                        <XCircle className="w-4 h-4 mr-1" />
                      )}
                      {task.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDateTime(task.last_run)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDateTime(task.next_run)}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => runTaskMutation.mutate(task.id)}
                      className="text-gray-600 hover:text-gray-900"
                      title="Run task now"
                    >
                      <PlayCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteTaskMutation.mutate(task.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Delete task"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No tasks created yet. Click "Create Task" to get started!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={(data) => {
          if (selectedTask) {
            updateTaskMutation.mutate({ id: selectedTask.id, data });
          } else {
            createTaskMutation.mutate(data);
          }
        }}
        task={selectedTask}
      />
    </div>
  );
};

// Wrap with error boundary
export default function TaskManagerWrapper() {
  return (
    <ErrorBoundary FallbackComponent={ErrorDisplay}>
      <TaskManager />
    </ErrorBoundary>
  );
}

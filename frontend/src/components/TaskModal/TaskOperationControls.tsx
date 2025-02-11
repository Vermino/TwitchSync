import React, { useState } from 'react';
import { Play, Pause, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import type { Task } from '@/types/task';

interface TaskOperationControlsProps {
  task: Task;
  onRefresh: () => Promise<void>;
}

const TaskOperationControls: React.FC<TaskOperationControlsProps> = ({
  task,
  onRefresh
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleRunTask = async () => {
    try {
      setIsLoading(true);
      await api.runTask(task.id);

      toast({
        title: "Task Started",
        description: "Task is now running and will begin processing VODs",
      });

      // Refresh task data
      await onRefresh();
    } catch (error) {
      console.error('Error running task:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start task",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePauseTask = async () => {
    try {
      setIsLoading(true);
      await api.updateTask(task.id, { status: 'pending' });

      toast({
        title: "Task Paused",
        description: "Task has been paused",
      });

      await onRefresh();
    } catch (error) {
      console.error('Error pausing task:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to pause task",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {task.status === 'running' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handlePauseTask}
          disabled={isLoading}
        >
          <Pause className="h-4 w-4 mr-2" />
          Pause
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunTask}
          disabled={isLoading}
        >
          <Play className="h-4 w-4 mr-2" />
          Run
        </Button>
      )}
    </div>
  );
};

export default TaskOperationControls;

// Filepath: frontend/src/components/TaskManager/TaskProgress.tsx

import { Task } from '@/types/task';
import { Progress } from '@/components/ui/progress';

interface TaskProgressProps {
  task: Task;
}

export default function TaskProgress({ task }: TaskProgressProps) {
  return (
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
}

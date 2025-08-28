import { Task } from '@/types/task';
import { Badge } from '@/components/ui/badge';
import { ScanningBadge } from './ScanningIndicator';

interface TaskSummaryProps {
  tasks: Task[];
}

export default function TaskSummary({ tasks }: TaskSummaryProps) {
  const taskStats = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalTasks = tasks.length;
  const activeTasks = (taskStats.running || 0) + (taskStats.scanning || 0) + (taskStats.downloading || 0);

  if (totalTasks === 0) {
    return (
      <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border">
        <div className="text-xs text-muted-foreground font-medium">Task Summary</div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">No tasks created yet</Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border">
      <div className="text-xs text-muted-foreground font-medium">Task Summary</div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{totalTasks} Total Task{totalTasks !== 1 ? 's' : ''}</Badge>
        
        {activeTasks > 0 && (
          <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
            {activeTasks} Active
          </Badge>
        )}
        
        {taskStats.scanning > 0 && (
          <ScanningBadge />
        )}
        
        {taskStats.downloading > 0 && (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            {taskStats.downloading} Downloading
          </Badge>
        )}
        
        {taskStats.ready > 0 && (
          <Badge variant="default" className="bg-blue-100 text-blue-800 border-blue-300">
            {taskStats.ready} Ready
          </Badge>
        )}
        
        {taskStats.paused > 0 && (
          <Badge variant="secondary">{taskStats.paused} Paused</Badge>
        )}
        
        {taskStats.failed > 0 && (
          <Badge variant="destructive">{taskStats.failed} Failed</Badge>
        )}
        
        {taskStats.completed > 0 && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            {taskStats.completed} Completed
          </Badge>
        )}
      </div>
    </div>
  );
}
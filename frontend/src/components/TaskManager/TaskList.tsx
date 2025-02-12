// Filepath: frontend/src/components/TaskManager/TaskList.tsx

import { Task, Channel, Game } from '@/types/task';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import TaskCard from './TaskCard';

interface TaskListProps {
  tasks: Task[];
  channels: Channel[];
  games: Game[];
  vodsLoading: boolean;
  onTaskUpdate: (taskId: number, status: string) => Promise<void>;
  onTaskDelete: (taskId: number) => Promise<void>;
  onTaskEdit: (task: Task) => void;
  onRefreshTasks: () => Promise<void>;
}

export default function TaskList({
  tasks = [],
  channels = [],
  games = [],
  vodsLoading,
  onTaskUpdate,
  onTaskDelete,
  onTaskEdit,
  onRefreshTasks
}: TaskListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Tasks</CardTitle>
        <CardDescription>Monitor and manage your running tasks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No tasks found. Create a task to get started.
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              channels={channels}
              games={games}
              vodsLoading={vodsLoading}
              onStatusChange={(status) => onTaskUpdate(task.id, status)}
              onDelete={() => onTaskDelete(task.id)}
              onEdit={() => onTaskEdit(task)}
              onRefresh={onRefreshTasks}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

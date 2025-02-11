// Filepath: frontend/src/components/TaskManager/TaskCard.tsx

import { Task, Channel, Game } from '@/types/task';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, Trash } from 'lucide-react';
import TaskOperationControls from '@/components/TaskModal/TaskOperationControls';
import TaskStats from './TaskStats';
import TaskProgress from './TaskProgress';
import VodList from './VodList';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface TaskCardProps {
  task: Task;
  channels: Channel[];
  games: Game[];
  vodsLoading: boolean;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  onRefresh: () => Promise<void>;
}

export default function TaskCard({
  task,
  channels,
  games,
  vodsLoading,
  onStatusChange,
  onDelete,
  onEdit,
  onRefresh
}: TaskCardProps) {
  return (
    <Accordion type="single" collapsible className="border rounded-lg">
      <AccordionItem value="task-content" className="border-none">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{task.name}</span>
                  <Badge
                    variant={task.status === 'failed' ? 'destructive' : 'default'}
                    className="cursor-pointer hover:opacity-80"
                    onClick={() => onStatusChange(task.status)}
                  >
                    {task.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {task.description || 'No description'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <TaskOperationControls task={task} onRefresh={onRefresh} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDelete}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <TaskStats task={task} channels={channels} games={games} />
            <TaskProgress task={task} />
          </div>
        </div>

        <AccordionTrigger className="px-4 py-2 hover:no-underline">
          <span className="text-sm font-medium">View VODs</span>
        </AccordionTrigger>

        <AccordionContent className="px-4 pb-4">
          <VodList taskId={task.id} loading={vodsLoading} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

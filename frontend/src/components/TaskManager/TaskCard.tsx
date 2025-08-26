import { Task, Channel, Game } from '@/types/task';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, Trash, Power } from 'lucide-react';
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
  channels: Channel[] | undefined;
  games: Game[] | undefined;
  channelsLoading: boolean;
  gamesLoading: boolean;
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
  channelsLoading,
  gamesLoading,
  vodsLoading,
  onStatusChange,
  onDelete,
  onEdit
}: TaskCardProps) {
  // Use the actual progress percentage from backend (which tracks segment download progress)
  // Don't override it with VOD completion percentage
  
  // Determine if task is active
  const isActive = task.status === 'running';

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
                    variant={
                      task.status === 'failed' ? 'destructive' :
                      task.status === 'running' ? 'default' :
                      'secondary'
                    }
                  >
                    {task.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {task.description || 'No description'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => onStatusChange(task.status)}
                >
                  <Power className={`h-4 w-4 ${isActive ? 'text-green-500' : ''}`} />
                  <span className="ml-2">{isActive ? 'Active' : 'Activate'}</span>
                </Button>
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
            <TaskStats 
              task={task} 
              channels={channels} 
              games={games}
              channelsLoading={channelsLoading}
              gamesLoading={gamesLoading}
            />
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

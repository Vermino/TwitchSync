import { useState } from 'react';
import { Task, Channel, Game } from '@/types/task';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings, 
  Trash, 
  Power, 
  Play, 
  Pause, 
  RotateCcw,
  Download,
  History
} from 'lucide-react';
import TaskStats from './TaskStats';
import TaskProgress from './TaskProgress';
import VodList from './VodList';
import DownloadHistory from './DownloadHistory';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

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
  onEdit,
  onRefresh
}: TaskCardProps) {
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  // Determine if task is active or paused
  const isActive = task.status === 'running';
  const isPaused = task.status === 'paused';
  const canResume = isPaused || task.status === 'failed';

  const handleTaskAction = async (action: string, apiCall: () => Promise<any>) => {
    setIsActionLoading(action);
    try {
      await apiCall();
      await onRefresh();
      toast({
        title: "Success",
        description: `Task ${action} completed successfully`,
      });
    } catch (error) {
      console.error(`Error ${action} task:`, error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${action} task`,
        variant: "destructive",
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  const handlePause = () => {
    handleTaskAction('pause', () => api.pauseTask(task.id));
  };

  const handleResume = () => {
    handleTaskAction('resume', () => api.resumeTask(task.id));
  };

  const handleActivate = () => {
    handleTaskAction('activate', () => api.activateTask(task.id));
  };

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
                      task.status === 'paused' ? 'secondary' :
                      task.status === 'completed' ? 'default' :
                      'outline'
                    }
                  >
                    {task.status}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {task.description || 'No description'}
                </div>
              </div>

              {/* Enhanced Task Controls */}
              <div className="flex items-center gap-2">
                {/* Resume Button for Paused Tasks */}
                {canResume && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleResume}
                          disabled={isActionLoading === 'resume'}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Play className="h-4 w-4" />
                          <span className="ml-1">Resume</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Resume {isPaused ? 'paused' : 'failed'} task</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Pause Button for Active Tasks */}
                {isActive && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePause}
                          disabled={isActionLoading === 'pause'}
                        >
                          <Pause className="h-4 w-4" />
                          <span className="ml-1">Pause</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Pause active task</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Activate Button for Inactive Tasks */}
                {!isActive && !isPaused && task.status !== 'completed' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleActivate}
                          disabled={isActionLoading === 'activate'}
                        >
                          <Power className="h-4 w-4" />
                          <span className="ml-1">Activate</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Activate task to start processing</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Settings Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onEdit}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit task settings</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Delete Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onDelete}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete task</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
          <span className="text-sm font-medium">View Downloads & History</span>
        </AccordionTrigger>

        <AccordionContent className="px-4 pb-4">
          <Tabs defaultValue="vods" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="vods" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                View VODs
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Download History
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="vods" className="mt-4">
              <VodList taskId={task.id} loading={vodsLoading} />
            </TabsContent>
            
            <TabsContent value="history" className="mt-4">
              <DownloadHistory taskId={task.id} />
            </TabsContent>
          </Tabs>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

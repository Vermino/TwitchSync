import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Pause,
  Settings,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash,
  Users,
  Gamepad2,
  Filter,
  Shield,
  Download
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from '@/lib/api';
import TaskModal from '@/components/TaskModal';

const STATUS_CYCLE = {
  'running': 'pending',
  'pending': 'inactive',
  'inactive': 'running'
};

export default function TaskManager() {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedTask, setSelectedTask] = React.useState(null);
  const [expandedTasks, setExpandedTasks] = React.useState<number[]>([]);

  const { data: tasks, isLoading, refetch } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks()
  });

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels()
  });

  const { data: games } = useQuery({
    queryKey: ['games'],
    queryFn: () => api.getGames()
  });

  const handleStatusToggle = async (taskId: number, currentStatus: string) => {
    try {
      await api.updateTask(taskId, { status: STATUS_CYCLE[currentStatus] });
      refetch();
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const getTaskChannels = (channelIds: number[]) => {
    return channels?.filter(channel => channelIds.includes(channel.id)) || [];
  };

  const getTaskGames = (gameIds: number[]) => {
    return games?.filter(game => gameIds.includes(game.id)) || [];
  };

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

      <Card>
        <CardHeader>
          <CardTitle>Active Tasks</CardTitle>
          <CardDescription>Monitor and manage your running tasks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tasks?.map((task) => (
            <div key={task.id} className="border rounded-lg">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.name}</span>
                        <Badge
                          variant={task.status === 'failed' ? 'destructive' : 'default'}
                          className="cursor-pointer hover:opacity-80"
                          onClick={() => handleStatusToggle(task.id, task.status)}
                        >
                          {task.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {task.description || 'No description'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {task.status === 'running' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusToggle(task.id, 'running')}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusToggle(task.id, 'inactive')}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTask(task);
                          setIsModalOpen(true);
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => api.deleteTask(task.id).then(() => refetch())}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

<div className="grid grid-cols-4 gap-4">
  <div className="space-y-2">
    <div className="text-sm font-medium flex items-center gap-2">
      <Users className="h-4 w-4" />
      Channels ({task.channel_ids?.length || 0})
    </div>
    <div className="flex -space-x-2 overflow-hidden">
      {getTaskChannels(task.channel_ids || []).slice(0, 4).map((channel) => (
        <div
          key={channel.id}
          className="h-12 w-12 rounded-full border border-gray-300 overflow-hidden shadow-md"
        >
          <img
            src={channel.profile_image_url}
            alt={`${channel.display_name}'s profile`}
            className="w-full h-full object-cover"
          />
        </div>
      ))}
      {(task.channel_ids?.length || 0) > 4 && (
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm shadow-md">
          +{task.channel_ids!.length - 4}
        </div>
      )}
    </div>
  </div>

  <div className="space-y-2">
    <div className="text-sm font-medium flex items-center gap-2">
      <Gamepad2 className="h-4 w-4" />
      Games ({task.game_ids?.length || 0})
    </div>
    <div className="flex -space-x-2 overflow-hidden">
      {getTaskGames(task.game_ids || []).slice(0, 4).map((game) => (
        <div
          key={game.id}
          className="relative h-16 w-12 rounded-lg border border-gray-300 overflow-hidden shadow-md"
        >
          <img
            src={game.box_art_url}
            alt={game.name}
            className="w-full h-full object-cover"
          />
        </div>
      ))}
      {(task.game_ids?.length || 0) > 4 && (
        <div className="h-16 w-12 rounded-lg bg-muted flex items-center justify-center text-sm shadow-md">
          +{task.game_ids!.length - 4}
        </div>
      )}
    </div>
  </div>

  <div className="space-y-2">
    <div className="text-sm font-medium flex items-center gap-2">
      <Download className="h-4 w-4" />
      Downloads
    </div>
    <div className="text-sm text-muted-foreground">
      {task.total_vods || 0} VODs ({task.completed_vods || 0} completed)
    </div>
  </div>

  <div className="space-y-2">
    <div className="text-sm text-muted-foreground flex justify-between">
      <span>Progress</span>
      <span>{task.progress?.percentage?.toFixed(1) || 0}%</span>
    </div>
    <Progress value={task.progress?.percentage || 0} className="h-2" />
    <div className="text-xs text-muted-foreground">
      Last run: {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}
    </div>
  </div>
</div>

{task.conditions && Object.keys(task.conditions).length > 0 && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Filter className="h-4 w-4" />
    <span>{Object.keys(task.conditions).length} conditions applied</span>
  </div>
)}

{task.restrictions && Object.keys(task.restrictions).length > 0 && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Shield className="h-4 w-4" />
    <span>{Object.keys(task.restrictions).length} restrictions applied</span>
  </div>
)}

              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <TaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
        }}
        onSubmit={async (data) => {
          try {
            if (selectedTask) {
              await api.updateTask(selectedTask.id, data);
            } else {
              await api.createTask(data);
            }
            setIsModalOpen(false);
            setSelectedTask(null);
            refetch();
          } catch (error) {
            console.error('Error saving task:', error);
          }
        }}
        task={selectedTask}
      />
    </div>
  );
}

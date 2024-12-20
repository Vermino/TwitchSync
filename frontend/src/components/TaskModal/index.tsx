// Filepath: frontend/src/components/TaskModal/index.tsx

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import ConditionsTab from './ConditionsTab';
import type { Task, CreateTaskRequest, Channel, Game } from '@/types/task';
import { logger } from '@/utils/logger';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTaskRequest) => Promise<void>;
  task?: Task;
}

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSubmit, task }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskData, setTaskData] = useState<Partial<CreateTaskRequest>>({
    name: task?.name || '',
    description: task?.description || '',
    channel_ids: task?.channel_ids || [],
    game_ids: task?.game_ids || [],
    schedule_type: task?.schedule_type || 'interval',
    schedule_value: task?.schedule_value || '1h',
    storage_limit_gb: task?.storage_limit_gb || undefined,
    retention_days: task?.retention_days || undefined,
    auto_delete: task?.auto_delete || false,
    priority: task?.priority || 'low',
    conditions: task?.conditions || {},
    restrictions: task?.restrictions || {}
  });

  // Fetch and validate channels
  const { data: channelsResponse } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      try {
        const response = await api.getChannels();
        logger.debug('Channels response:', response);
        // Ensure we have an array
        return Array.isArray(response) ? response : [];
      } catch (error) {
        logger.error('Error fetching channels:', error);
        return [];
      }
    },
    initialData: []
  });

  // Fetch and validate games
  const { data: gamesResponse } = useQuery({
    queryKey: ['games'],
    queryFn: async () => {
      try {
        const response = await api.getGames();
        logger.debug('Games response:', response);
        // Ensure we have an array
        return Array.isArray(response) ? response : [];
      } catch (error) {
        logger.error('Error fetching games:', error);
        return [];
      }
    },
    initialData: []
  });

  // Ensure we always have arrays
  const channels = useMemo(() => {
    if (!Array.isArray(channelsResponse)) {
      logger.warn('Channels response is not an array:', channelsResponse);
      return [];
    }
    return channelsResponse;
  }, [channelsResponse]);

  const games = useMemo(() => {
    if (!Array.isArray(gamesResponse)) {
      logger.warn('Games response is not an array:', gamesResponse);
      return [];
    }
    return gamesResponse;
  }, [gamesResponse]);

  const selectedChannelDetails = useMemo(() => {
    return taskData.channel_ids?.reduce<Channel[]>((acc, id) => {
      const channel = channels.find(c => c.id === id);
      if (channel) acc.push(channel);
      return acc;
    }, []) || [];
  }, [channels, taskData.channel_ids]);

  const selectedGameDetails = useMemo(() => {
    return taskData.game_ids?.reduce<Game[]>((acc, id) => {
      const game = games.find(g => g.id === id);
      if (game) acc.push(game);
      return acc;
    }, []) || [];
  }, [games, taskData.game_ids]);

  const handleInputChange = (field: keyof CreateTaskRequest, value: any) => {
    setTaskData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async () => {
    if (!taskData.name?.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...taskData,
        channel_ids: taskData.channel_ids || [],
        game_ids: taskData.game_ids || [],
        schedule_type: taskData.schedule_type || 'interval',
        schedule_value: taskData.schedule_value || '1h'
      } as CreateTaskRequest);
      onClose();
    } catch (error) {
      logger.error('Error saving task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {task ? 'Edit Task' : 'Create New Task'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 p-4">
            <TabsContent value="general" className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>Task Name</Label>
                  <Input
                    value={taskData.name || ''}
                    onChange={e => handleInputChange('name', e.target.value)}
                    placeholder="Enter task name"
                  />
                </div>

                <div>
                  <Label>Description</Label>
                  <Input
                    value={taskData.description || ''}
                    onChange={e => handleInputChange('description', e.target.value)}
                    placeholder="Enter task description (optional)"
                  />
                </div>

                {/* Channel Selection will go here */}
                <div className="space-y-2">
                  <Label>Selected Channels ({selectedChannelDetails.length})</Label>
                  {selectedChannelDetails.map((channel) => (
                    <div key={channel.id} className="flex items-center space-x-2">
                      <span>{channel.display_name || channel.username}</span>
                    </div>
                  ))}
                </div>

                {/* Game Selection will go here */}
                <div className="space-y-2">
                  <Label>Selected Games ({selectedGameDetails.length})</Label>
                  {selectedGameDetails.map((game) => (
                    <div key={game.id} className="flex items-center space-x-2">
                      <span>{game.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="conditions">
              <ConditionsTab
                conditions={taskData.conditions || {}}
                onChange={conditions => handleInputChange('conditions', conditions)}
              />
            </TabsContent>

            <TabsContent value="restrictions">
              {/* Restrictions content */}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !taskData.name?.trim()}
            type="submit"
          >
            {isSubmitting ? 'Saving...' : 'Save Task'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskModal;

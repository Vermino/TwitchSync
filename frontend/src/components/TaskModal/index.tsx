// Filepath: /frontend/src/components/TaskModal/index.tsx

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Users, Gamepad2, Filter, Shield, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ConditionsTab from './ConditionsTab';
import ChannelList from './ChannelList';
import RestrictionsTab from './RestrictionsTab';
import type { Task, CreateTaskRequest, Channel, Game } from '@/types/task';
import { validateTaskData } from '@/utils/taskValidation';
import { generateTaskNameAndDescription } from '@/utils/taskUtils';
import { logger } from '@/utils/logger';
import { useToast } from '@/components/ui/use-toast';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTaskRequest) => Promise<void>;
  task?: Task | null;
  availableChannels: Channel[];
  availableGames: Game[];
}

const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  task,
  availableChannels,
  availableGames
}) => {
  const [activeTab, setActiveTab] = useState('channels');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [gameSearch, setGameSearch] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [taskData, setTaskData] = useState<Partial<CreateTaskRequest>>({
    name: '',
    description: '',
    task_type: 'combined',
    channel_ids: [],
    game_ids: [],
    schedule_type: 'interval',
    schedule_value: '3600',
    storage_limit_gb: 0,
    retention_days: 7,
    auto_delete: false,
    priority: 'normal',
    conditions: {},
    restrictions: {}
  });
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && task) {
      setTaskData({
        name: task.name,
        description: task.description || '',
        task_type: task.task_type,
        channel_ids: task.channel_ids,
        game_ids: task.game_ids,
        schedule_type: task.schedule_type,
        schedule_value: task.schedule_value,
        storage_limit_gb: task.storage_limit_gb || 0,
        retention_days: task.retention_days || 7,
        auto_delete: task.auto_delete,
        priority: task.priority,
        conditions: task.conditions || {},
        restrictions: task.restrictions || {}
      });
    } else {
      // Reset form for new task
      setTaskData({
        name: '',
        description: '',
        task_type: 'combined',
        channel_ids: [],
        game_ids: [],
        schedule_type: 'interval',
        schedule_value: '3600',
        storage_limit_gb: 0,
        retention_days: 7,
        auto_delete: false,
        priority: 'normal',
        conditions: {},
        restrictions: {}
      });
    }
    setActiveTab('channels');
    setChannelSearch('');
    setGameSearch('');
    setValidationErrors([]);
  }, [isOpen, task]);

  useEffect(() => {
    // Auto-generate name and description when relevant fields change
    if (!taskData.name || !taskData.description) {
      const generated = generateTaskNameAndDescription(taskData, availableChannels, availableGames);
      setTaskData(prev => ({
        ...prev,
        name: prev.name || generated.name,
        description: prev.description || generated.description
      }));
    }
  }, [
    taskData.channel_ids,
    taskData.game_ids,
    taskData.task_type,
    taskData.schedule_type,
    taskData.schedule_value,
    availableChannels,
    availableGames
  ]);

  const handleInputChange = (field: keyof CreateTaskRequest, value: any) => {
    setTaskData(prev => {
      const newData = { ...prev, [field]: value };

      // Clear inappropriate IDs when task type changes
      if (field === 'task_type') {
        switch (value) {
          case 'channel':
            newData.game_ids = [];
            break;
          case 'game':
            newData.channel_ids = [];
            break;
        }
      }

      return newData;
    });
    setValidationErrors([]);
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];

    if (!taskData.channel_ids?.length && !taskData.game_ids?.length) {
      errors.push('Select at least one channel or game');
    }

    if (taskData.schedule_type === 'interval') {
      const interval = parseInt(taskData.schedule_value || '0');
      if (interval < 300) { // 5 minutes minimum
        errors.push('Interval must be at least 5 minutes');
      }
    }

    if (taskData.retention_days && (taskData.retention_days < 1 || taskData.retention_days > 365)) {
      errors.push('Retention days must be between 1 and 365');
    }

    if (taskData.storage_limit_gb && taskData.storage_limit_gb < 0) {
      errors.push('Storage limit must be positive');
    }

    return errors;
  };

  const handleSubmit = async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      // Ensure name and description are set
      const finalData = {
        ...taskData,
        ...(!taskData.name && {
          name: generateTaskNameAndDescription(taskData, availableChannels, availableGames).name
        }),
        ...(!taskData.description && {
          description: generateTaskNameAndDescription(taskData, availableChannels, availableGames).description
        })
      };

      await onSubmit(finalData as CreateTaskRequest);
      onClose();
      toast({
        title: task ? "Task Updated" : "Task Created",
        description: `Successfully ${task ? 'updated' : 'created'} task "${finalData.name}"`,
      });
    } catch (error) {
      logger.error('Error saving task:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save task",
        variant: "destructive",
      });
      setValidationErrors(['Failed to save task. Please try again.']);
    } finally {
      setIsSubmitting(false);
    }
  };

   return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col pt-6 px-8">
        <DialogHeader>
          <DialogTitle>
            {task ? 'Edit Task' : 'Create New Task'}
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            Configure your task settings, including channels, games, and scheduling options.
          </div>
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="h-3 w-3"/>
              {taskData.channel_ids?.length || 0} channels
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Gamepad2 className="h-3 w-3"/>
              {taskData.game_ids?.length || 0} games
            </Badge>
          </div>
        </DialogHeader>

        {validationErrors.length > 0 && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc pl-4">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 mb-4">
          <div>
            <Label>Task Name</Label>
            <Input
              value={taskData.name || ''}
              onChange={e => handleInputChange('name', e.target.value)}
              placeholder="Enter task name or leave empty for auto-generation"
            />
          </div>

          <div>
            <Label>Task Type</Label>
            <Select
              value={taskData.task_type}
              onValueChange={value => handleInputChange('task_type', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select task type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="channel">Channel</SelectItem>
                <SelectItem value="game">Game</SelectItem>
                <SelectItem value="combined">Combined</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Description</Label>
            <Input
              value={taskData.description || ''}
              onChange={e => handleInputChange('description', e.target.value)}
              placeholder="Enter description or leave empty for auto-generation"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="channels" className="flex items-center gap-2">
              <Users className="h-4 w-4"/>
              Channels
            </TabsTrigger>
            <TabsTrigger value="games" className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4"/>
              Games
            </TabsTrigger>
            <TabsTrigger value="conditions" className="flex items-center gap-2">
              <Filter className="h-4 w-4"/>
              Conditions
            </TabsTrigger>
            <TabsTrigger value="restrictions" className="flex items-center gap-2">
              <Shield className="h-4 w-4"/>
              Restrictions
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4"/>
              Settings
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 overflow-hidden">
            <TabsContent value="channels" className="h-[460px] p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search channels..."
                  value={channelSearch}
                  onChange={e => setChannelSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="mt-4">
                <ChannelList
                  selected={taskData.channel_ids || []}
                  onSelect={(channelId) => {
                    const currentIds = taskData.channel_ids || [];
                    const newIds = currentIds.includes(channelId)
                      ? currentIds.filter(id => id !== channelId)
                      : [...currentIds, channelId];
                    handleInputChange('channel_ids', newIds);
                  }}
                  searchQuery={channelSearch}
                  channels={availableChannels}
                />
              </div>
            </TabsContent>

            {/* Games tab content */}
            <TabsContent value="games" className="h-[460px] p-4">
              {/* Similar structure to channels tab */}
            </TabsContent>

            <TabsContent value="conditions" className="p-4">
              <ConditionsTab
                conditions={taskData.conditions || {}}
                onChange={conditions => handleInputChange('conditions', conditions)}
              />
            </TabsContent>

            <TabsContent value="restrictions" className="p-4">
              <RestrictionsTab
                restrictions={taskData.restrictions || {}}
                onChange={restrictions => handleInputChange('restrictions', restrictions)}
              />
            </TabsContent>

            <TabsContent value="settings" className="p-4">
              <div className="grid grid-cols-2 gap-6">
                {/* Schedule settings */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Schedule Type</Label>
                    <Select
                      value={taskData.schedule_type}
                      onValueChange={value => handleInputChange('schedule_type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select schedule type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interval">Interval</SelectItem>
                        <SelectItem value="cron">Cron</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      {taskData.schedule_type === 'interval' ? 'Interval (seconds)' :
                        taskData.schedule_type === 'cron' ? 'Cron Expression' :
                          'Schedule Value'}
                    </Label>
                    <Input
                      type={taskData.schedule_type === 'interval' ? 'number' : 'text'}
                      value={taskData.schedule_value || ''}
                      onChange={e => handleInputChange('schedule_value', e.target.value)}
                      placeholder={
                        taskData.schedule_type === 'interval' ? '3600' :
                          taskData.schedule_type === 'cron' ? '0 */6 * * *' :
                            ''
                      }
                      disabled={taskData.schedule_type === 'manual'}
                    />
                    {taskData.schedule_type === 'interval' && (
                      <p className="text-sm text-muted-foreground">
                        {(parseInt(taskData.schedule_value || '3600') / 3600).toFixed(1)} hours
                      </p>
                    )}
                  </div>
                </div>

                {/* Other settings */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Priority Level</Label>
                    <Select
                      value={taskData.priority}
                      onValueChange={value => handleInputChange('priority', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Storage Limit (GB)</Label>
                    <Input
                      type="number"
                      value={taskData.storage_limit_gb || ''}
                      onChange={e => handleInputChange('storage_limit_gb', e.target.value ? parseInt(e.target.value) : 0)}
                      placeholder="Optional"
                      min="0"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Retention Days</Label>
                    <Input
                      type="number"
                      value={taskData.retention_days || ''}
                      onChange={e => handleInputChange('retention_days', e.target.value ? parseInt(e.target.value) : 0)}
                      placeholder="Optional"
                      min="1"
                      max="365"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={taskData.auto_delete}
                        onChange={e => handleInputChange('auto_delete', e.target.checked)}
                        className="rounded border-input h-4 w-4 text-purple-600 focus:ring-purple-500"
                      />
                      Auto-delete files after retention period
                    </Label>
                  </div>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || validationErrors.length > 0}
            type="submit"
          >
            {isSubmitting ? 'Saving...' : (task ? 'Update Task' : 'Create Task')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskModal;

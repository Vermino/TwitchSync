// Filepath: frontend/src/components/TaskModal/TaskModal.tsx

import React, { useState, useEffect } from 'react';
import { Users, Gamepad2, Settings, Filter, Shield, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  TaskBasicInfo,
  ChannelsTab,
  GamesTab,
  ConditionsTab,
  RestrictionsTab,
  SettingsTab
} from './sections';

import { useTaskValidation } from './hooks/useTaskValidation';
import { useTaskDataManager } from './hooks/useTaskDataManager';
import type { Task, CreateTaskRequest } from '@/types/task';
import { useToast } from '@/components/ui/use-toast';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  task?: Task | null;
}

const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  task
}) => {
  const [activeTab, setActiveTab] = useState('channels');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const {
    taskData,
    updateTaskData,
    resetTaskData,
    handleInputChange
  } = useTaskDataManager(task);

  const {
    validationErrors,
    validateForm
  } = useTaskValidation(taskData);

  useEffect(() => {
    if (isOpen) {
      resetTaskData();
      setActiveTab('channels');
    }
  }, [isOpen, resetTaskData]);

  const handleSubmit = async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      toast({
        title: "Validation Error",
        description: errors.join('. '),
        variant: "destructive",
      });
      return;
    }

    // Ensure all required fields are present
    const submitData: CreateTaskRequest = {
      name: taskData.name || `Task ${new Date().toLocaleString()}`,
      description: taskData.description || '',
      task_type: taskData.task_type || 'combined',
      channel_ids: taskData.channel_ids || [],
      game_ids: taskData.game_ids || [],
      schedule_type: taskData.schedule_type || 'interval',
      schedule_value: taskData.schedule_value || '3600',
      storage_limit_gb: taskData.storage_limit_gb || 0,
      retention_days: taskData.retention_days || 7,
      auto_delete: taskData.auto_delete || false,
      priority: taskData.priority || 'low',
      quality: taskData.quality,
      conditions: taskData.conditions || {},
      restrictions: taskData.restrictions || {}
    };

    setIsSubmitting(true);
    try {
      await onSubmit(submitData);
      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        data-testid="task-modal"
        className="flex h-[90vh] max-h-[900px] w-[96vw] max-w-[1400px] min-h-0 flex-col overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          <DialogDescription>
            Configure your task settings, including channels, games, and scheduling options.
          </DialogDescription>
          <div className="flex gap-2 mt-2">
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
          <Alert variant="destructive" className="mx-6 mt-4 shrink-0">
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

        <div className="shrink-0 px-6 pt-4">
          <TaskBasicInfo
            taskData={taskData}
            onChange={handleInputChange}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col px-6">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="channels" data-testid="task-tab-channels" className="flex items-center gap-2">
              <Users className="h-4 w-4"/>
              Channels
            </TabsTrigger>
            <TabsTrigger value="games" data-testid="task-tab-games" className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4"/>
              Games
            </TabsTrigger>
            <TabsTrigger value="conditions" data-testid="task-tab-conditions" className="flex items-center gap-2">
              <Filter className="h-4 w-4"/>
              Conditions
            </TabsTrigger>
            <TabsTrigger value="restrictions" data-testid="task-tab-restrictions" className="flex items-center gap-2">
              <Shield className="h-4 w-4"/>
              Restrictions
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="task-tab-settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4"/>
              Settings
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 py-4">
            <ScrollArea className="h-full">
              <TabsContent value="channels" className="mt-0 h-full p-4">
              <ChannelsTab
                selectedIds={taskData.channel_ids || []}
                onSelectionChange={(ids) => handleInputChange('channel_ids', ids)}
              />
              </TabsContent>

              <TabsContent value="games" className="mt-0 h-full p-4">
              <GamesTab
                selectedIds={taskData.game_ids || []}
                onSelectionChange={(ids) => handleInputChange('game_ids', ids)}
              />
              </TabsContent>

              <TabsContent value="conditions" className="mt-0 h-full p-4">
              <ConditionsTab
                conditions={taskData.conditions || {}}
                onChange={(conditions) => handleInputChange('conditions', conditions)}
              />
              </TabsContent>

              <TabsContent value="restrictions" className="mt-0 h-full p-4">
              <RestrictionsTab
                restrictions={taskData.restrictions || {}}
                onChange={(restrictions) => handleInputChange('restrictions', restrictions)}
              />
              </TabsContent>

              <TabsContent value="settings" className="mt-0 h-full p-4">
              <SettingsTab
                settings={taskData}
                onChange={handleInputChange}
              />
              </TabsContent>
            </ScrollArea>
          </div>
        </Tabs>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={onClose} data-testid="task-modal-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || validationErrors.length > 0}
            data-testid="task-modal-submit"
          >
            {isSubmitting ? 'Saving...' : (task ? 'Update Task' : 'Create Task')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskModal;

// Filepath: frontend/src/components/TaskModal/sections/TaskBasicInfo.tsx

import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreateTaskRequest } from '@/types/task';

interface TaskBasicInfoProps {
  taskData: Partial<CreateTaskRequest>;
  onChange: (field: keyof CreateTaskRequest, value: any) => void;
}

const TaskBasicInfo: React.FC<TaskBasicInfoProps> = ({
  taskData,
  onChange
}) => {
  return (
    <div className="space-y-4 mb-4">
      <div>
        <Label>Task Name</Label>
        <Input
          value={taskData.name || ''}
          onChange={e => onChange('name', e.target.value)}
          placeholder="Enter task name or leave empty for auto-generation"
        />
      </div>

      <div>
        <Label>Task Type</Label>
        <Select
          value={taskData.task_type}
          onValueChange={value => onChange('task_type', value)}
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
          onChange={e => onChange('description', e.target.value)}
          placeholder="Enter description or leave empty for auto-generation"
        />
      </div>
    </div>
  );
};

export default TaskBasicInfo;

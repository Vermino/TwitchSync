// Filepath: frontend/src/components/TaskModal/sections/SettingsTab.tsx

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

interface SettingsTabProps {
  settings: Partial<CreateTaskRequest>;
  onChange: (field: keyof CreateTaskRequest, value: any) => void;
}

const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  onChange
}) => {
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Schedule Type</Label>
          <Select
            value={settings.schedule_type}
            onValueChange={value => onChange('schedule_type', value)}
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
            {settings.schedule_type === 'interval' ? 'Interval (seconds)' :
             settings.schedule_type === 'cron' ? 'Cron Expression' :
             'Schedule Value'}
          </Label>
          <Input
            type={settings.schedule_type === 'interval' ? 'number' : 'text'}
            value={settings.schedule_value || ''}
            onChange={e => onChange('schedule_value', e.target.value)}
            placeholder={
              settings.schedule_type === 'interval' ? '3600' :
              settings.schedule_type === 'cron' ? '0 */6 * * *' :
              ''
            }
            disabled={settings.schedule_type === 'manual'}
          />
          {settings.schedule_type === 'interval' && (
            <p className="text-sm text-muted-foreground">
              {(parseInt(settings.schedule_value || '3600') / 3600).toFixed(1)} hours
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Priority Level</Label>
          <Select
            value={settings.priority}
            onValueChange={value => onChange('priority', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Storage Limit (GB)</Label>
          <Input
            type="number"
            value={settings.storage_limit_gb || ''}
            onChange={e => onChange('storage_limit_gb', e.target.value ? parseInt(e.target.value) : 0)}
            placeholder="Optional"
            min="0"
          />
          <p className="text-sm text-muted-foreground">
            Maximum storage space allowed for this task
          </p>
        </div>

        <div className="space-y-2">
          <Label>Retention Days</Label>
          <Input
            type="number"
            value={settings.retention_days || ''}
            onChange={e => onChange('retention_days', e.target.value ? parseInt(e.target.value) : 0)}
            placeholder="Optional"
            min="1"
            max="365"
          />
          <p className="text-sm text-muted-foreground">
            Number of days to keep archived content
          </p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.auto_delete}
              onChange={e => onChange('auto_delete', e.target.checked)}
              className="rounded border-input h-4 w-4 text-purple-600 focus:ring-purple-500"
            />
            Auto-delete files after retention period
          </Label>
          <p className="text-sm text-muted-foreground pl-6">
            Automatically remove files older than the retention period
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;

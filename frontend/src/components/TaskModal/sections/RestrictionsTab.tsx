// Filepath: frontend/src/components/TaskModal/sections/RestrictionsTab.tsx

import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { HardDrive } from 'lucide-react';
import type { TaskRestrictions } from '@/types/task';

interface RestrictionsTabProps {
  restrictions: TaskRestrictions;
  onChange: (restrictions: TaskRestrictions) => void;
  currentStorage?: {
    used: number;
    limit: number;
  };
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const RestrictionsTab: React.FC<RestrictionsTabProps> = ({
  restrictions,
  onChange,
  currentStorage
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Max VODs per Channel</Label>
          <Input
            type="number"
            min="0"
            value={restrictions.maxVodsPerChannel || ''}
            onChange={e => onChange({
              ...restrictions,
              maxVodsPerChannel: e.target.value ? parseInt(e.target.value) : undefined
            })}
            placeholder="No limit"
          />
          <p className="text-sm text-muted-foreground">
            Maximum number of VODs to keep per channel
          </p>
        </div>

        <div className="space-y-2">
          <Label>Max Storage per Channel (GB)</Label>
          <Input
            type="number"
            min="0"
            value={restrictions.maxStoragePerChannel || ''}
            onChange={e => onChange({
              ...restrictions,
              maxStoragePerChannel: e.target.value ? parseInt(e.target.value) : undefined
            })}
            placeholder="No limit"
          />
          <p className="text-sm text-muted-foreground">
            Maximum storage space per channel
          </p>
        </div>

        <div className="space-y-2">
          <Label>Max Total VODs</Label>
          <Input
            type="number"
            min="0"
            value={restrictions.maxTotalVods || ''}
            onChange={e => onChange({
              ...restrictions,
              maxTotalVods: e.target.value ? parseInt(e.target.value) : undefined
            })}
            placeholder="No limit"
          />
          <p className="text-sm text-muted-foreground">
            Maximum total number of VODs to keep
          </p>
        </div>

        <div className="space-y-2">
          <Label>Max Total Storage (GB)</Label>
          <Input
            type="number"
            min="0"
            value={restrictions.maxTotalStorage || ''}
            onChange={e => onChange({
              ...restrictions,
              maxTotalStorage: e.target.value ? parseInt(e.target.value) : undefined
            })}
            placeholder="No limit"
          />
          <p className="text-sm text-muted-foreground">
            Maximum total storage space for this task
          </p>
        </div>
      </div>

      {currentStorage && (
        <div className="space-y-2 pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Current Storage Usage
            </span>
            <span>{formatBytes(currentStorage.used)} / {formatBytes(currentStorage.limit)}</span>
          </div>
          <Progress
            value={(currentStorage.used / currentStorage.limit) * 100}
            className="h-2"
          />
          <p className="text-sm text-muted-foreground">
            {((currentStorage.used / currentStorage.limit) * 100).toFixed(1)}% used
          </p>
        </div>
      )}
    </div>
  );
};

export default RestrictionsTab;

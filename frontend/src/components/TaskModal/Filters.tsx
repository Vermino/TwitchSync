// Filepath: frontend/src/components/TaskModal/Filters.tsx

import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { VideoQuality } from '@/types/task';
import type { TaskFilters } from '@/types/task';

interface FiltersProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' }
];

const qualityOptions: { value: VideoQuality; label: string; }[] = [
  { value: 'source', label: 'Source' },
  { value: '1080p60', label: '1080p60' },
  { value: '1080p', label: '1080p' },
  { value: '720p60', label: '720p60' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
  { value: '160p', label: '160p' }
];

export const Filters: React.FC<FiltersProps> = ({ filters, onChange }) => {
  const handleChange = (field: keyof TaskFilters, value: any) => {
    onChange({
      ...filters,
      [field]: value
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-4">Channel Requirements</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minimum Followers</Label>
              <Input
                type="number"
                value={filters.minimum_followers || ''}
                onChange={e => handleChange('minimum_followers', parseInt(e.target.value) || undefined)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Minimum Views</Label>
              <Input
                type="number"
                value={filters.minimum_views || ''}
                onChange={e => handleChange('minimum_views', parseInt(e.target.value) || undefined)}
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-4">Content Preferences</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Languages</Label>
            <Select
              isMulti
              options={languageOptions}
              value={languageOptions.filter(opt => filters.languages?.includes(opt.value))}
              onChange={selected => handleChange('languages', selected.map(s => s.value))}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label>Preferred Quality</Label>
            <Select
              options={qualityOptions}
              value={qualityOptions.find(opt => opt.value === filters.quality_preference)}
              onChange={selected => handleChange('quality_preference', selected?.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label>Minimum Duration (minutes)</Label>
            <Input
              type="number"
              value={filters.minimum_duration || ''}
              onChange={e => handleChange('minimum_duration', parseInt(e.target.value) || undefined)}
              placeholder="0"
            />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-4">Schedule Preferences</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Content Type</Label>
            <Select
              options={[
                { value: 'any', label: 'Any Content' },
                { value: 'live_only', label: 'Live Streams Only' },
                { value: 'vod_only', label: 'VODs Only' }
              ]}
              value={{
                value: filters.schedule_preference || 'any',
                label: filters.schedule_preference === 'live_only' ? 'Live Streams Only' :
                       filters.schedule_preference === 'vod_only' ? 'VODs Only' : 'Any Content'
              }}
              onChange={selected => handleChange('schedule_preference', selected?.value)}
              className="w-full"
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Filters;

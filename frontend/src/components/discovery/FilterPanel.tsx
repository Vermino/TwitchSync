// frontend/src/components/discovery/FilterPanel.tsx

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Filter,
  Globe,
  Users,
  Hash
} from 'lucide-react';
import type { FilterPanelProps } from '@/types/discovery';

const FilterPanel = ({ settings, onChange, onApply, isApplying }: FilterPanelProps) => {
  const languages = ['EN', 'ES', 'FR', 'DE', 'JP', 'KR', 'PT', 'RU'];

  const handleViewerRangeChange = (value: number[]) => {
    onChange({
      ...settings,
      minViewers: value[0],
      maxViewers: value[1]
    });
  };

  return (
    <Card>
      <CardContent className="space-y-6 p-4">
        {/* VOD Views */}
        <div>
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Users size={16} />
            VOD Views
          </h3>
          <div className="px-2">
            <Slider
              min={0}
              max={100000}
              step={1000}
              value={[settings.minViewers, settings.maxViewers]}
              onValueChange={handleViewerRangeChange}
              className="mt-2"
            />
            <div className="flex justify-between mt-1 text-sm text-gray-600">
              <span>{settings.minViewers === 0 ? '0' : settings.minViewers.toLocaleString()}</span>
              <span>{settings.maxViewers >= 100000 ? '100k+' : settings.maxViewers.toLocaleString()} views</span>
            </div>
          </div>
        </div>

        {/* Language Preferences */}
        <div>
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Globe size={16} />
            Languages
          </h3>
          <div className="flex flex-wrap gap-2">
            {languages.map(lang => (
              <Badge
                key={lang}
                variant={settings.preferredLanguages.includes(lang) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => {
                  const newLangs = settings.preferredLanguages.includes(lang)
                    ? settings.preferredLanguages.filter(l => l !== lang)
                    : [...settings.preferredLanguages, lang];
                  onChange({ ...settings, preferredLanguages: newLangs });
                }}
              >
                {lang}
              </Badge>
            ))}
          </div>
        </div>

        {/* Tags Settings */}
        <div>
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Hash size={16} />
            Required Tags
          </h3>
          <div className="px-2">
            <input
              type="text"
              placeholder="e.g. speedrun, vtuber, blind"
              className="w-full text-sm p-2 border border-gray-300 rounded focus:border-purple-500 outline-none"
              value={settings.tags ? settings.tags.join(', ') : ''}
              onChange={(e) => {
                const tagString = e.target.value;
                const newTags = tagString.split(',').map(t => t.trim()).filter(t => t.length > 0);
                onChange({ ...settings, tags: newTags });
              }}
            />
          </div>
        </div>

        {/* Notification Settings */}
        <div>
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Bell size={16} />
            Notifications
          </h3>
          <div className="space-y-2">
            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Notify Only</span>
              <Switch
                checked={settings.notifyOnly}
                onCheckedChange={(checked) =>
                  onChange({ ...settings, notifyOnly: checked })
                }
              />
            </label>
          </div>
        </div>

        {/* Confidence Threshold */}
        <div>
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <Filter size={16} />
            Match Threshold
          </h3>
          <div className="px-2">
            <Slider
              min={0}
              max={100}
              value={[settings.confidenceThreshold * 100]}
              onValueChange={([value]) =>
                onChange({ ...settings, confidenceThreshold: value / 100 })
              }
              className="mt-2"
            />
            <div className="text-right mt-1 text-sm text-gray-600">
              {(settings.confidenceThreshold * 100).toFixed(0)}% minimum
            </div>
          </div>
        </div>

        {/* Apply Button */}
        <div className="pt-2 border-t">
          <Button
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            onClick={onApply}
            disabled={isApplying}
          >
            {isApplying ? 'Applying Filters...' : 'Apply Filters'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FilterPanel;

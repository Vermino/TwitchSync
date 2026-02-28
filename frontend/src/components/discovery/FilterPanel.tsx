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
  Hash,
  Gamepad2
} from 'lucide-react';
import type { FilterPanelProps } from '@/types/discovery';

const FilterPanel = ({ settings, availableGames, onChange, onApply, isApplying }: FilterPanelProps) => {
  const languages = ['en', 'es', 'fr', 'de', 'ja', 'kr', 'pt', 'ru'];

  const handleViewerRangeChange = (value: number[]) => {
    onChange({
      ...settings,
      minViewers: value[0],
      maxViewers: value[1]
    });
  };

  const toggleGame = (gameIdString: string) => {
    const gameId = parseInt(gameIdString, 10);
    if (isNaN(gameId)) return;

    const currentIds = settings.gameIds || [];
    const newIds = currentIds.includes(gameId)
      ? currentIds.filter(id => id !== gameId)
      : [...currentIds, gameId];

    onChange({ ...settings, gameIds: newIds });
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
                variant={settings.preferredLanguages.includes(lang.toLowerCase()) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => {
                  const newLangs = settings.preferredLanguages.includes(lang.toLowerCase())
                    ? settings.preferredLanguages.filter(l => l !== lang.toLowerCase())
                    : [...settings.preferredLanguages, lang.toLowerCase()];
                  onChange({ ...settings, preferredLanguages: newLangs });
                }}
              >
                {lang.toUpperCase()}
              </Badge>
            ))}
          </div>
        </div>

        {/* Game Filter */}
        {availableGames && availableGames.length > 0 && (
          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Gamepad2 size={16} />
              Filter by Games
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {availableGames.map(game => {
                const isSelected = settings.gameIds?.includes(parseInt(game.id, 10));
                return (
                  <div
                    key={game.id}
                    className={`relative cursor-pointer transition-all duration-200 rounded-md overflow-hidden border-2 ${isSelected ? 'border-purple-600 scale-105 shadow-md' : 'border-transparent opacity-60 grayscale hover:opacity-100 hover:grayscale-0'}`}
                    onClick={() => toggleGame(game.id)}
                    title={game.name}
                  >
                    <img
                      src={game.boxArt.replace('{width}', '100').replace('{height}', '140')}
                      alt={game.name}
                      className="w-full aspect-[3/4] object-cover"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-purple-600/10 flex items-center justify-center">
                        <div className="bg-purple-600 text-white rounded-full p-0.5">
                          <Filter size={10} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {(settings.gameIds?.length || 0) > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs h-7 text-purple-600 hover:text-purple-700 p-0"
                onClick={() => onChange({ ...settings, gameIds: [] })}
              >
                Clear game filters
              </Button>
            )}
          </div>
        )}

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
            <label className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Strict Schedule Match</span>
              <Switch
                checked={settings.scheduleMatch}
                onCheckedChange={(checked) =>
                  onChange({ ...settings, scheduleMatch: checked })
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

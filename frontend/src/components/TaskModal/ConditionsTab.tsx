import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from 'lucide-react';

interface TaskConditions {
  minFollowers?: number;
  minViews?: number;
  minDuration?: number;
  languages?: string[];
}

interface ConditionsTabProps {
  conditions: TaskConditions;
  onChange: (conditions: TaskConditions) => void;
}

const LanguageOptions = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ko', label: 'Korean' },
  { value: 'ja', label: 'Japanese' }
];

const ConditionsTab: React.FC<ConditionsTabProps> = ({
  conditions,
  onChange
}) => {
  const handleLanguageAdd = (language: string) => {
    if (!conditions.languages?.includes(language)) {
      onChange({
        ...conditions,
        languages: [...(conditions.languages || []), language]
      });
    }
  };

  const handleLanguageRemove = (language: string) => {
    onChange({
      ...conditions,
      languages: conditions.languages?.filter(lang => lang !== language) || []
    });
  };

  return (
    <div className="space-y-6 p-1">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Minimum Followers</Label>
          <Input
            type="number"
            min="0"
            value={conditions.minFollowers || ''}
            onChange={e => onChange({
              ...conditions,
              minFollowers: e.target.value ? parseInt(e.target.value) : undefined
            })}
            placeholder="Enter minimum followers"
          />
          <p className="text-sm text-muted-foreground">
            Only download from channels with at least this many followers
          </p>
        </div>

        <div className="space-y-2">
          <Label>Minimum Views</Label>
          <Input
            type="number"
            min="0"
            value={conditions.minViews || ''}
            onChange={e => onChange({
              ...conditions,
              minViews: e.target.value ? parseInt(e.target.value) : undefined
            })}
            placeholder="Enter minimum views"
          />
          <p className="text-sm text-muted-foreground">
            Only download VODs with at least this many views
          </p>
        </div>

        <div className="space-y-2">
          <Label>Minimum Duration (minutes)</Label>
          <Input
            type="number"
            min="0"
            value={conditions.minDuration || ''}
            onChange={e => onChange({
              ...conditions,
              minDuration: e.target.value ? parseInt(e.target.value) : undefined
            })}
            placeholder="Enter minimum duration"
          />
          <p className="text-sm text-muted-foreground">
            Only download VODs longer than this duration
          </p>
        </div>

        <div className="space-y-2">
          <Label>Languages</Label>
          <Select
            onValueChange={handleLanguageAdd}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select language..." />
            </SelectTrigger>
            <SelectContent>
              {LanguageOptions.map(option => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={conditions.languages?.includes(option.value)}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap gap-2 mt-2">
            {conditions.languages?.map(language => {
              const languageOption = LanguageOptions.find(opt => opt.value === language);
              return (
                <Badge
                  key={language}
                  variant="secondary"
                  className="flex items-center gap-1.5 px-2 py-1"
                >
                  {languageOption?.label || language}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => handleLanguageRemove(language)}
                  />
                </Badge>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            Only download VODs in these languages
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConditionsTab;

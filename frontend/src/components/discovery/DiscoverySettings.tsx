// frontend/src/components/discovery/DiscoverySettings.tsx

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bell,
  Clock,
  Download,
  Filter,
  TrendingUp,
  Sparkles,
  MousePointerClick,
} from 'lucide-react';

interface DiscoverySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: {
    notifications: {
      premieres: boolean;
      risingStars: boolean;
      recommendations: boolean;
    };
    archiving: {
      autoArchive: boolean;
      quality: string;
      retention: number;
    };
    discovery: {
      scheduleMatch: boolean;
      minConfidence: number;
      autoTrack: boolean;
    };
  };
  onSettingsChange: (settings: any) => void;
}

const DiscoverySettings = ({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: DiscoverySettingsProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Discovery Settings</DialogTitle>
          <DialogDescription>
            Configure your content discovery preferences and automation settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="notifications" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="archiving" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Archiving
            </TabsTrigger>
            <TabsTrigger value="discovery" className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Discovery
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="space-y-4">
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="premieres" className="flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Premiere Notifications
                </Label>
                <Switch
                  id="premieres"
                  checked={settings.notifications.premieres}
                  onCheckedChange={(checked) =>
                    onSettingsChange({
                      ...settings,
                      notifications: { ...settings.notifications, premieres: checked },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="risingStars" className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Rising Stars Alerts
                </Label>
                <Switch
                  id="risingStars"
                  checked={settings.notifications.risingStars}
                  onCheckedChange={(checked) =>
                    onSettingsChange({
                      ...settings,
                      notifications: { ...settings.notifications, risingStars: checked },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="recommendations" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Recommendation Updates
                </Label>
                <Switch
                  id="recommendations"
                  checked={settings.notifications.recommendations}
                  onCheckedChange={(checked) =>
                    onSettingsChange({
                      ...settings,
                      notifications: { ...settings.notifications, recommendations: checked },
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="archiving" className="space-y-4">
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="autoArchive" className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Auto-Archive Premieres
                </Label>
                <Switch
                  id="autoArchive"
                  checked={settings.archiving.autoArchive}
                  onCheckedChange={(checked) =>
                    onSettingsChange({
                      ...settings,
                      archiving: { ...settings.archiving, autoArchive: checked },
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Default Quality</Label>
                <Select
                  value={settings.archiving.quality}
                  onValueChange={(value) =>
                    onSettingsChange({
                      ...settings,
                      archiving: { ...settings.archiving, quality: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select quality" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="best">Best Available</SelectItem>
                    <SelectItem value="1080p">1080p</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="480p">480p</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Retention Period (Days)</Label>
                <Slider
                  min={7}
                  max={365}
                  step={1}
                  value={[settings.archiving.retention]}
                  onValueChange={([value]) =>
                    onSettingsChange({
                      ...settings,
                      archiving: { ...settings.archiving, retention: value },
                    })
                  }
                />
                <div className="text-sm text-gray-500 text-right">
                  {settings.archiving.retention} days
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="discovery" className="space-y-4">
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="scheduleMatch" className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Match My Schedule
                </Label>
                <Switch
                  id="scheduleMatch"
                  checked={settings.discovery.scheduleMatch}
                  onCheckedChange={(checked) =>
                    onSettingsChange({
                      ...settings,
                      discovery: { ...settings.discovery, scheduleMatch: checked },
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Minimum Confidence Score</Label>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[settings.discovery.minConfidence * 100]}
                  onValueChange={([value]) =>
                    onSettingsChange({
                      ...settings,
                      discovery: { ...settings.discovery, minConfidence: value / 100 },
                    })
                  }
                />
                <div className="text-sm text-gray-500 text-right">
                  {(settings.discovery.minConfidence * 100).toFixed(0)}% minimum match
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="autoTrack" className="flex items-center gap-2">
                  <MousePointerClick className="w-4 h-4" />
                  Auto-Track High Confidence Matches
                </Label>
                <Switch
                  id="autoTrack"
                  checked={settings.discovery.autoTrack}
                  onCheckedChange={(checked) =>
                    onSettingsChange({
                      ...settings,
                      discovery: { ...settings.discovery, autoTrack: checked },
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DiscoverySettings;

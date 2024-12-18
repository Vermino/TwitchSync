// Filepath: frontend/src/components/TaskModal.tsx

import React, { useState, useEffect } from 'react';
import { Users, Gamepad2, Settings, Search, Check, Filter, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ConditionsTab from './TaskModal/ConditionsTab';
import RestrictionsTab from './TaskModal/RestrictionsTab';
import type { Task, TaskConditions, TaskRestrictions } from '@/types/task';
import {Label} from "./ui/label.tsx";

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: unknown) => void;
  task?: Task | null;
}

const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  task
}) => {
  const [activeTab, setActiveTab] = useState('channels');
  const [channelSearch, setChannelSearch] = useState('');
  const [gameSearch, setGameSearch] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    channel_ids: [] as number[],
    game_ids: [] as number[],
    schedule_type: 'interval',
    schedule_value: '3600',
    storage_limit_gb: '',
    retention_days: '',
    auto_delete: false,
    priority: 'low',
    conditions: {} as TaskConditions,
    restrictions: {} as TaskRestrictions
  });

  // Fetch all channels and games
  const { data: channels, isLoading: channelsLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels()
  });

  const { data: games, isLoading: gamesLoading } = useQuery({
    queryKey: ['games'],
    queryFn: () => api.getGames()
  });

  // Fetch task details if editing
  const { data: taskDetails } = useQuery({
    queryKey: ['taskDetails', task?.id],
    queryFn: () => task ? api.getTaskDetails(task.id) : null,
    enabled: !!task
  });

  // Filter channels and games based on search
  const filteredChannels = channels?.filter(channel =>
    channel.display_name?.toLowerCase().includes(channelSearch.toLowerCase()) ||
    channel.username.toLowerCase().includes(channelSearch.toLowerCase())
  ) || [];

  const filteredGames = games?.filter(game =>
    game.name.toLowerCase().includes(gameSearch.toLowerCase())
  ) || [];

  useEffect(() => {
    if (isOpen && task) {
      setFormData({
        name: task.name,
        description: task.description || '',
        channel_ids: task.channel_ids,
        game_ids: task.game_ids,
        schedule_type: task.schedule_type,
        schedule_value: task.schedule_value,
        storage_limit_gb: task.storage_limit_gb?.toString() || '',
        retention_days: task.retention_days?.toString() || '',
        auto_delete: task.auto_delete,
        priority: task.priority,
        conditions: task.conditions || {},
        restrictions: task.restrictions || {}
      });
    } else {
      setFormData({
        name: '',
        description: '',
        channel_ids: [],
        game_ids: [],
        schedule_type: 'interval',
        schedule_value: '3600',
        storage_limit_gb: '',
        retention_days: '',
        auto_delete: false,
        priority: 'low',
        conditions: {},
        restrictions: {}
      });
    }
    setActiveTab('channels');
    setChannelSearch('');
    setGameSearch('');
  }, [isOpen, task]);

  const handleChannelToggle = (channelId: number) => {
    setFormData(prev => ({
      ...prev,
      channel_ids: prev.channel_ids.includes(channelId)
        ? prev.channel_ids.filter(id => id !== channelId)
        : [...prev.channel_ids, channelId]
    }));
  };

  const handleGameToggle = (gameId: number) => {
    setFormData(prev => ({
      ...prev,
      game_ids: prev.game_ids.includes(gameId)
        ? prev.game_ids.filter(id => id !== gameId)
        : [...prev.game_ids, gameId]
    }));
  };

  const handleSubmit = () => {
    onSubmit({
      ...formData,
      storage_limit_gb: formData.storage_limit_gb ? parseInt(formData.storage_limit_gb) : null,
      retention_days: formData.retention_days ? parseInt(formData.retention_days) : null,
      conditions: Object.keys(formData.conditions).length > 0 ? formData.conditions : undefined,
      restrictions: Object.keys(formData.restrictions).length > 0 ? formData.restrictions : undefined
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[1000px] max-h-[90vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                {task ? 'Edit Task' : 'Create New Task'}
              </DialogTitle>
              <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {formData.channel_ids.length} channels
                </span>
                <span className="flex items-center gap-1">
                  <Gamepad2 className="h-4 w-4" />
                  {formData.game_ids.length} games
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Optional Name and Description */}
        <div className="space-y-4 py-4">
          <div>
            <Input
              placeholder="Task name (optional - will be auto-generated if empty)"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <Textarea
              placeholder="Task description (optional - will be auto-generated if empty)"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="channels" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Channels
            </TabsTrigger>
            <TabsTrigger value="games" className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4" />
              Games
            </TabsTrigger>
            <TabsTrigger value="conditions" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Conditions
            </TabsTrigger>
            <TabsTrigger value="restrictions" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Restrictions
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Channels Tab */}
          <TabsContent value="channels">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search channels..."
                  value={channelSearch}
                  onChange={(e) => setChannelSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="grid grid-cols-5 gap-4 max-h-[400px] overflow-y-auto">
                {channelsLoading ? (
                  Array(4).fill(0).map((_, i) => (
                    <div key={i} className="animate-pulse flex p-4 border rounded-lg">
                      <div className="h-10 w-10 bg-gray-200 rounded-full" />
                      <div className="ml-3 space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  ))
                ) : filteredChannels.length === 0 ? (
                  <div className="col-span-2 text-center py-8 text-gray-500">
                    No channels found
                  </div>
                ) : (
                  filteredChannels.map(channel => (
                    <div
                      key={channel.id}
                      onClick={() => handleChannelToggle(channel.id)}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.channel_ids.includes(channel.id)
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={channel.profile_image_url} alt={channel.display_name} />
                        <AvatarFallback>
                          {(channel.display_name || channel.username)[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {channel.display_name || channel.username}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          @{channel.username}
                        </p>
                      </div>
                      {formData.channel_ids.includes(channel.id) && (
                        <Check className="h-5 w-5 text-purple-600" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Games Tab */}
          <TabsContent value="games">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search games..."
                  value={gameSearch}
                  onChange={(e) => setGameSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="grid grid-cols-6 gap-4 max-h-[400px] overflow-y-auto">
                {gamesLoading ? (
                  Array(6).fill(0).map((_, i) => (
                    <div key={i} className="animate-pulse flex flex-col p-4 border rounded-lg">
                      <div className="h-32 bg-gray-200 rounded mb-2" />
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                    </div>
                  ))
                ) : filteredGames.length === 0 ? (
                  <div className="col-span-3 text-center py-8 text-gray-500">
                    No games found
                  </div>
                ) : (
                  filteredGames.map(game => (
                    <div
                      key={game.id}
                      onClick={() => handleGameToggle(game.id)}
                      className={`relative border rounded-lg cursor-pointer transition-colors ${
                        formData.game_ids.includes(game.id)
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="p-3">
                        <div className="w-full h-32 mb-2 bg-gray-100 rounded overflow-hidden">
                          <img
                            src={game.box_art_url}
                            alt={game.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/api/placeholder/285/380';
                            }}
                          />
                        </div>
                        <p className="font-medium truncate">{game.name}</p>
                      </div>
                      {formData.game_ids.includes(game.id) && (
                        <div className="absolute top-2 right-2">
                          <Check className="h-5 w-5 text-purple-600" />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Conditions Tab */}
          <TabsContent value="conditions">
            <ConditionsTab
              conditions={formData.conditions}
              onChange={(conditions) => setFormData(prev => ({ ...prev, conditions }))}
            />
          </TabsContent>

          {/* Restrictions Tab */}
          <TabsContent value="restrictions">
            <RestrictionsTab
              restrictions={formData.restrictions}
              onChange={(restrictions) => setFormData(prev => ({ ...prev, restrictions }))}
              currentStorage={taskDetails?.storage}
            />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Schedule Type</Label>
                <select
                  value={formData.schedule_type}
                  onChange={e => setFormData(prev => ({ ...prev, schedule_type: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="interval">Interval</option>
                  <option value="cron">Cron</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>
                  {formData.schedule_type === 'interval' ? 'Interval (seconds)' : 'Cron Expression'}
                </Label>
                <Input
                  type={formData.schedule_type === 'interval' ? 'number' : 'text'}
                  value={formData.schedule_value}
                  onChange={e => setFormData(prev => ({ ...prev, schedule_value: e.target.value }))}
                  placeholder={formData.schedule_type === 'interval' ? '3600' : '0 */6 * * *'}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Storage Limit (GB)</Label>
                <Input
                  type="number"
                  value={formData.storage_limit_gb}
                  onChange={e => setFormData(prev => ({ ...prev, storage_limit_gb: e.target.value }))}
                  placeholder="Optional"
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <Label>Retention Period (days)</Label>
                <Input
                  type="number"
                  value={formData.retention_days}
                  onChange={e => setFormData(prev => ({ ...prev, retention_days: e.target.value }))}
                  placeholder="Optional"
                  min="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.auto_delete}
                  onChange={e => setFormData(prev => ({ ...prev, auto_delete: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Auto-delete files after retention period</span>
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Priority Level</Label>
              <select
                value={formData.priority}
                onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                className="w-full p-2 border rounded-lg"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </TabsContent>
        </Tabs>

        {/* Summary */}
        <div className="mt-6 bg-gray-50 -mx-6 -mb-6 p-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex gap-4 text-sm text-gray-600">
              {formData.schedule_type === 'interval' && (
                <span>Every {parseInt(formData.schedule_value) / 3600} hours</span>
              )}
              {formData.schedule_type === 'cron' && (
                <span>Custom schedule</span>
              )}
              {formData.schedule_type === 'manual' && (
                <span>Manual execution</span>
              )}
              {formData.storage_limit_gb && (
                <span>{formData.storage_limit_gb}GB limit</span>
              )}
              {formData.retention_days && (
                <span>{formData.retention_days} days retention</span>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                disabled={formData.channel_ids.length === 0 && formData.game_ids.length === 0}
              >
                {task ? 'Update Task' : 'Create Task'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskModal;

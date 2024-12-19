import React, { useState, useEffect } from 'react';
import { Users, Gamepad2, Settings, Search, Check, Filter, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ConditionsTab from './TaskModal/ConditionsTab';
import RestrictionsTab from './TaskModal/RestrictionsTab';
import type { Task, TaskConditions, TaskRestrictions } from '@/types/task';
import { Label } from "./ui/label";

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

  // Fetch channels and games
  const {data: channels, isLoading: channelsLoading} = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels()
  });

  const {data: games, isLoading: gamesLoading} = useQuery({
    queryKey: ['games'],
    queryFn: () => api.getGames()
  });

  // Fetch task details if editing
  const {data: taskDetails} = useQuery({
    queryKey: ['taskDetails', task?.id],
    queryFn: () => task ? api.getTaskDetails(task.id) : null,
    enabled: !!task
  });

  const filteredChannels = React.useMemo(() => {
    return channels?.filter(channel =>
        channel.display_name?.toLowerCase().includes(channelSearch.toLowerCase()) ||
        channel.username.toLowerCase().includes(channelSearch.toLowerCase())
    ) || [];
  }, [channels, channelSearch]);

  const filteredGames = React.useMemo(() => {
    return games?.filter(game =>
        game.name.toLowerCase().includes(gameSearch.toLowerCase())
    ) || [];
  }, [games, gameSearch]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
        <DialogContent className="w-[1200px] h-[800px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex flex-col">
                <span>{task ? 'Edit Task' : 'Create New Task'}</span>
                <div className="flex gap-4 mt-2">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Users className="h-3 w-3"/>
                    {formData.channel_ids.length} channels
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Gamepad2 className="h-3 w-3"/>
                    {formData.game_ids.length} games
                  </Badge>
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4 px-1">
              <Input
                  placeholder="Task name (optional)"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({...prev, name: e.target.value}))}
                  className="w-full"
              />
              <Textarea
                  placeholder="Task description (optional)"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({...prev, description: e.target.value}))}
                  className="w-full"
              />
            </div>

            <div className="flex-1 mt-6 overflow-hidden">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className="w-full">
                  <TabsTrigger value="channels" className="flex items-center gap-2">
                    <Users className="h-4 w-4"/>
                    Channels
                  </TabsTrigger>
                  <TabsTrigger value="games" className="flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4"/>
                    Games
                  </TabsTrigger>
                  <TabsTrigger value="conditions" className="flex items-center gap-2">
                    <Filter className="h-4 w-4"/>
                    Conditions
                  </TabsTrigger>
                  <TabsTrigger value="restrictions" className="flex items-center gap-2">
                    <Shield className="h-4 w-4"/>
                    Restrictions
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4"/>
                    Settings
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-hidden">
                  <TabsContent value="channels" className="h-[460px] overflow-auto mt-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                      <Input
                          placeholder="Search channels..."
                          value={channelSearch}
                          onChange={e => setChannelSearch(e.target.value)}
                          className="pl-10"
                      />
                    </div>

                    <div
                        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto p-1 mt-4">
                      {channelsLoading ? (
                          Array(8).fill(0).map((_, i) => (
                              <div key={i} className="animate-pulse flex p-4 border rounded-lg">
                                <div className="h-10 w-10 bg-muted rounded-full"/>
                                <div className="ml-3 space-y-2 flex-1">
                                  <div className="h-4 bg-muted rounded w-3/4"/>
                                  <div className="h-3 bg-muted rounded w-1/2"/>
                                </div>
                              </div>
                          ))
                      ) : filteredChannels.length === 0 ? (
                          <div className="col-span-full text-center py-8 text-muted-foreground">
                            No channels found
                          </div>
                      ) : (
                          filteredChannels.map(channel => (
                              <button
                                  key={channel.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => ({
                                      ...prev,
                                      channel_ids: prev.channel_ids.includes(channel.id)
                                          ? prev.channel_ids.filter(id => id !== channel.id)
                                          : [...prev.channel_ids, channel.id]
                                    }));
                                  }}
                                  className={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${
                                      formData.channel_ids.includes(channel.id)
                                          ? 'border-purple-500 bg-purple-50/50'
                                          : 'border-border hover:bg-accent'
                                  }`}
                              >
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={channel.profile_image_url}/>
                                  <AvatarFallback>
                                    {channel.display_name?.[0] || channel.username[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">
                                    {channel.display_name || channel.username}
                                  </p>
                                  <p className="text-sm text-muted-foreground truncate">
                                    @{channel.username}
                                  </p>
                                </div>
                                {formData.channel_ids.includes(channel.id) && (
                                    <Check className="h-4 w-4 text-purple-500 shrink-0"/>
                                )}
                              </button>
                          ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="games" className="h-[460px] overflow-auto mt-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                      <Input
                          placeholder="Search games..."
                          value={gameSearch}
                          onChange={e => setGameSearch(e.target.value)}
                          className="pl-10"
                      />
                    </div>

                    <div
                        className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[400px] overflow-y-auto p-1 mt-4">
                      {gamesLoading ? (
                          Array(12).fill(0).map((_, i) => (
                              <div key={i} className="animate-pulse flex flex-col border rounded-lg p-2">
                                <div className="h-32 bg-muted rounded mb-2"/>
                                <div className="h-4 bg-muted rounded w-3/4"/>
                              </div>
                          ))
                      ) : filteredGames.length === 0 ? (
                          <div className="col-span-full text-center py-8 text-muted-foreground">
                            No games found
                          </div>
                      ) : (
                          filteredGames.map(game => (
                              <button
                                  key={game.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => ({
                                      ...prev,
                                      game_ids: prev.game_ids.includes(game.id)
                                          ? prev.game_ids.filter(id => id !== game.id)
                                          : [...prev.game_ids, game.id]
                                    }));
                                  }}
                                  className={`relative border rounded-lg p-2 text-left transition-colors ${
                                      formData.game_ids.includes(game.id)
                                          ? 'border-purple-500 bg-purple-50/50'
                                          : 'border-border hover:bg-accent'
                                  }`}
                              >
                                <div className="w-full aspect-[285/380] bg-accent rounded overflow-hidden mb-2">
                                  <img
                                      src={game.box_art_url}
                                      alt={game.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = '/api/placeholder/285/380';
                                      }}
                                  />
                                </div>
                                {formData.game_ids.includes(game.id) && (
                                    <div className="absolute top-2 right-2">
                                      <div className="bg-purple-500 rounded-full p-1">
                                        <Check className="h-3 w-3 text-white"/>
                                      </div>
                                    </div>
                                )}
                              </button>
                          ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="conditions" className="h-[460px] overflow-auto mt-4">
                    <ConditionsTab
                        conditions={formData.conditions}
                        onChange={conditions => setFormData(prev => ({...prev, conditions}))}
                    />
                  </TabsContent>

                  <TabsContent value="restrictions" className="h-[460px] overflow-auto mt-4">
                    <RestrictionsTab
                        restrictions={formData.restrictions}
                        onChange={restrictions => setFormData(prev => ({...prev, restrictions}))}
                        currentStorage={taskDetails?.storage}
                    />
                  </TabsContent>

                  <TabsContent value="settings" className="h-[460px] overflow-auto mt-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Schedule Type</Label>
                          <Select
                              value={formData.schedule_type}
                              onValueChange={(value) => setFormData(prev => ({
                                ...prev,
                                schedule_type: value,
                                schedule_value: value === 'interval' ? '3600' : ''
                              }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select schedule type"/>
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
                            {formData.schedule_type === 'interval'
                                ? 'Interval (seconds)'
                                : formData.schedule_type === 'cron'
                                    ? 'Cron Expression'
                                    : 'Schedule Value'}
                          </Label>
                          <Input
                              type={formData.schedule_type === 'interval' ? 'number' : 'text'}
                              value={formData.schedule_value}
                              onChange={e => setFormData(prev => ({
                                ...prev,
                                schedule_value: e.target.value
                              }))}
                              placeholder={
                                formData.schedule_type === 'interval'
                                    ? '3600'
                                    : formData.schedule_type === 'cron'
                                        ? '0 */6 * * *'
                                        : ''
                              }
                              disabled={formData.schedule_type === 'manual'}
                          />
                          {formData.schedule_type === 'interval' && (
                              <p className="text-sm text-muted-foreground">
                                {(parseInt(formData.schedule_value) / 3600).toFixed(1)} hours
                              </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Priority Level</Label>
                          <Select
                              value={formData.priority}
                              onValueChange={(value) => setFormData(prev => ({
                                ...prev,
                                priority: value
                              }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority"/>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Storage Limit (GB)</Label>
                          <Input
                              type="number"
                              value={formData.storage_limit_gb}
                              onChange={e => setFormData(prev => ({
                                ...prev,
                                storage_limit_gb: e.target.value
                              }))}
                              placeholder="Optional"
                              min="0"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Retention Period (days)</Label>
                        <Input
                            type="number"
                            value={formData.retention_days}
                            onChange={e => setFormData(prev => ({
                              ...prev,
                              retention_days: e.target.value
                            }))}
                            placeholder="Optional"
                            min="0"
                        />
                      </div>

                      <div className="space-y-4">
                        <Label className="flex items-center gap-2">
                          <input
                              type="checkbox"
                              checked={formData.auto_delete}
                              onChange={e => setFormData(prev => ({
                                ...prev,
                                auto_delete: e.target.checked
                              }))}
                              className="rounded border-input h-4 w-4 text-purple-600 focus:ring-purple-500"
                          />
                          <span>Auto-delete files after retention period</span>
                        </Label>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <div className="mt-6 border-t pt-4 flex items-center justify-between">
              <div className="flex gap-4 text-sm text-muted-foreground">
                {formData.schedule_type === 'interval' && (
                    <span className="flex items-center gap-1">
                <Settings className="h-4 w-4"/>
                Every {(parseInt(formData.schedule_value) / 3600).toFixed(1)} hours
              </span>
                )}
                {formData.storage_limit_gb && (
                    <span className="flex items-center gap-1">
                <Shield className="h-4 w-4"/>
                      {formData.storage_limit_gb}GB limit
              </span>
                )}
                {formData.retention_days && (
                    <span className="flex items-center gap-1">
                <Filter className="h-4 w-4"/>
                      {formData.retention_days} days retention
              </span>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                >
                  Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={formData.channel_ids.length === 0 && formData.game_ids.length === 0}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {task ? 'Update Task' : 'Create Task'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
  );
}

export default TaskModal;

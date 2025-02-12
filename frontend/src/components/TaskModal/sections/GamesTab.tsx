// Filepath: frontend/src/components/TaskModal/sections/GamesTab.tsx

import React, { useState } from 'react';
import { Search, Check } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Game } from '@/types/task';

interface GamesTabProps {
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

const GamesTab: React.FC<GamesTabProps> = ({
  selectedIds,
  onSelectionChange
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: () => api.getGames()
  });

  const filteredGames = React.useMemo(() => {
    return games.filter(game =>
      game.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [games, searchQuery]);

  const handleGameToggle = (gameId: number) => {
    const newIds = selectedIds.includes(gameId)
      ? selectedIds.filter(id => id !== gameId)
      : [...selectedIds, gameId];
    onSelectionChange(newIds);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
        <Input
          placeholder="Search games..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[400px] overflow-y-auto p-1">
        {isLoading ? (
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
              onClick={() => handleGameToggle(game.id)}
              className={`relative border rounded-lg p-2 text-left transition-colors ${
                selectedIds.includes(game.id)
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
              <p className="text-sm font-medium truncate">
                {game.name}
              </p>
              {selectedIds.includes(game.id) && (
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
    </div>
  );
};

export default GamesTab;

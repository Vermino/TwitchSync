// Filepath: frontend/src/pages/Games.tsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Trash2, CheckCircle, XCircle } from 'lucide-react';
import GameSearchModal from '../components/GameSearchModal';
import { api } from '../lib/api';
import { ErrorBoundary } from 'react-error-boundary';

interface Game {
  id: number;
  twitch_game_id: string;
  name: string;
  box_art_url?: string;
  is_active: boolean;
  last_checked: string | null;
  created_at: string;
}

// Constants for box art dimensions
const BOX_ART_DIMENSIONS = {
  THUMBNAIL: { width: 52, height: 72 },
  DEFAULT: { width: 285, height: 380 }
};

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600"></div>
  </div>
);

const ErrorDisplay: React.FC<{ error: Error }> = ({ error }) => (
  <div className="p-4">
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
      {error.message}
    </div>
  </div>
);

const Games = () => {
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch games
  const { data: games, isLoading, error } = useQuery({
    queryKey: ['games'],
    queryFn: () => api.getGames(),
  });

  // Add game mutation
  const addGameMutation = useMutation({
    mutationFn: (selectedGames: Array<{ id: string; name: string; box_art_url: string }>) =>
      Promise.all(selectedGames.map(game =>
        api.createGame({
          twitch_game_id: game.id,
          name: game.name,
          box_art_url: game.box_art_url,
        })
      )),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
      setIsSearchModalOpen(false);
    },
  });

  // Delete game mutation
  const deleteGameMutation = useMutation({
    mutationFn: (id: number) => api.deleteGame(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
  });

  // Toggle game status mutation
  const toggleGameMutation = useMutation({
    mutationFn: ({ id, currentStatus }: { id: number; currentStatus: boolean }) =>
      api.updateGame(id, { is_active: !currentStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
  });

  const formatBoxArtUrl = (url: string | undefined, dimensions: { width: number; height: number }) => {
    if (!url) {
      return `/api/placeholder/${dimensions.width}/${dimensions.height}`;
    }

    // Check if URL already has dimensions
    if (url.includes('http') && !url.includes('{width}x{height}')) {
      return url;
    }

    return url.replace('{width}x{height}', `${dimensions.width}x${dimensions.height}`);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, dimensions: { width: number; height: number }) => {
    e.currentTarget.src = `/api/placeholder/${dimensions.width}/${dimensions.height}`;
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={error as Error} />;

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Games</h1>
        <button
          onClick={() => setIsSearchModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          <PlusCircle className="w-5 h-5" />
          Add Games
        </button>
      </div>

      {/* Games Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Game</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Twitch ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {games && games.length > 0 ? (
              games.map((game) => (
                <tr key={game.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="h-[72px] w-[52px] flex-shrink-0 overflow-hidden rounded">
                        <img
                          src={formatBoxArtUrl(game.box_art_url, BOX_ART_DIMENSIONS.THUMBNAIL)}
                          alt={game.name}
                          className="h-full w-full object-cover"
                          style={{ aspectRatio: '52/72' }}
                          onError={(e) => handleImageError(e, BOX_ART_DIMENSIONS.THUMBNAIL)}
                          loading="lazy"
                        />
                      </div>
                      <div className="text-sm font-medium text-gray-900">{game.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{game.twitch_game_id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleGameMutation.mutate({
                        id: game.id,
                        currentStatus: game.is_active,
                      })}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        game.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {game.is_active ? (
                        <CheckCircle className="w-4 h-4 mr-1" />
                      ) : (
                        <XCircle className="w-4 h-4 mr-1" />
                      )}
                      {game.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {new Date(game.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => deleteGameMutation.mutate(game.id)}
                      className="text-red-600 hover:text-red-900 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No games added yet. Click &#34;Add Games&#34; to start tracking games!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Game Search Modal */}
      <GameSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelect={(selectedGames) => addGameMutation.mutate(selectedGames)}
        allowMultiple={true}
        existingGames={games}  // Pass the entire games array
      />
    </div>
  );
};

// Wrap with error boundary
export default function GamesWrapper() {
  return (
    <ErrorBoundary FallbackComponent={ErrorDisplay}>
      <Games />
    </ErrorBoundary>
  );
}

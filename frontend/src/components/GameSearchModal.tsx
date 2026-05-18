// Filepath: frontend/src/components/GameSearchModal.tsx

import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Check,
  X,
  Loader2
} from 'lucide-react';
import { api } from '../lib/api';

interface Game {
  id: string;
  name: string;
  box_art_url: string;
}

interface GameSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (games: Game[]) => void;
  allowMultiple?: boolean;
  existingGames?: Array<{ twitch_game_id: string }>;
}

const formatBoxArtUrl = (url: string | undefined, width: number, height: number) => {
  if (!url) {
    return '';
  }

  return url.replace('{width}x{height}', `${width}x${height}`);
};

const GameSearchModal: React.FC<GameSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  allowMultiple = false,
  existingGames = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedGames([]);
      setSearchResults([]);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const searchGames = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await api.searchTwitchGames(searchTerm);
        // Filter out existing games
        const filteredData = data.filter(
          game => !existingGames?.some(existing => existing.twitch_game_id === game.id)
        );
        setSearchResults(filteredData);
      } catch (err) {
        setError('Failed to search games. Please try again.');
        console.error('Game search error:', err);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      if (searchTerm) {
        searchGames();
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchTerm, existingGames]);

  const handleSelectGame = (game: Game) => {
    if (allowMultiple) {
      setSelectedGames(prev => {
        const isSelected = prev.some(g => g.id === game.id);
        if (isSelected) {
          return prev.filter(g => g.id !== game.id);
        } else {
          return [...prev, game];
        }
      });
    } else {
      setSelectedGames([game]);
    }
  };

  const handleSubmit = () => {
    onSelect(selectedGames.map(game => ({
      id: game.id,
      name: game.name,
      box_art_url: game.box_art_url.replace('-52x72', '-285x380') // Ensure we store high-res version
    })));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div data-testid="game-search-modal" className="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">Search Games</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for games..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              data-testid="game-search-input"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : error ? (
            <div className="p-4 text-red-600 text-center">{error}</div>
          ) : searchResults.length === 0 ? (
            <div className="p-4 text-gray-500 text-center">
              {searchTerm ? 'No games found' : 'Start typing to search for games'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {searchResults.map(game => (
                <div
                  key={game.id}
                  onClick={() => handleSelectGame(game)}
                  data-testid={`game-search-result-${game.id}`}
                  className={`flex items-start gap-3 overflow-hidden rounded-lg border p-3 transition-colors ${
                    selectedGames.some(g => g.id === game.id)
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  } cursor-pointer`}
                >
                  {game.box_art_url && (
                    <img
                      src={formatBoxArtUrl(game.box_art_url, 104, 144)}
                      alt={game.name}
                      data-testid={`game-search-art-${game.id}`}
                      className="h-24 w-16 flex-shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{game.name}</div>
                  </div>
                  {selectedGames.some(g => g.id === game.id) && (
                    <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-600" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t p-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedGames.length === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add {selectedGames.length} {selectedGames.length === 1 ? 'Game' : 'Games'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameSearchModal;

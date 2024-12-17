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
}

const GameSearchModal: React.FC<GameSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  allowMultiple = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setSearchResults(data);
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
  }, [searchTerm]);

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
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
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[60vh]">
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
            <div className="grid grid-cols-2 gap-4 p-4">
              {searchResults.map(game => (
                <div
                  key={game.id}
                  onClick={() => handleSelectGame(game)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                    selectedGames.some(g => g.id === game.id)
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {game.box_art_url && (
                    <img
                      src={game.box_art_url}
                      alt={game.name}
                      className="w-13 h-18 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{game.name}</div>
                  </div>
                  {selectedGames.some(g => g.id === game.id) && (
                    <Check className="w-5 h-5 text-purple-600" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-3">
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

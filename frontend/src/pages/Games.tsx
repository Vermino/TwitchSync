import React, { useState, useEffect } from 'react';
import { PlusCircle, Trash2, CheckCircle, XCircle } from 'lucide-react';
import GameSearchModal from '../components/GameSearchModal';

interface Game {
  id: number;
  twitch_game_id: string;
  name: string;
  is_active: boolean;
  last_checked: string | null;
  created_at: string;
}

const Games = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/games');
      const data = await response.json();
      setGames(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch games');
      console.error('Error fetching games:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGames = async (selectedGames: Array<{ id: string, name: string }>) => {
    try {
      const responses = await Promise.all(
        selectedGames.map(game =>
          fetch('/api/games', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              twitch_game_id: game.id,
              name: game.name
            }),
          })
        )
      );

      const newGames = await Promise.all(
        responses.map(response => {
          if (!response.ok) throw new Error('Failed to add game');
          return response.json();
        })
      );

      setGames(prevGames => [...prevGames, ...newGames]);
      setError(null);
    } catch (err) {
      setError('Failed to add games');
      console.error('Error adding games:', err);
    }
  };

  const deleteGame = async (id: number) => {
    try {
      const response = await fetch(`/api/games/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete game');

      setGames(games.filter(game => game.id !== id));
      setError(null);
    } catch (err) {
      setError('Failed to delete game');
      console.error('Error deleting game:', err);
    }
  };

  const toggleGameStatus = async (id: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/games/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (!response.ok) throw new Error('Failed to update game');

      const updatedGame = await response.json();
      setGames(games.map(game =>
        game.id === id ? updatedGame : game
      ));
      setError(null);
    } catch (err) {
      setError('Failed to update game');
      console.error('Error updating game:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Games</h1>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      </div>
    );
  }

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

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Games Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Game Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Twitch ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Added</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {games.map((game) => (
              <tr key={game.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{game.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">{game.twitch_game_id}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => toggleGameStatus(game.id, game.is_active)}
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
                    onClick={() => deleteGame(game.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {games.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No games added yet. Click "Add Games" to start tracking games!
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
        onSelect={handleAddGames}
        allowMultiple={true}
      />
    </div>
  );
};

export default Games;

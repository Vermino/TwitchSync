import React, { useState } from 'react';
import { Search, Plus, X } from 'lucide-react';

export interface WatchConfigProps {
  onSave: (config: {
    channels: string[];
    games: string[];
    historyDays: number;
    syncForward: boolean;
  }) => void;
}

const WatchConfig: React.FC<WatchConfigProps> = ({ onSave }) => {
  const [channels, setChannels] = useState<string[]>([]);
  const [games, setGames] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState('');
  const [newGame, setNewGame] = useState('');
  const [historyDays, setHistoryDays] = useState(0);
  const [syncForward, setSyncForward] = useState(true);

  const handleAddChannel = () => {
    if (newChannel && !channels.includes(newChannel)) {
      setChannels([...channels, newChannel]);
      setNewChannel('');
    }
  };

  const handleAddGame = () => {
    if (newGame && !games.includes(newGame)) {
      setGames([...games, newGame]);
      setNewGame('');
    }
  };

  const handleRemoveChannel = (channel: string) => {
    setChannels(channels.filter(c => c !== channel));
  };

  const handleRemoveGame = (game: string) => {
    setGames(games.filter(g => g !== game));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      channels,
      games,
      historyDays,
      syncForward
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Channels Section */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Watch Channels</h3>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              placeholder="Enter channel name"
              className="flex-1 p-2 border rounded"
            />
            <button
              type="button"
              onClick={handleAddChannel}
              className="bg-purple-600 text-white p-2 rounded hover:bg-purple-700"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {channels.map(channel => (
              <div key={channel} className="flex items-center bg-purple-100 px-3 py-1 rounded">
                <span>{channel}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveChannel(channel)}
                  className="ml-2 text-purple-600 hover:text-purple-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Games Section */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Watch Games</h3>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              placeholder="Enter game name"
              className="flex-1 p-2 border rounded"
            />
            <button
              type="button"
              onClick={handleAddGame}
              className="bg-purple-600 text-white p-2 rounded hover:bg-purple-700"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {games.map(game => (
              <div key={game} className="flex items-center bg-purple-100 px-3 py-1 rounded">
                <span>{game}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveGame(game)}
                  className="ml-2 text-purple-600 hover:text-purple-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sync Options */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Sync Options</h3>

          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              id="syncHistory"
              checked={historyDays > 0}
              onChange={(e) => setHistoryDays(e.target.checked ? 30 : 0)}
              className="rounded border-gray-300"
            />
            <div className="flex items-center gap-2">
              <label htmlFor="syncHistory">Sync past VODs for</label>
              <input
                type="number"
                value={historyDays}
                onChange={(e) => setHistoryDays(parseInt(e.target.value) || 0)}
                min="0"
                max="90"
                disabled={historyDays === 0}
                className="w-16 p-1 border rounded"
              />
              <span>days</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              id="syncForward"
              checked={syncForward}
              onChange={(e) => setSyncForward(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="syncForward">Continue syncing new VODs</label>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 flex items-center justify-center gap-2"
        >
          <Search className="w-5 h-5" />
          Start Watching
        </button>
      </form>
    </div>
  );
};

export default WatchConfig;

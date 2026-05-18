// frontend/src/components/ui/GameBox.tsx
import React from 'react';

interface Game {
    id: string;
    name: string;
    box_art_url: string;
}

export const GameBox: React.FC<{ game: Game; className?: string; showName?: boolean }> = ({ game, className = "", showName = true }) => {
    if (!game?.box_art_url) return <span className="text-gray-500">No data</span>;

    // Twitch API returns box art with {width} and {height} placeholders
    const boxArtUrl = game.box_art_url
        .replace('{width}', '144')
        .replace('{height}', '192')
        .replace('%{width}', '144')
        .replace('%{height}', '192');

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <img
                src={boxArtUrl}
                alt={game.name}
                className="w-8 h-10 rounded border border-gray-200"
                title={!showName ? game.name : undefined}
            />
            {showName && <span className="text-sm text-gray-900 font-medium">{game.name}</span>}
        </div>
    );
};

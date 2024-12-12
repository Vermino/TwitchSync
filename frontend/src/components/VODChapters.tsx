import React from 'react';
import { Clock, Gamepad } from 'lucide-react';
import type { Chapter } from '@/types';

interface VODChaptersProps {
  chapters: Chapter[];
  onReanalyze?: () => void;
  isAnalyzing?: boolean;
}

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs]
    .map(v => v.toString().padStart(2, '0'))
    .join(':');
};

const VODChapters: React.FC<VODChaptersProps> = ({
  chapters,
  onReanalyze,
  isAnalyzing = false
}) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Chapters</h3>
        {onReanalyze && (
          <button
            onClick={onReanalyze}
            disabled={isAnalyzing}
            className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700
                     disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Analyzing...
              </>
            ) : (
              'Reanalyze'
            )}
          </button>
        )}
      </div>

      {chapters.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No chapters found for this VOD
        </div>
      ) : (
        <div className="space-y-2">
          {chapters.map((chapter, index) => (
            <div
              key={index}
              className="bg-white p-4 rounded-lg shadow border border-gray-200"
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium">{chapter.title}</h4>
                {chapter.game_id && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs
                                 bg-purple-100 text-purple-800">
                    <Gamepad className="w-3 h-3 mr-1" />
                    {chapter.game_id}
                  </span>
                )}
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <Clock className="w-4 h-4 mr-1" />
                {formatTime(chapter.start_time)} - {formatTime(chapter.end_time)}
                <span className="mx-2">•</span>
                Duration: {formatTime(chapter.end_time - chapter.start_time)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VODChapters;

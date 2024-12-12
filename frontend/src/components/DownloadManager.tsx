import React, { useState, useEffect } from 'react';
import { Download, X, RefreshCw, Pause, Play, Trash2 } from 'lucide-react';

interface DownloadItem {
  id: number;
  vod_id: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  filename: string;
  speed: string;
  remaining: string;
  error?: string;
}

const DownloadManager: React.FC = () => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const fetchDownloads = async () => {
      try {
        const response = await fetch('/api/downloads');
        if (!response.ok) throw new Error('Failed to fetch downloads');
        const data = await response.json();
        setDownloads(data);
      } catch (error) {
        console.error('Error fetching downloads:', error);
      }
    };

    // Initial fetch
    fetchDownloads();

    // Poll for updates
    const interval = setInterval(fetchDownloads, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (id: number) => {
    try {
      await fetch(`/api/downloads/${id}/retry`, { method: 'POST' });
      // Update will come through polling
    } catch (error) {
      console.error('Error retrying download:', error);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await fetch(`/api/downloads/${id}/cancel`, { method: 'POST' });
      // Update will come through polling
    } catch (error) {
      console.error('Error canceling download:', error);
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await fetch(`/api/downloads/${id}`, { method: 'DELETE' });
      setDownloads(downloads.filter(d => d.id !== id));
    } catch (error) {
      console.error('Error removing download:', error);
    }
  };

  if (downloads.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 right-0 w-96 bg-white shadow-lg rounded-t-lg overflow-hidden">
      {/* Header */}
      <div
        className="bg-purple-600 text-white p-3 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5" />
          <span className="font-medium">Downloads</span>
          <span className="bg-white text-purple-600 px-2 rounded-full text-sm">
            {downloads.filter(d => d.status === 'downloading').length}
          </span>
        </div>
        {expanded ? (
          <X className="w-5 h-5 cursor-pointer" />
        ) : (
          <div className="w-5 h-5" />
        )}
      </div>

      {/* Download List */}
      {expanded && (
        <div className="max-h-96 overflow-y-auto">
          {downloads.map((download) => (
            <div key={download.id} className="p-3 border-b">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="font-medium truncate">{download.filename}</div>
                  {download.status === 'downloading' && (
                    <div className="text-sm text-gray-500">
                      {download.speed} - {download.remaining} remaining
                    </div>
                  )}
                  {download.status === 'failed' && (
                    <div className="text-sm text-red-500">{download.error}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {download.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(download.id)}
                      className="text-purple-600 hover:text-purple-800"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  {download.status === 'downloading' && (
                    <button
                      onClick={() => handleCancel(download.id)}
                      className="text-purple-600 hover:text-purple-800"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  {download.status === 'completed' && (
                    <button
                      onClick={() => handleRemove(download.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {download.status === 'downloading' && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 rounded-full h-2 transition-all duration-300"
                    style={{ width: `${download.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DownloadManager;

// Filepath: frontend/src/components/FileBrowser.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Folder, ChevronRight, ArrowLeft, HardDrive, Check, X, RefreshCw, AlertCircle } from 'lucide-react';

interface BrowseEntry {
    name: string;
    path: string;
    type: 'directory' | 'drive';
}

interface BrowseResult {
    path: string;
    parent: string | null;
    entries: BrowseEntry[];
    separator: string;
}

interface FileBrowserProps {
    initialPath?: string;
    onSelect: (path: string) => void;
    onClose: () => void;
    title?: string;
}

const FileBrowser: React.FC<FileBrowserProps> = ({ initialPath, onSelect, onClose, title = 'Select Folder' }) => {
    const [currentPath, setCurrentPath] = useState<string>(initialPath || '');
    const [result, setResult] = useState<BrowseResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manualPath, setManualPath] = useState(initialPath || '');

    const browse = useCallback(async (targetPath: string) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (targetPath) params.set('path', targetPath);
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/settings/browse?${params}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Failed to browse' }));
                throw new Error(err.error || 'Failed to browse');
            }
            const data: BrowseResult = await res.json();
            setResult(data);
            setCurrentPath(data.path);
            setManualPath(data.path);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        browse(initialPath || '');
    }, []);

    const handleEntryClick = (entry: BrowseEntry) => {
        browse(entry.path);
    };

    const handleUp = () => {
        if (result?.parent != null) {
            browse(result.parent);
        }
    };

    const handleManualNavigate = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            browse(manualPath);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: '80vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <div className="flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-purple-600" />
                        <h2 className="font-semibold text-gray-900">{title}</h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Path bar */}
                <div className="flex items-center gap-2 px-5 py-3 border-b bg-gray-50">
                    <button
                        onClick={handleUp}
                        disabled={!result?.parent && result?.parent !== ''}
                        className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
                        title="Go up"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <input
                        type="text"
                        value={manualPath}
                        onChange={e => setManualPath(e.target.value)}
                        onKeyDown={handleManualNavigate}
                        placeholder="Type a path and press Enter..."
                        className="flex-1 text-sm px-3 py-1.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
                    />
                    <button
                        onClick={() => browse(manualPath)}
                        className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                        Go
                    </button>
                </div>

                {/* Directory listing */}
                <div className="flex-1 overflow-y-auto px-3 py-2">
                    {loading && (
                        <div className="flex items-center justify-center py-12 text-gray-400">
                            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                            Loading...
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-lg m-2">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {!loading && !error && result && (
                        <div className="divide-y divide-gray-50">
                            {result.entries.length === 0 && (
                                <p className="text-center text-gray-400 py-10 text-sm">No folders here</p>
                            )}
                            {result.entries.map((entry) => (
                                <button
                                    key={entry.path}
                                    onClick={() => handleEntryClick(entry)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-purple-50 text-left group transition-colors"
                                >
                                    {entry.type === 'drive' ? (
                                        <HardDrive className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                    ) : (
                                        <Folder className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                                    )}
                                    <span className="flex-1 text-sm text-gray-800 font-medium truncate">{entry.name}</span>
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-purple-400 flex-shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50 rounded-b-xl">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-500 flex-shrink-0">Selected:</span>
                        <span className="text-xs font-mono text-gray-700 truncate">{currentPath || '(root)'}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 text-gray-600">
                            Cancel
                        </button>
                        <button
                            onClick={() => onSelect(currentPath)}
                            disabled={!currentPath}
                            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            <Check className="w-4 h-4" />
                            Select This Folder
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FileBrowser;

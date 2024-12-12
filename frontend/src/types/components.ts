import { ReactNode } from 'react';
import type { Channel, Game, VOD, Chapter, Download } from './models';

// Layout Components
export interface LayoutProps {
  children: ReactNode;
}

// Channel Components
export interface ChannelCardProps {
  channel: Channel;
  onDelete: (id: number) => void;
  onToggleActive: (id: number, isActive: boolean) => void;
}

export interface ChannelListProps {
  channels: Channel[];
  onDelete: (id: number) => void;
  onToggleActive: (id: number, isActive: boolean) => void;
  isLoading?: boolean;
}

export interface AddChannelFormProps {
  onSubmit: (data: { twitch_id: string; username: string }) => Promise<void>;
  isLoading?: boolean;
}

// Game Components
export interface GameCardProps {
  game: Game;
  onDelete: (id: number) => void;
  onToggleActive: (id: number, isActive: boolean) => void;
}

export interface GameListProps {
  games: Game[];
  onDelete: (id: number) => void;
  onToggleActive: (id: number, isActive: boolean) => void;
  isLoading?: boolean;
}

export interface AddGameFormProps {
  onSubmit: (data: { twitch_game_id: string; name: string }) => Promise<void>;
  isLoading?: boolean;
}

// VOD Components
export interface VODCardProps {
  vod: VOD;
  onAnalyze?: (id: number) => void;
  isAnalyzing?: boolean;
}

export interface VODListProps {
  vods: VOD[];
  onAnalyze?: (id: number) => void;
  isLoading?: boolean;
}

export interface VODChaptersProps {
  chapters: Chapter[];
  onReanalyze?: () => void;
  isAnalyzing?: boolean;
}

// Download Components
export interface DownloadListProps {
  downloads: Download[];
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
}

export interface DownloadProgressProps {
  download: Download;
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
}

// Dashboard Components
export interface StatCardProps {
  title: string;
  value: number;
  subValue?: number;
  icon: ReactNode;
}

export interface DashboardStatsProps {
  isLoading?: boolean;
  error?: string | null;
}

// Common Components
export interface LoadingProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
}

export interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isDisabled?: boolean;
}

// frontend/src/types/components.ts

import { ReactNode } from 'react';
import type { Channel, Game } from './models';

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

// Task Components
export interface TaskListProps {
  tasks: Array<{
    id: number;
    type: string;
    status: string;
    progress?: number;
    created_at: string;
  }>;
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
}

export interface TaskItemProps {
  task: {
    id: number;
    type: string;
    status: string;
    progress?: number;
    created_at: string;
  };
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

// Search Components
export interface SearchResultProps {
  result: {
    id: string;
    name: string;
    type: 'channel' | 'game';
    thumbnail?: string;
    metrics?: {
      viewers?: number;
      followers?: number;
    };
  };
  onSelect: (result: any) => void;
}

export interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

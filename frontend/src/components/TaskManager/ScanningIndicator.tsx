import { Loader2, Search, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ScanningIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  variant?: 'default' | 'with-search' | 'minimal';
}

export default function ScanningIndicator({ 
  size = 'md', 
  showText = true, 
  className = '',
  variant = 'default'
}: ScanningIndicatorProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const renderIcon = () => {
    switch (variant) {
      case 'with-search':
        return (
          <div className="flex items-center gap-1">
            <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-600`} />
            <Search className={`${sizeClasses[size]} text-blue-600`} />
          </div>
        );
      case 'minimal':
        return <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-600`} />;
      default:
        return (
          <div className="flex items-center gap-1">
            <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-600`} />
            <Eye className={`${sizeClasses[size]} text-blue-500`} />
          </div>
        );
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {renderIcon()}
      {showText && (
        <span className={`${textSizeClasses[size]} text-blue-600 font-medium`}>
          Scanning for VODs...
        </span>
      )}
    </div>
  );
}

export function ScanningBadge({ className = '' }: { className?: string }) {
  return (
    <Badge variant="outline" className={`border-blue-200 text-blue-700 bg-blue-50 ${className}`}>
      <Loader2 className="h-3 w-3 animate-spin mr-1" />
      Scanning
    </Badge>
  );
}
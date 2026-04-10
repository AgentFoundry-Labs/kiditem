'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = 'LOADING...', className }: LoadingStateProps) {
  return (
    <div className={cn('flex items-center justify-center h-64 text-gray-400 text-xs font-mono gap-2', className)}>
      <Loader2 size={14} className="animate-spin" />
      {message}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center h-64 gap-3', className)}>
      <p className="text-red-500 text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ message, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 p-12 text-center', className)}>
      {icon && <div className="flex justify-center mb-3 text-gray-300">{icon}</div>}
      <p className="text-sm text-gray-400 font-mono">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

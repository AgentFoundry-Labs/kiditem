'use client';

import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'default' | 'processing';

interface StatusBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  processing: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  default: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
  processing: 'bg-violet-400',
  default: 'bg-gray-400',
};

export default function StatusBadge({ variant, children, dot = false, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border',
        variants[variant],
        className
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}

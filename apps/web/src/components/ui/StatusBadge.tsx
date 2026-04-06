'use client';

import { cn } from '@/lib/utils';
import { statusBadge, statusBadgeDefault } from '@/lib/status-colors';

const STATUS_LABELS: Record<string, string> = {
  active: '활성',
  running: '실행 중',
  idle: '유휴',
  paused: '일시정지',
  error: '오류',
  terminated: '종료',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusBadge[status] || statusBadgeDefault, className)}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'default' | 'processing';

interface StatusBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  success: 'bg-green-50 text-green-600 border-emerald-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  info: 'bg-blue-50 text-blue-600 border-blue-500/20',
  processing: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  default: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
  processing: 'bg-violet-400',
  default: 'bg-slate-400',
};

export default function VariantStatusBadge({ variant, children, dot = false, className }: StatusBadgeProps) {
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

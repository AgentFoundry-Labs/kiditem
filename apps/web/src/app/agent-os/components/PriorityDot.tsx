import { cn } from '@/lib/utils';

const COLORS: Record<string, string> = {
  urgent: 'bg-red-400',
  high: 'bg-amber-400',
  medium: 'bg-slate-500',
};

export function PriorityDot({ priority }: { priority: string }) {
  return <span className={cn('w-2 h-2 rounded-full shrink-0', COLORS[priority] || COLORS.medium)} />;
}

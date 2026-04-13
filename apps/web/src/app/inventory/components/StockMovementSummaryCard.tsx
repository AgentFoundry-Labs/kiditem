'use client';

import { cn } from '@/lib/utils';

interface Props {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

export function StockMovementSummaryCard({ icon, label, value, color }: Props) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className={cn('text-lg font-bold tabular-nums', color)}>{value}</div>
    </div>
  );
}

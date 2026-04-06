'use client';

import { cn } from '@/lib/utils';
import type { ThumbnailSummary } from '@kiditem/shared';

const GRADE_COLORS: Record<string, string> = {
  S: 'text-emerald-500',
  A: 'text-blue-500',
  B: 'text-slate-500',
  C: 'text-amber-500',
  F: 'text-red-500',
};

const GRADE_LABELS: Record<string, string> = {
  S: 'EXCELLENT',
  A: 'GOOD',
  B: 'AVERAGE',
  C: 'POOR',
  F: 'CRITICAL',
};

interface Props {
  summary: ThumbnailSummary;
  filter: string;
  onFilterChange: (grade: string) => void;
}

export function ThumbnailGradeCards({ summary, filter, onFilterChange }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {(['S', 'A', 'B', 'C', 'F'] as const).map((g) => (
        <button
          key={g}
          onClick={() => onFilterChange(filter === g ? 'all' : g)}
          className={cn(
            'bg-white rounded-xl border border-slate-200 cursor-pointer transition-all hover:shadow-sm',
            filter === g && 'ring-2 ring-blue-400',
          )}
        >
          <div className="px-3 py-2.5 text-center">
            <div className={cn('text-2xl font-black', GRADE_COLORS[g])}>{g}</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums">
              {summary.gradeDistribution[g] || 0}
            </div>
            <div className="text-[9px] text-slate-400 font-mono">{GRADE_LABELS[g]}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

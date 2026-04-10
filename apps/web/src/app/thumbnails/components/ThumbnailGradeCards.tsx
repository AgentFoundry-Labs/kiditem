'use client';

import { cn } from '@/lib/utils';
import type { ThumbnailSummary } from '@kiditem/shared';
import {
  QUALITY_GRADE_TEXT,
  QUALITY_GRADE_LABELS,
  COMPLIANCE_GRADE_TEXT,
  COMPLIANCE_GRADE_LABELS,
  COMPLIANCE_GRADE_BG,
} from '../lib/grade-constants';

interface Props {
  summary: ThumbnailSummary;
  filter: string;
  onFilterChange: (grade: string) => void;
  complianceDistribution?: Record<string, number>;
}

export function ThumbnailGradeCards({ summary, filter, onFilterChange, complianceDistribution }: Props) {
  return (
    <div className="space-y-2">
      {complianceDistribution && (
        <div className="grid grid-cols-3 gap-2">
          {(['PASS', 'WARN', 'FAIL'] as const).map((g) => (
            <button
              key={g}
              onClick={() => onFilterChange(filter === g ? 'all' : g)}
              className={cn(
                'bg-white rounded-xl border border-slate-200 cursor-pointer transition-all hover:shadow-sm',
                filter === g && 'ring-2 ring-blue-400',
              )}
            >
              <div className="px-3 py-2.5 text-center">
                <div className={cn('text-lg font-black', COMPLIANCE_GRADE_TEXT[g])}>
                  {g === 'PASS' ? '✓' : g === 'WARN' ? '!' : '✗'}
                </div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {complianceDistribution[g] || 0}
                </div>
                <div className={cn('text-[9px] font-mono', COMPLIANCE_GRADE_TEXT[g])}>
                  {COMPLIANCE_GRADE_LABELS[g]}
                </div>
                <div className={cn('mt-1 h-1 rounded-full', COMPLIANCE_GRADE_BG[g])} />
              </div>
            </button>
          ))}
        </div>
      )}
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
              <div className={cn('text-2xl font-black', QUALITY_GRADE_TEXT[g])}>{g}</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">
                {summary.gradeDistribution[g] || 0}
              </div>
              <div className="text-[9px] text-slate-400 font-mono">{QUALITY_GRADE_LABELS[g]}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

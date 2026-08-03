import type { ProductAbcEvaluation, ProductAbcGrade } from '@kiditem/shared/product-abc';
import { cn } from '@/lib/utils';

export type ProductAbcBadgeProps = {
  grade: ProductAbcGrade | null;
  evaluation: ProductAbcEvaluation | null;
  compact?: boolean;
  showConfidence?: boolean;
};

const TONE_CLASS = {
  grade: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
} as const;

export function ProductAbcBadge({
  grade,
  evaluation,
  compact = false,
  showConfidence = false,
}: ProductAbcBadgeProps) {
  const hasPublishedGrade = grade !== null;
  const primary = hasPublishedGrade ? `${grade}등급` : '미분류';
  const tone = hasPublishedGrade ? 'grade' : 'neutral';

  return (
    <span className={cn('inline-flex max-w-full items-center gap-1', compact && 'gap-0.5')} aria-label={primary} title={primary}>
      <span className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold leading-none ring-1',
        compact && 'px-1 py-px text-[10px]', TONE_CLASS[tone],
      )}>
        {primary}
      </span>
      {showConfidence && evaluation?.reliability != null ? (
        <span className={cn('text-[11px] font-medium text-[var(--text-secondary)]', compact && 'text-[10px]')}>
          신뢰도 {Math.round(evaluation.reliability * 100)}%
        </span>
      ) : null}
    </span>
  );
}

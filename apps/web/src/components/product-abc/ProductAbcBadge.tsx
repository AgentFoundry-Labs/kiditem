import type { ProductAbcEvaluation, ProductAbcGrade } from '@kiditem/shared/product-abc';
import { cn } from '@/lib/utils';

export type ProductAbcBadgeProps = {
  grade: ProductAbcGrade | null;
  evaluation: ProductAbcEvaluation | null;
  compact?: boolean;
  showConfidence?: boolean;
};

const GRADE_TONE_CLASS: Record<ProductAbcGrade, string> = {
  A: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  B: 'bg-amber-100 text-amber-800 ring-amber-300',
  C: 'bg-rose-100 text-rose-800 ring-rose-300',
};

const NEUTRAL_TONE_CLASS = 'bg-slate-100 text-slate-700 ring-slate-300';

export function ProductAbcBadge({
  grade,
  evaluation,
  compact = false,
  showConfidence = false,
}: ProductAbcBadgeProps) {
  const hasPublishedGrade = grade !== null;
  const primary = hasPublishedGrade ? `${grade}등급` : '미분류';
  const displayLabel = grade ?? '미분류';
  const toneClass = grade === null ? NEUTRAL_TONE_CLASS : GRADE_TONE_CLASS[grade];

  return (
    <span className={cn('inline-flex max-w-full items-center gap-1', compact && 'gap-0.5')} aria-label={primary} title={primary}>
      <span className={cn(
        'inline-flex items-center rounded-md px-2.5 py-1 text-sm font-extrabold leading-none ring-1',
        compact && 'px-2 py-0.5 text-[13px]', toneClass,
      )}>
        {displayLabel}
      </span>
      {showConfidence && evaluation?.reliability != null ? (
        <span className={cn('text-[11px] font-medium text-[var(--text-secondary)]', compact && 'text-[10px]')}>
          신뢰도 {Math.round(evaluation.reliability * 100)}%
        </span>
      ) : null}
    </span>
  );
}

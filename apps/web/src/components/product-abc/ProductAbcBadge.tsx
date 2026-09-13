import type { ProductAbcEvaluation, ProductAbcGrade } from '@kiditem/shared/product-abc';
import { ABC_GRADE_NEUTRAL_TONE_CLASS, ABC_GRADE_TONE_CLASS, cn } from '@/lib/utils';

export type ProductAbcBadgeProps = {
  grade: ProductAbcGrade | null;
  evaluation: ProductAbcEvaluation | null;
  compact?: boolean;
  showConfidence?: boolean;
};

export function ProductAbcBadge({
  grade,
  evaluation,
  compact = false,
  showConfidence = false,
}: ProductAbcBadgeProps) {
  const hasPublishedGrade = grade !== null;
  const primary = hasPublishedGrade ? `${grade}등급` : '미분류';
  const displayLabel = grade ?? '미분류';
  const toneClass = grade === null ? ABC_GRADE_NEUTRAL_TONE_CLASS : ABC_GRADE_TONE_CLASS[grade];

  return (
    <span className={cn('inline-flex max-w-full items-center gap-1', compact && 'gap-0.5')} aria-label={primary} title={primary}>
      <span className={cn(
        'inline-flex items-center rounded-md px-2.5 py-1 text-sm font-extrabold leading-none ring-1',
        compact && 'h-9 min-w-9 justify-center px-2 py-0 text-lg', toneClass,
      )}>
        {displayLabel}
      </span>
      {showConfidence && evaluation ? (
        <span className={cn('text-[11px] font-medium text-[var(--text-secondary)]', compact && 'text-[10px]')}>
          경제점수 {Math.round(evaluation.economicScore)}
        </span>
      ) : null}
    </span>
  );
}

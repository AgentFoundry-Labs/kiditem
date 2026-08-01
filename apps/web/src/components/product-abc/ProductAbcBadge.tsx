import type {
  ProductAbcCalculationStatus,
  ProductAbcEvaluation,
  ProductAbcGrade,
} from '@kiditem/shared/product-abc';
import { cn } from '@/lib/utils';

export type ProductAbcBadgeProps = {
  grade: ProductAbcGrade | null;
  evaluation: ProductAbcEvaluation | null;
  compact?: boolean;
  showConfidence?: boolean;
};

const TONE_CLASS = {
  grade: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pending: 'bg-sky-50 text-sky-700 ring-sky-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  stale: 'bg-orange-50 text-orange-700 ring-orange-200',
  error: 'bg-rose-50 text-rose-700 ring-rose-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
} as const;

const STATUS_LABEL: Record<ProductAbcCalculationStatus, string> = {
  READY: '계산 완료',
  INSUFFICIENT_EVIDENCE: '관찰 중',
  SOURCE_UNMAPPED: '매핑 필요',
  CALIBRATION_PENDING: '수식 보정 대기',
  RECALCULATING: '재계산 중',
  SELLPIA_SOURCE_STALE: '셀피아 갱신 필요',
  AD_SOURCE_STALE: '광고비 갱신 필요',
  CALCULATION_ERROR: '계산 확인 필요',
};

export function ProductAbcBadge({
  grade,
  evaluation,
  compact = false,
  showConfidence = false,
}: ProductAbcBadgeProps) {
  const status = evaluation?.calculationStatus ?? 'CALIBRATION_PENDING';
  const hasPublishedGrade = grade !== null;
  const primary = hasPublishedGrade ? `${grade}등급` : STATUS_LABEL[status];
  const secondary = hasPublishedGrade && status !== 'READY' ? STATUS_LABEL[status] : null;
  const tone = hasPublishedGrade ? 'grade' : toneForStatus(status);
  const title = accessibleDescription(grade, evaluation, primary);

  return (
    <span className={cn('inline-flex max-w-full items-center gap-1', compact && 'gap-0.5')} aria-label={title} title={title}>
      <span className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold leading-none ring-1',
        compact && 'px-1 py-px text-[10px]', TONE_CLASS[tone],
      )}>
        {primary}
      </span>
      {secondary ? (
        <span className={cn(
          'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold leading-none ring-1',
          compact && 'px-1 py-px text-[10px]', TONE_CLASS[toneForStatus(status)],
        )}>
          {secondary}
        </span>
      ) : null}
      {showConfidence && evaluation?.reliability !== null ? (
        <span className={cn('text-[11px] font-medium text-[var(--text-secondary)]', compact && 'text-[10px]')}>
          신뢰도 {Math.round(evaluation.reliability * 100)}%
        </span>
      ) : null}
    </span>
  );
}

function toneForStatus(status: ProductAbcCalculationStatus): keyof typeof TONE_CLASS {
  if (status === 'READY') return 'grade';
  if (status === 'INSUFFICIENT_EVIDENCE' || status === 'CALIBRATION_PENDING' || status === 'RECALCULATING') return 'pending';
  if (status === 'SOURCE_UNMAPPED') return 'warning';
  if (status === 'SELLPIA_SOURCE_STALE' || status === 'AD_SOURCE_STALE') return 'stale';
  if (status === 'CALCULATION_ERROR') return 'error';
  return 'neutral';
}

function accessibleDescription(
  grade: ProductAbcGrade | null,
  evaluation: ProductAbcEvaluation | null,
  label: string,
): string {
  if (!evaluation) return `${label}${grade ? ' · 마지막 자동 ABC 등급' : ' · 평가 미발행'}`;
  return [
    label,
    `상태 ${STATUS_LABEL[evaluation.calculationStatus]}`,
    `유효 주문 ${evaluation.paidOrderCount}건`,
    `관찰 ${evaluation.observationDays}일`,
    evaluation.formula ? `수식 v${evaluation.formula.version}` : '수식 보정 대기',
  ].join(' · ');
}

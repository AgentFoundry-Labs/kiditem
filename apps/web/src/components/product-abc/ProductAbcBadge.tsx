import type {
  MasterProductAbcEvaluation,
  ProductAbcGrade,
} from '@kiditem/shared/product-abc';
import { cn } from '@/lib/utils';

export type ProductAbcBadgeProps = {
  grade: ProductAbcGrade | null;
  evaluation: MasterProductAbcEvaluation | null;
  compact?: boolean;
  showConfidence?: boolean;
};

const TONE_CLASS = {
  official: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  lifecycle: 'bg-sky-50 text-sky-700 ring-sky-200',
  risk: 'bg-rose-50 text-rose-700 ring-rose-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
} as const;

export function ProductAbcBadge({
  grade,
  evaluation,
  compact = false,
  showConfidence = false,
}: ProductAbcBadgeProps) {
  const presentation = describeAbc(grade, evaluation);
  const title = accessibleDescription(grade, evaluation, presentation.label);

  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1', compact && 'gap-0.5')}
      aria-label={title}
      title={title}
    >
      <span
        className={cn(
          'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold leading-none ring-1',
          compact && 'px-1 py-px text-[10px]',
          TONE_CLASS[presentation.tone],
        )}
      >
        {presentation.label}
      </span>
      {presentation.secondary ? (
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold leading-none ring-1',
            compact && 'px-1 py-px text-[10px]',
            TONE_CLASS[presentation.secondaryTone],
          )}
        >
          {presentation.secondary}
        </span>
      ) : null}
      {showConfidence && evaluation ? (
        <span className={cn('text-[11px] font-medium text-[var(--text-secondary)]', compact && 'text-[10px]')}>
          {confidenceLabel(evaluation.confidence)}
        </span>
      ) : null}
    </span>
  );
}

function describeAbc(
  grade: ProductAbcGrade | null,
  evaluation: MasterProductAbcEvaluation | null,
): {
  label: string;
  tone: keyof typeof TONE_CLASS;
  secondary: string | null;
  secondaryTone: keyof typeof TONE_CLASS;
} {
  const risk = riskLabel(evaluation);
  if (evaluation?.lifecycleStage === 'NEW') {
    return {
      label: `NEW · ${evaluation.observedCompleteMonths}/3개월`,
      tone: 'lifecycle',
      secondary: risk,
      secondaryTone: risk === '손실' ? 'risk' : 'warning',
    };
  }
  if (evaluation?.lifecycleStage === 'PROVISIONAL') {
    return {
      label: evaluation.provisionalGrade
        ? `예비 ${evaluation.provisionalGrade} · ${evaluation.observedCompleteMonths}/6개월`
        : `예비 · ${evaluation.observedCompleteMonths}/6개월`,
      tone: 'lifecycle',
      secondary: risk,
      secondaryTone: risk === '손실' ? 'risk' : 'warning',
    };
  }
  if (grade) {
    return { label: `${grade}등급`, tone: 'official', secondary: risk, secondaryTone: 'risk' };
  }
  if (risk === '손실') {
    return { label: '손실', tone: 'risk', secondary: null, secondaryTone: 'risk' };
  }
  if (risk === '가치 0') {
    return { label: '가치 0', tone: 'warning', secondary: null, secondaryTone: 'warning' };
  }
  return { label: '미분류', tone: 'neutral', secondary: null, secondaryTone: 'neutral' };
}

function riskLabel(evaluation: MasterProductAbcEvaluation | null): string | null {
  if (!evaluation) return null;
  if (evaluation.riskFlags.includes('LOSS') || (evaluation.grossProfit ?? 0) < 0) return '손실';
  if (evaluation.riskFlags.includes('ZERO_VALUE') || evaluation.grossProfit === 0) return '가치 0';
  if (evaluation.eligibilityReason !== 'ELIGIBLE') return '데이터 확인';
  return null;
}

function accessibleDescription(
  grade: ProductAbcGrade | null,
  evaluation: MasterProductAbcEvaluation | null,
  label: string,
): string {
  if (!evaluation) return `${label}${grade ? ' · 자동 ABC 등급' : ' · 평가 미발행'}`;
  return [
    label,
    '매출총이익 기준',
    `관찰 ${evaluation.observedCompleteMonths}개월`,
    `신뢰도 ${confidenceLabel(evaluation.confidence)}`,
    `상태 ${reasonLabel(evaluation.eligibilityReason)}`,
  ].join(' · ');
}

function confidenceLabel(confidence: MasterProductAbcEvaluation['confidence']): string {
  return confidence === 'HIGH' ? '높음' : confidence === 'MEDIUM' ? '보통' : '낮음';
}

function reasonLabel(reason: MasterProductAbcEvaluation['eligibilityReason']): string {
  const labels: Record<MasterProductAbcEvaluation['eligibilityReason'], string> = {
    ELIGIBLE: '평가 가능',
    INACTIVE_PRODUCT: '비활성 상품',
    MISSING_RECIPE: '재고 연결 필요',
    SHARED_SKU: '공유 SKU',
    INACTIVE_SKU: '비활성 Sellpia SKU',
    INCOMPLETE_MONTHS: '완료 월 데이터 부족',
    MISSING_COST: '주문 시점 원가 누락',
    NO_OBSERVATION: '판매 관찰 데이터 없음',
  };
  return labels[reason];
}

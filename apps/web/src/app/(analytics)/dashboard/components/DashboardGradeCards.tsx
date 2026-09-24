'use client';

import { useState } from 'react';
import { Layers, Loader2, RefreshCw } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  useProductAbcRecalculation,
  type ProductAbcRecalculationFeedback,
} from '@/hooks/useProductAbcRecalculation';
import {
  basisHasValues,
  DashboardBasisDisclosure,
  type DashboardMetricBasis,
} from './DashboardDataBasis';
import { HeadlineCard, type HeadlineMetric } from './DashboardHeadlineCards';
import type { DashboardInventorySummary } from '@kiditem/shared/dashboard';

/**
 * Five grades are one distribution, so they read as one row of cells rather
 * than five standalone cards. The cards spent most of their height on padding
 * and shadow to show 0 · 0 · 0 · 0 · 983, which is the state this screen is in
 * most often — and that state is worth one glance, not two rows.
 */

type ProductAbcGrade = 'A' | 'B' | 'C';
type DashboardGradeCardsProps = Pick<
  DashboardInventorySummary,
  | 'gradeCount'
  | 'classifiedProductCount'
  | 'abcContributionProfit'
  | 'abcFormula'
>;

const GRADE_LABELS: Record<ProductAbcGrade, string> = { A: '고수익 핵심', B: '수익 성장', C: '수익 개선' };

export function DashboardGradeCards({
  gradeCount, classifiedProductCount, unclassifiedProductCount, abcContributionProfit, abcFormula,
  gradeChanges, changesMeasured = false,
  basis, unclassifiedBasis, contributionBasis, refetchReads,
}: DashboardGradeCardsProps & {
  /** Optional for older dashboard fixtures; the API now publishes this count. */
  unclassifiedProductCount?: number;
  /** Products' dedicated evidence for the unclassified population. */
  unclassifiedBasis?: DashboardMetricBasis | null;
  /** Kept for existing callers; activation timestamps are not published by the current contract. */
  asOf?: string | null;
  /** The current publication's grade movement, as the server counted it. */
  gradeChanges?: DashboardInventorySummary['gradeChanges'];
  /** 이동 수에 근거가 있는가. 없으면 0 으로 적지 않고 화살표를 아예 그리지 않는다. */
  changesMeasured?: boolean;
  basis?: DashboardMetricBasis | null;
  contributionBasis?: DashboardMetricBasis | null;
  /** The dashboard reads this panel renders, refetched after a publication. */
  refetchReads: () => Promise<unknown>;
}) {
  // Products owns the calculation; this is a second trigger for the same
  // action, not a second implementation of it.
  const [feedback, setFeedback] = useState<ProductAbcRecalculationFeedback | null>(null);
  const refresh = useProductAbcRecalculation({ onFeedback: setFeedback, refetchReads });
  const gradeMeasured = basisHasValues(basis ?? null);
  const unclassifiedMeasured = basisHasValues(unclassifiedBasis ?? null);

  // 등급 이름 옆 작은 화살표가 이번 계산에서 이 등급으로 들어온 수(▲)와 나간 수(▼)다.
  // 서버가 센 발표값만 적는다 — 근거가 없으면 화살표 자체를 그리지 않는다.
  const flowOf = (grade: ProductAbcGrade) => {
    const flow = changesMeasured ? gradeChanges?.byGrade?.[grade] ?? null : null;
    return flow ? `▲${formatNumber(flow.in)} ▼${formatNumber(flow.out)}` : undefined;
  };
  const profitOf = (grade: ProductAbcGrade) => (basisHasValues(contributionBasis ?? null)
    ? `가중 영업이익 ${formatNumber(abcContributionProfit.amountByGrade[grade])}원`
    : '가중 영업이익 미수집');
  const gradeMetric = (grade: ProductAbcGrade): HeadlineMetric => ({
    key: `abc${grade}`,
    label: grade,
    ariaLabel: `${grade}등급 — ${profitOf(grade)}`,
    value: gradeMeasured ? formatNumber(gradeCount[grade]) : null,
    unit: '개',
    suffix: flowOf(grade),
    note: profitOf(grade),
    href: `/product-hub?abcGrade=${grade}`,
  });

  return (
    <>
      <HeadlineCard
        title="수익성 ABC"
        icon={Layers}
        tone="emerald"
        href="/product-hub"
        hrefLabel="상품 관리"
        titleHint={abcFormula ? `절대평가 v${abcFormula.version} · 반감기 ${abcFormula.halfLifeDays}일` : '상품 관리에서 등급 새로고침을 실행하세요.'}
        metrics={[
          gradeMetric('A'),
          gradeMetric('B'),
          gradeMetric('C'),
          {
            key: 'abcUnclassified',
            label: '미분류',
            value: !unclassifiedMeasured || unclassifiedProductCount === undefined
              ? null
              : formatNumber(unclassifiedProductCount),
            unit: '개',
            note: '공식 ABC 근거가 아직 없는 상품',
            href: '/product-hub?abcGrade=unclassified&activeStatus=all',
          },
          {
            key: 'abcReady',
            label: '계산 완료',
            value: gradeMeasured ? formatNumber(classifiedProductCount) : null,
            unit: '개',
            note: '현재 ABC 등급이 발행된 상품',
          },
        ]}
        headerRight={(
          <>
            <DashboardBasisDisclosure
              label="수익성 ABC 근거"
              entries={[
                { label: 'ABC 등급', basis },
                { label: '미분류 상품', basis: unclassifiedBasis ?? null },
                { label: '가중 영업이익', basis: contributionBasis ?? null },
              ]}
              meaning={<AbcCriteria formula={abcFormula} contributionBasis={abcContributionProfit.basis} />}
            />
            <button
              type="button"
              onClick={() => { setFeedback(null); refresh.mutate(); }}
              disabled={refresh.isPending}
              title="ABC 등급 다시 계산"
              aria-label="ABC 등급 다시 계산"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refresh.isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              {refresh.isPending ? '계산 중' : '재계산'}
            </button>
          </>
        )}
      />
      {feedback && (
        <p
          className={cn(
            'rounded-lg px-3 py-2 text-xs',
            feedback.tone === 'success' && 'bg-emerald-50 text-emerald-800',
            feedback.tone === 'warning' && 'bg-amber-50 text-amber-800',
            feedback.tone === 'error' && 'bg-red-50 text-red-800',
          )}
          role="status"
        >
          {feedback.message}
        </p>
      )}
    </>
  );
}

function AbcCriteria({
  formula,
  contributionBasis,
}: {
  formula: DashboardGradeCardsProps['abcFormula'];
  contributionBasis: DashboardInventorySummary['abcContributionProfit']['basis'];
}) {
  if (!formula) {
    return (
      <>
        <p>이익·마진·판매 일관성을 합친 경제점수로 상품을 A·B·C로 나눕니다. 기준값은 상품 관리에서 등급을 새로 계산하면 표시됩니다.</p>
        <ContributionEvidence basis={contributionBasis} formulaVersion={null} />
      </>
    );
  }
  const { gradeThresholds: t, weights: w, halfLifeDays, minimumSaleAgeDays } = formula;
  return (
    <>
      {/* 광고비를 빼지 않는 판(v3)은 같은 '이익'이라도 뜻이 다르다 — 먼저 말한다. */}
      {formula.historicalAdvertisingPolicy === 'EXCLUDED_V1' ? (
        <p className="font-semibold">광고비 제외 판(v{formula.version}): 셀피아 매출과 매입가만으로 이익을 셉니다.</p>
      ) : null}
      <p>
        경제점수 = 이익 {Math.round(w.profit * 100)}% + 마진 {Math.round(w.margin * 100)}% +
        판매 일관성 {Math.round(w.consistency * 100)}%. 오래된 실적일수록 가볍게 세며, 반감기는 {halfLifeDays}일입니다.
      </p>
      <ul className="mt-1 space-y-0.5">
        <li><b>A {GRADE_LABELS.A}</b> — 경제점수 {t.aEconomicScoreGte} 이상이면서 마진 {t.aMarginScoreGte} 이상, 일관성 {t.aConsistencyScoreGte} 이상</li>
        <li><b>B {GRADE_LABELS.B}</b> — 경제점수 {t.bEconomicScoreGte} 이상</li>
        <li><b>C {GRADE_LABELS.C}</b> — 그 아래. 가중 영업이익이나 영업이익률이 0 이하이면 점수와 무관하게 C입니다.</li>
      </ul>
      <p className="mt-1">유효 매핑의 최초 판매일로부터 {minimumSaleAgeDays}일이 지나야 평가합니다.</p>
      <ContributionEvidence basis={contributionBasis} formulaVersion={formula.version} />
    </>
  );
}

function ContributionEvidence({
  basis,
  formulaVersion,
}: {
  basis: DashboardInventorySummary['abcContributionProfit']['basis'];
  formulaVersion: number | null;
}) {
  const publication = basis.publicationRevision === null
    ? '공표 없음'
    : `공표 r${basis.publicationRevision}`;
  const cutoff = basis.officialCutoffDate ?? 'cutoff 미상';
  const formula = formulaVersion ? `산식 v${formulaVersion}` : '산식 미상';
  const denominator = basis.denominator === null
    ? '분모 미측정'
    : `분모 ${formatNumber(basis.denominator)}원`;
  return (
    <p className="mt-1" data-testid="abc-contribution-evidence">
      가중 영업이익: {publication} · {cutoff} · {formula} · 포함 {basis.includedProductCount}개 ·
      보류 {basis.withheldProductCount}개 · {denominator}
    </p>
  );
}

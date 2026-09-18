'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
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
  | 'abcStatusCount'
  | 'abcContributionProfit'
  | 'abcFormula'
>;

const GRADE_LABELS: Record<ProductAbcGrade, string> = { A: '고수익 핵심', B: '수익 성장', C: '수익 개선' };

const GRADE_NAME = (grade: ProductAbcGrade | null) => grade ?? '미분류';

export function DashboardGradeCards({
  gradeCount, classifiedProductCount, abcStatusCount, abcContributionProfit, abcFormula,
  gradeChanges, changesMeasured = false,
  basis, contributionBasis, refetchReads,
}: DashboardGradeCardsProps & {
  /** The current publication's grade movement, as the server counted it. */
  gradeChanges?: DashboardInventorySummary['gradeChanges'];
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

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      aria-label="수익성 ABC 현황"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h2
          className="text-sm font-semibold text-slate-900"
          title={abcFormula ? `절대평가 v${abcFormula.version} · 반감기 ${abcFormula.halfLifeDays}일` : '상품 관리에서 등급 새로고침을 실행하세요.'}
        >
          수익성 ABC
        </h2>
        <div className="flex items-center gap-1.5">
          <DashboardBasisDisclosure
            label="수익성 ABC 근거"
            entries={[
              { label: 'ABC 등급', basis },
              { label: '가중 영업이익', basis: contributionBasis ?? null },
            ]}
            meaning={(
              <AbcCriteria
                formula={abcFormula}
                contributionBasis={abcContributionProfit.basis}
              />
            )}
          />
          <button
            type="button"
            onClick={() => { setFeedback(null); refresh.mutate(); }}
            disabled={refresh.isPending}
            title="ABC 등급 다시 계산"
            aria-label="ABC 등급 다시 계산"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refresh.isPending
              ? <Loader2 size={11} className="animate-spin" />
              : <RefreshCw size={11} />}
            {refresh.isPending ? '계산 중' : '재계산'}
          </button>
        </div>
      </header>

      {/* Three grades, three cells. The two status cells that used to sit beside
          them — 평가 대기 and 원천 확인 필요 — counted populations rather than
          grades, and 원천 확인 필요 published the same number as the ABC 미분류
          row in the attention rail two columns to the left. The rail is where a
          count an operator has to act on belongs. */}
      <div className="grid grid-cols-3 gap-px bg-slate-200">
        {(['A', 'B', 'C'] as const).map(grade => (
          <GradeCell
            key={grade}
            grade={grade}
            count={gradeMeasured ? gradeCount[grade] : null}
            total={gradeMeasured ? classifiedProductCount : null}
            contribution={abcContributionProfit.amountByGrade[grade]}
            contributionMeasured={basisHasValues(contributionBasis ?? null)}
            flow={changesMeasured ? gradeChanges?.byGrade?.[grade] ?? null : null}
          />
        ))}
      </div>

      {/* The panel says what the grades are now. Movement over seven days is a
          different question and only half of it was ever actionable, so 하락
          moved to the attention rail — beside the other counts someone has to go
          act on — and 상승 is not published: nothing follows from it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        <Link href="/product-hub" className="font-semibold text-emerald-700 hover:underline">
          계산 완료 {gradeMeasured ? `${formatNumber(abcStatusCount.READY)}개` : '—'}
        </Link>
        {/* 이번 계산에서 등급이 옮겨 간 길 — 큰 것부터 넷. */}
        {changesMeasured && gradeChanges?.moves ? (
          <span data-testid="abc-grade-moves">
            이동{' '}
            {gradeChanges.moves.length === 0
              ? '없음'
              : gradeChanges.moves.slice(0, 4).map((move) =>
                `${GRADE_NAME(move.from)}→${GRADE_NAME(move.to)} ${formatNumber(move.count)}`).join(' · ')}
          </span>
        ) : null}
      </div>
      {feedback && (
        <p
          className={cn(
            'border-t border-slate-200 px-4 py-2.5 text-xs',
            feedback.tone === 'success' && 'bg-emerald-50 text-emerald-800',
            feedback.tone === 'warning' && 'bg-amber-50 text-amber-800',
            feedback.tone === 'error' && 'bg-red-50 text-red-800',
          )}
          role="status"
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
}

function GradeCell({
  grade,
  count,
  total,
  contribution,
  contributionMeasured,
  flow,
}: {
  grade: ProductAbcGrade;
  count: number | null;
  total: number | null;
  contribution: number;
  contributionMeasured: boolean;
  /** Products that came into and left this grade in the current publication. */
  flow: { in: number; out: number } | null;
}) {
  const percent = count !== null && total !== null && total > 0
    ? Math.round((count / total) * 100)
    : 0;
  const countLabel = count === null ? '미수집' : `${formatNumber(count)}개`;
  return (
    <Link
      href={`/product-hub?abcGrade=${grade}`}
      aria-label={`${grade}등급 ${GRADE_LABELS[grade]} ${countLabel} 가중 영업이익 ${contributionMeasured ? `${formatNumber(contribution)}원` : '미수집'}`}
      title={`${GRADE_LABELS[grade]} · 가중 영업이익 ${contributionMeasured ? `${formatNumber(contribution)}원` : '미수집'}`}
      className="bg-white px-4 py-3.5 text-center transition-colors hover:bg-slate-50"
    >
      <p className="text-xs font-semibold text-slate-500">{grade}</p>
      <p className="text-xl font-bold leading-tight tabular-nums text-slate-900">
        {count === null ? '—' : formatNumber(count)}
      </p>
      <p
        className="text-[11px] font-semibold tabular-nums"
        title={flow ? `이번 계산에서 ${grade}등급으로 ${flow.in}개 들어오고 ${flow.out}개 나감` : '등급 이동 기록 없음'}
        data-testid={`abc-flow-${grade}`}
      >
        {flow ? (
          <>
            <span className={flow.in > 0 ? 'text-emerald-600' : 'text-slate-300'}>▲{formatNumber(flow.in)}</span>{' '}
            <span className={flow.out > 0 ? 'text-red-500' : 'text-slate-300'}>▼{formatNumber(flow.out)}</span>
          </>
        ) : <span className="text-slate-300">—</span>}
      </p>
      <div className="mx-auto mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', grade === 'C' ? 'bg-red-500' : 'bg-violet-600')}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">
        {contributionMeasured ? `${formatNumber(contribution)}원` : '—'}
      </p>
    </Link>
  );
}


/**
 * What decides a grade, read off the published formula rather than restated
 * here. A threshold written into the screen is a threshold that goes stale the
 * first time Products changes one, and the reader would have no way to tell.
 */
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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { DashboardBasisDisclosure, type DashboardMetricBasis } from './DashboardDataBasis';
import type { DashboardInventorySummary } from '@kiditem/shared/dashboard';
import {
  useProductAbcRecalculation,
  type ProductAbcRecalculationFeedback,
} from '@/hooks/useProductAbcRecalculation';

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
  | 'gradeChanges'
>;

const GRADE_LABELS: Record<ProductAbcGrade, string> = { A: '고수익 핵심', B: '수익 성장', C: '수익 개선' };

export function DashboardGradeCards({
  gradeCount, classifiedProductCount, abcStatusCount, abcContributionProfit, abcFormula, gradeChanges,
  basis, refetchReads,
}: DashboardGradeCardsProps & {
  basis?: DashboardMetricBasis | null;
  /** The dashboard reads this panel renders, refetched after a publication. */
  refetchReads: () => Promise<unknown>;
}) {
  // Products owns the calculation; this is a second trigger for the same
  // action, not a second implementation of it.
  const [feedback, setFeedback] = useState<ProductAbcRecalculationFeedback | null>(null);
  const refresh = useProductAbcRecalculation({ onFeedback: setFeedback, refetchReads });

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      aria-label="수익성 ABC 현황"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <h2
          className="text-sm font-semibold text-slate-900"
          title={abcFormula ? `절대평가 v${abcFormula.version} · 반감기 ${abcFormula.halfLifeDays}일` : '상품 관리에서 등급 새로고침을 실행하세요.'}
        >
          수익성 ABC
        </h2>
        <div className="flex items-center gap-1.5">
          <DashboardBasisDisclosure label="수익성 ABC 근거" entries={[{ label: 'ABC 등급', basis }]} />
          <button
            type="button"
            onClick={() => { setFeedback(null); refresh.mutate(); }}
            disabled={refresh.isPending}
            title="ABC 등급 다시 계산"
            aria-label="ABC 등급 다시 계산"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
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
            count={gradeCount[grade]}
            total={classifiedProductCount}
            contribution={abcContributionProfit.amountByGrade[grade]}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-500">
        <Link href="/product-hub" className="font-semibold text-emerald-700 hover:underline">
          계산 완료 {formatNumber(abcStatusCount.READY)}개
        </Link>
        <span aria-hidden="true">·</span>
        <span>
          {gradeChanges
            ? `최근 7일 상승 ${formatNumber(gradeChanges.upgraded)} / 하락 ${formatNumber(gradeChanges.downgraded)}`
            : '최근 7일 변화 —'}
        </span>
      </div>
      {feedback && (
        <p
          className={cn(
            'border-t border-slate-200 px-3 py-1.5 text-[11px]',
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

function GradeCell({ grade, count, total, contribution }: { grade: ProductAbcGrade; count: number; total: number; contribution: number }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Link
      href={`/product-hub?abcGrade=${grade}`}
      aria-label={`${grade}등급 ${GRADE_LABELS[grade]} ${formatNumber(count)}개 가중 영업이익 ${formatNumber(contribution)}원`}
      title={`${GRADE_LABELS[grade]} · 가중 영업이익 ${formatNumber(contribution)}원`}
      className="bg-white px-2 py-1.5 text-center transition-colors hover:bg-slate-50"
    >
      <p className="text-[11px] font-semibold text-slate-500">{grade}</p>
      <p className="text-lg font-bold leading-tight tabular-nums text-slate-900">{formatNumber(count)}</p>
      <div className="mx-auto mt-0.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', grade === 'C' ? 'bg-red-500' : 'bg-violet-600')}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="mt-0.5 truncate text-[10px] text-slate-500">{formatNumber(contribution)}원</p>
    </Link>
  );
}


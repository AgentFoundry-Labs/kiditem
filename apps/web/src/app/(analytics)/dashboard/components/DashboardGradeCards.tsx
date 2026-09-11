'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import { DashboardBasisDisclosure, type BasisBreakdownEntry, type DashboardMetricBasis } from './DashboardDataBasis';
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
  | 'unclassifiedProductCount'
  | 'abcStatusCount'
  | 'abcContributionProfit'
  | 'abcFormula'
  | 'gradeChanges'
>;

const GRADE_LABELS: Record<ProductAbcGrade, string> = { A: '고수익 핵심', B: '수익 성장', C: '수익 개선' };

export function DashboardGradeCards({
  gradeCount, classifiedProductCount, unclassifiedProductCount, abcStatusCount, abcContributionProfit, abcFormula, gradeChanges,
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
  const sourceAttention = abcStatusCount.SOURCE_UNMAPPED
    + abcStatusCount.SELLPIA_SOURCE_STALE
    + abcStatusCount.AD_SOURCE_STALE;

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
          <DashboardBasisDisclosure
            label="수익성 ABC 근거"
            entries={[{ label: '수익성 ABC', basis: basis ?? null }] satisfies BasisBreakdownEntry[]}
          />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 xl:grid-cols-5">
        {(['A', 'B', 'C'] as const).map(grade => (
          <GradeCell
            key={grade}
            grade={grade}
            count={gradeCount[grade]}
            total={classifiedProductCount}
            contribution={abcContributionProfit.amountByGrade[grade]}
          />
        ))}
        <StatusCell
          label="평가 대기"
          count={abcStatusCount.INSUFFICIENT_EVIDENCE}
          description="유효 매핑의 최초 판매일로부터 30일 경과 후 평가 가능"
          href="/product-hub?abcGrade=unclassified"
          tone="sky"
        />
        <StatusCell
          label="원천 확인 필요"
          count={sourceAttention}
          description="셀피아·광고비 수집 또는 매핑을 확인"
          href="/product-hub?dataStatus=abc"
          tone="amber"
        />
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

function StatusCell({ label, count, description, href, tone }: { label: string; count: number; description: string; href: string; tone: 'sky' | 'amber' }) {
  return (
    <Link
      href={href}
      aria-label={`${label} 평가 상태 ${formatNumber(count)}개 ${description}`}
      title={description}
      className={cn('px-2 py-1.5 text-center transition-colors', tone === 'sky' ? 'bg-sky-50/60 hover:bg-sky-50' : 'bg-amber-50/60 hover:bg-amber-50')}
    >
      <p className="truncate text-[11px] font-semibold text-slate-500">{label}</p>
      <p className={cn('text-lg font-bold leading-tight tabular-nums', tone === 'amber' && count > 0 ? 'text-amber-700' : 'text-slate-900')}>
        {formatNumber(count)}
      </p>
      {/* The sentence is on the link itself, for assistive tech and on hover;
          the cell paints only as much of it as it has room for. */}
      <p className="mt-0.5 truncate text-[10px] text-slate-500">{description}</p>
    </Link>
  );
}

import Link from 'next/link';
import { cn, formatNumber } from '@/lib/utils';
import { DashboardDataBasis, type DashboardMetricBasis } from './DashboardDataBasis';
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
  | 'unclassifiedProductCount'
  | 'abcStatusCount'
  | 'abcContributionProfit'
  | 'abcFormula'
  | 'gradeChanges'
>;

const GRADE_LABELS: Record<ProductAbcGrade, string> = { A: '고수익 핵심', B: '수익 성장', C: '수익 개선' };

export function DashboardGradeCards({
  gradeCount, classifiedProductCount, unclassifiedProductCount, abcStatusCount, abcContributionProfit, abcFormula, gradeChanges,
  basis,
}: DashboardGradeCardsProps & { basis?: DashboardMetricBasis | null }) {
  const sourceAttention = abcStatusCount.SOURCE_UNMAPPED
    + abcStatusCount.SELLPIA_SOURCE_STALE
    + abcStatusCount.AD_SOURCE_STALE;

  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      aria-label="수익성 ABC 현황"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-sm font-semibold text-slate-900">수익성 ABC</h2>
          <p className="text-xs text-slate-500">상품 관리에서 새로고침한 절대평가 결과입니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/product-hub?abcGrade=unclassified" className="text-xs text-slate-500 hover:text-violet-700">
            미분류 {formatNumber(unclassifiedProductCount)}개
          </Link>
          {basis && <DashboardDataBasis basis={basis} />}
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500">
        <Link href="/product-hub" className="font-semibold text-emerald-700 hover:underline">
          계산 완료 {formatNumber(abcStatusCount.READY)}개
        </Link>
        <span aria-hidden="true">·</span>
        <span>
          {gradeChanges
            ? `최근 7일 상승 ${formatNumber(gradeChanges.upgraded)} / 하락 ${formatNumber(gradeChanges.downgraded)}`
            : '최근 7일 변화 —'}
        </span>
        <span aria-hidden="true">·</span>
        <span>{abcFormula ? `절대평가 v${abcFormula.version} · 반감기 ${abcFormula.halfLifeDays}일` : '상품 관리에서 등급 새로고침을 실행하세요.'}</span>
      </div>
    </section>
  );
}

function GradeCell({ grade, count, total, contribution }: { grade: ProductAbcGrade; count: number; total: number; contribution: number }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Link href={`/product-hub?abcGrade=${grade}`} className="bg-white px-3 py-1.5 transition-colors hover:bg-slate-50">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-xs font-semibold text-slate-900">{grade}등급</span>
        <span className="truncate text-[11px] text-slate-500">{GRADE_LABELS[grade]}</span>
      </div>
      <div className="text-xl font-bold tabular-nums leading-tight text-slate-900">
        {formatNumber(count)}<span className="ml-0.5 text-xs font-medium text-slate-500">개</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', grade === 'C' ? 'bg-red-500' : 'bg-violet-600')}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500">가중 영업이익 {formatNumber(contribution)}원</div>
    </Link>
  );
}

function StatusCell({ label, count, description, href, tone }: { label: string; count: number; description: string; href: string; tone: 'sky' | 'amber' }) {
  return (
    <Link
      href={href}
      className={cn('px-3 py-1.5 transition-colors', tone === 'sky' ? 'bg-sky-50/60 hover:bg-sky-50' : 'bg-amber-50/60 hover:bg-amber-50')}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-xs font-semibold text-slate-900">{label}</span>
        <span className="text-[11px] text-slate-500">평가 상태</span>
      </div>
      <div className="text-xl font-bold tabular-nums leading-tight text-slate-900">
        {formatNumber(count)}<span className="ml-0.5 text-xs font-medium text-slate-500">개</span>
      </div>
      {/* The sentence stays in full for anyone reading it with a screen reader
          or hovering; the cell only limits how much of it is painted. */}
      <div className="mt-1 truncate text-[11px] text-slate-500" title={description}>{description}</div>
    </Link>
  );
}

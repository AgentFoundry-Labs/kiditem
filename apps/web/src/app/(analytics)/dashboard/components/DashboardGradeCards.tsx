import Link from 'next/link';
import { cn, formatNumber } from '@/lib/utils';
import type { DashboardInventorySummary } from '@kiditem/shared/dashboard';

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
}: DashboardGradeCardsProps) {
  const changes = gradeChanges ?? { upgraded: 0, downgraded: 0, total: 0 };
  const sourceAttention = abcStatusCount.SOURCE_UNMAPPED
    + abcStatusCount.SELLPIA_SOURCE_STALE
    + abcStatusCount.AD_SOURCE_STALE;

  return <section className="space-y-2" aria-label="수익성 ABC 현황">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-sm font-extrabold text-slate-900">수익성 ABC</h2><p className="mt-0.5 text-xs text-slate-400">상품 관리에서 새로고침한 절대평가 결과입니다.</p></div>
      <Link href="/product-hub?abcGrade=unclassified" className="text-xs text-slate-400 hover:text-purple-600">미분류 {formatNumber(unclassifiedProductCount)}개</Link>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {(['A', 'B', 'C'] as const).map((grade) => <GradeCard key={grade} grade={grade} count={gradeCount[grade]} total={classifiedProductCount} contribution={abcContributionProfit.amountByGrade[grade]} />)}
      <StatusCard label="평가 대기" count={abcStatusCount.INSUFFICIENT_EVIDENCE} description="유효 관측일 30일 이상부터 평가 가능" href="/product-hub?abcGrade=unclassified" tone="sky" />
      <StatusCard label="원천 확인 필요" count={sourceAttention} description="셀피아·광고비 수집 또는 매핑을 확인" href="/product-hub?dataStatus=abc" tone="amber" />
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
      <Link href="/product-hub" className="font-semibold text-emerald-700 hover:underline">계산 완료 {formatNumber(abcStatusCount.READY)}개</Link>
      <span aria-hidden="true">·</span><span>최근 7일 상승 {formatNumber(changes.upgraded)} / 하락 {formatNumber(changes.downgraded)}</span>
      <span className="hidden lg:inline" aria-hidden="true">·</span>
      <span className="text-slate-400">{abcFormula ? `절대평가 v${abcFormula.version} · 반감기 ${abcFormula.halfLifeDays}일` : '상품 관리에서 등급 새로고침을 실행하세요.'}</span>
    </div>
  </section>;
}

function GradeCard({ grade, count, total, contribution }: { grade: ProductAbcGrade; count: number; total: number; contribution: number }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return <Link href={`/product-hub?abcGrade=${grade}`} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md">
    <div className="mb-1 flex items-center justify-between"><span className="text-sm font-bold text-slate-900">{grade}등급</span><span className="text-xs text-slate-400">{GRADE_LABELS[grade]}</span></div>
    <div className="text-2xl font-extrabold tabular-nums text-slate-900">{formatNumber(count)}<span className="ml-0.5 text-sm">개</span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full rounded-full', grade === 'C' ? 'bg-red-500' : 'bg-purple-600')} style={{ width: `${Math.min(percent, 100)}%` }} /></div>
    <div className="mt-1 text-xs text-slate-400">가중 영업이익 {formatNumber(contribution)}원</div>
  </Link>;
}

function StatusCard({ label, count, description, href, tone }: { label: string; count: number; description: string; href: string; tone: 'sky' | 'amber' }) {
  return <Link href={href} className={cn('rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md', tone === 'sky' ? 'border-sky-100 bg-sky-50/60' : 'border-amber-100 bg-amber-50/60')}>
    <div className="mb-1 flex items-center justify-between"><span className="text-sm font-bold text-slate-900">{label}</span><span className="text-xs text-slate-400">평가 상태</span></div>
    <div className="text-2xl font-extrabold tabular-nums text-slate-900">{formatNumber(count)}<span className="ml-0.5 text-sm">개</span></div>
    <div className="mt-3 text-xs text-slate-500">{description}</div>
  </Link>;
}

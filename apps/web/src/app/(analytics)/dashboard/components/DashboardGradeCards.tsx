import Link from 'next/link';
import type { DashboardInventorySummary } from '@kiditem/shared/dashboard';
import { cn, formatDate, formatNumber } from '@/lib/utils';

type ProductAbcGrade = 'A' | 'B' | 'C';

type DashboardGradeCardsProps = Pick<
  DashboardInventorySummary,
  | 'gradeCount'
  | 'classifiedProductCount'
  | 'unclassifiedProductCount'
  | 'abcLifecycleCount'
  | 'abcRiskCount'
  | 'abcContext'
  | 'gradeChanges'
>;

const GRADE_LABELS: Record<ProductAbcGrade, string> = {
  A: '핵심상품',
  B: '성장상품',
  C: '정리대상',
};

export function DashboardGradeCards({
  gradeCount,
  classifiedProductCount,
  unclassifiedProductCount,
  abcLifecycleCount,
  abcRiskCount,
  abcContext,
  gradeChanges,
}: DashboardGradeCardsProps) {
  const changes = gradeChanges ?? { upgraded: 0, downgraded: 0, total: 0 };

  return (
    <section className="space-y-2" aria-label="매출총이익 ABC 포트폴리오 현황">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">매출총이익 ABC</h2>
          <p className="mt-0.5 text-xs text-slate-400">상품 관리에서 정책과 개별 근거를 확인합니다.</p>
        </div>
        <Link href="/product-hub?abcGrade=unclassified" className="text-xs text-slate-400 hover:text-purple-600">
          미분류 {formatNumber(unclassifiedProductCount)}개
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(['A', 'B', 'C'] as const).map((grade) => (
          <OfficialGradeCard
            key={grade}
            grade={grade}
            count={gradeCount[grade] ?? 0}
            classifiedProductCount={classifiedProductCount}
          />
        ))}
        <LifecycleCard
          label="신상품"
          count={abcLifecycleCount.NEW}
          description="3개월 미만 관찰"
          href="/product-hub?abcStage=NEW"
          tone="sky"
        />
        <LifecycleCard
          label="예비 등급"
          count={abcLifecycleCount.PROVISIONAL}
          description="3~5개월 관찰"
          href="/product-hub?abcStage=PROVISIONAL"
          tone="violet"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Link href="/product-hub?abcRisk=LOSS" className="font-semibold text-rose-600 hover:underline">손실 {formatNumber(abcRiskCount.loss)}개</Link>
        <span aria-hidden="true">·</span>
        <Link href="/product-hub?abcRisk=ZERO_VALUE" className="font-semibold text-amber-700 hover:underline">가치 0 {formatNumber(abcRiskCount.zeroValue)}개</Link>
        <span aria-hidden="true">·</span>
        <Link href="/product-hub?abcRisk=DATA_QUALITY" className="font-semibold text-amber-700 hover:underline">데이터 확인 {formatNumber(abcRiskCount.dataQuality)}개</Link>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <span>최근 7일 상승 {formatNumber(changes.upgraded)} / 하락 {formatNumber(changes.downgraded)}</span>
        <span className="hidden lg:inline" aria-hidden="true">·</span>
        <span className="text-slate-400">
          {metricLabel(abcContext.metric)} · 최근 {Math.round(abcContext.periodDays / 30)}개월 · 계산 {formatDate(abcContext.lastCalculatedAt)} · 원본 {formatDate(abcContext.sourceCapturedAt)}
        </span>
      </div>
    </section>
  );
}

function OfficialGradeCard({
  grade,
  count,
  classifiedProductCount,
}: {
  grade: ProductAbcGrade;
  count: number;
  classifiedProductCount: number;
}) {
  const percent = classifiedProductCount > 0
    ? Math.round((count / classifiedProductCount) * 100)
    : 0;
  return (
    <Link
      href={`/product-hub?abcGrade=${grade}`}
      className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">{grade}등급</span>
        <span className="text-xs text-slate-400">{GRADE_LABELS[grade]}</span>
      </div>
      <div className="text-2xl font-extrabold tabular-nums text-slate-900">
        {formatNumber(count)}<span className="ml-0.5 text-sm">개</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', grade === 'C' ? 'bg-red-500' : 'bg-purple-600')}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-slate-400">정식 평가 중 {percent}%</div>
    </Link>
  );
}

function LifecycleCard({
  label,
  count,
  description,
  href,
  tone,
}: {
  label: string;
  count: number;
  description: string;
  href: string;
  tone: 'sky' | 'violet';
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md',
        tone === 'sky' ? 'border-sky-100 bg-sky-50/60' : 'border-violet-100 bg-violet-50/60',
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">{label}</span>
        <span className="text-xs text-slate-400">관찰 단계</span>
      </div>
      <div className="text-2xl font-extrabold tabular-nums text-slate-900">
        {formatNumber(count)}<span className="ml-0.5 text-sm">개</span>
      </div>
      <div className="mt-3 text-xs text-slate-500">{description}</div>
    </Link>
  );
}

function metricLabel(metric: DashboardInventorySummary['abcContext']['metric']): string {
  if (metric === 'GROSS_PROFIT') return '매출총이익';
  return metric === 'SALES_AMOUNT' ? '매출액' : '판매 수량';
}

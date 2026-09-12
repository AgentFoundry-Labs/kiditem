'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useDepartmentQuickActions,
  type DepartmentQuickAction,
} from '../hooks/use-department-quick-actions';
import { DashboardBasisDisclosure, type DashboardMetricBasis } from './DashboardDataBasis';

const DashboardCharts = dynamic(
  () => import('./DashboardCharts').then((mod) => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="h-[320px] flex items-center justify-center text-sm text-slate-300">차트 로딩 중...</div> },
);

type DailyTrendPoint = {
  date: string;
  revenue: number | null;
  profit: number | null;
  adCost: number | null;
  profitRate: number | null;
  adRate: number | null;
  evidence: {
    revenue: DashboardMetricBasis | null;
    profit: DashboardMetricBasis | null;
    adCost: DashboardMetricBasis | null;
  };
};

type IndustryBenchmark = {
  myAdRate?: number | null;
  myRoas?: number | null;
  myCtr?: number | null;
  myCvr?: number | null;
};

// 인라인 실행 액션 — 대시보드에서 바로 실행한다(페이지 이동 없음).
type DeptButton =
  | { label: string; kind: 'action'; action: DepartmentQuickAction }
  // 링크 — 관리 화면(상품)은 해당 페이지로 이동.
  | { label: string; kind: 'link'; href: string };


const ACTION_LABEL: Record<DepartmentQuickAction, string> = {
  collectTrend: '시장분석 수집',
  refreshInventory: '재고 분석 업데이트',
  syncSellpia: '셀피아 동기화',
  collectAllOrders: '몰 주문수집',
  collectCoupangShipmentSummary: '쿠팡 쉽먼트 조회',
  collectCoupangRocketPurchaseOrders: '쿠팡 로켓 PO 수집',
};

/**
 * One cell per collection, flat.
 *
 * The row used to be five departments holding eight entries, and two of those
 * entries were navigation — `상품 관리`, `재고 관리` — drawn exactly like the six
 * that open a browser and run for minutes. A link and a multi-minute collection
 * should not look the same, and the sidebar already carries both screens, so the
 * links are gone and the departments with them: a five-way taxonomy over six
 * items made the reader take one step more to find the one they wanted.
 *
 * Every promoted action is kept. Those are the route's contract; the grouping
 * was not.
 */
const COLLECTIONS: ReadonlyArray<{
  key: string;
  label: string;
  action: DepartmentQuickAction;
}> = [
  { key: 'sourcing', label: '시장분석', action: 'collectTrend' },
  { key: 'order', label: '몰 주문수집', action: 'collectAllOrders' },
  { key: 'shipping', label: '쿠팡 쉽먼트', action: 'collectCoupangShipmentSummary' },
  { key: 'rocket', label: '쿠팡 로켓 PO', action: 'collectCoupangRocketPurchaseOrders' },
  { key: 'inventory', label: '재고 분석', action: 'refreshInventory' },
  { key: 'sellpia', label: '셀피아 동기화', action: 'syncSellpia' },
];

export function DashboardChartPanel({
  dailyTrend,
  industryBenchmark,
  benchmarkBases,
  rangeLabel,
}: {
  dailyTrend: DailyTrendPoint[];
  industryBenchmark?: IndustryBenchmark;
  benchmarkBases?: {
    adRate: DashboardMetricBasis | null;
    roas: DashboardMetricBasis | null;
    ctr: DashboardMetricBasis | null;
    cvr: DashboardMetricBasis | null;
  };
  /** The window the chart actually drew, so the header cannot claim another. */
  rangeLabel: string;
}) {
  const [chartTab, setChartTab] = useState<'revenue' | 'rate' | 'benchmark'>('revenue');
  // A row with all nullable metrics missing is an evidence gap, not a usable
  // trend. Keep the row for the x-axis (and the chart's null gap), but only
  // enable trend tabs when at least one measured value exists.
  const hasTrend = dailyTrend.some((point) => point.revenue !== null || point.profit !== null || point.adCost !== null);
  const hasBenchmark = !!industryBenchmark;

  const quickActions = useDepartmentQuickActions();
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const runAction = async (deptKey: string, action: DepartmentQuickAction) => {
    const id = `${deptKey}:${action}`;
    if (runningAction) return;
    setRunningAction(id);
    const label = ACTION_LABEL[action];
    try {
      await quickActions.start(action);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${label} 실패`);
    } finally {
      setRunningAction(null);
    }
  };

  const tabs = [
    { key: 'revenue' as const, label: '매출 · 광고비' },
    { key: 'rate' as const, label: '이익률' },
    ...(hasBenchmark ? [{ key: 'benchmark' as const, label: '업계 기준(참고)' }] : []),
  ];

  const adChartData = dailyTrend.map((point) => ({
    date: point.date,
    adCost: point.adCost,
    revenue: point.revenue,
    adRate: point.adRate,
    evidence: point.evidence,
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setChartTab(tab.key)}
                className={cn('rounded-md px-2.5 py-1 text-[13px] font-semibold transition-colors', chartTab === tab.key ? 'bg-violet-600 text-white' : 'text-slate-600 hover:text-slate-900')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* One ⓘ for the panel, in the place every other panel keeps it. Two
              sentences of prose used to sit under the chart telling the reader
              where to look for evidence, and a `최근 30일` caption repeated the
              window the ⓘ states; the affordance is the evidence. */}
          <DashboardBasisDisclosure
            label="차트 근거"
            entries={[
              { label: '광고비율', basis: benchmarkBases?.adRate ?? null },
              { label: 'ROAS', basis: benchmarkBases?.roas ?? null },
              { label: 'CTR', basis: benchmarkBases?.ctr ?? null },
              { label: 'CVR', basis: benchmarkBases?.cvr ?? null },
            ]}
          />
        </div>
      </div>

      <DashboardCharts
        chartTab={chartTab}
        dailyTrend={dailyTrend}
        adChartData={adChartData}
        benchmarkData={industryBenchmark ? [
          { name: '광고비율', my: industryBenchmark.myAdRate ?? null, unit: '%', basis: benchmarkBases?.adRate ?? null },
          { name: 'ROAS', my: industryBenchmark.myRoas ?? null, unit: '%', basis: benchmarkBases?.roas ?? null },
          { name: 'CTR', my: industryBenchmark.myCtr ?? null, unit: '%', basis: benchmarkBases?.ctr ?? null },
          { name: 'CVR', my: industryBenchmark.myCvr ?? null, unit: '%', basis: benchmarkBases?.cvr ?? null },
        ] : null}
        hasTrend={hasTrend}
      />
      {/* Agent OS — the same departments and the same promoted actions, folded
          into one row under the chart. It was a tab holding a full-height board
          to show five idle agents; as a row it stays reachable without deciding
          the height of the screen. */}
      <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
        {COLLECTIONS.map(collection => {
          const running = runningAction === `${collection.key}:${collection.action}`;
          return (
            <button
              key={collection.key}
              type="button"
              onClick={() => void runAction(collection.key, collection.action)}
              disabled={runningAction !== null}
              className="flex flex-col items-start bg-white px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <span className="flex w-full items-center gap-1.5">
                {running
                  ? <Loader2 size={12} className="shrink-0 animate-spin text-violet-600" />
                  : <Play size={12} className="shrink-0 text-slate-400" />}
                <span className="truncate text-[13px] font-semibold text-slate-900">{collection.label}</span>
              </span>
              {/* The slot the collection's own state belongs in. Today it holds
                  only "running", because the dashboard read model publishes an
                  `observedAt` for Wing traffic and for the inventory snapshot and
                  for nothing else — the four other collections have no freshness
                  to show yet. The line is reserved so the row will not step when
                  they gain one. */}
              <span className="mt-0.5 truncate text-[11px] text-slate-500">
                {running ? '수집 중…' : '\u00a0'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

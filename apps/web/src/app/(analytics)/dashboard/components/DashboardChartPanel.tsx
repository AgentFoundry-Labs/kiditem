'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, Loader2, Play } from 'lucide-react';
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

type Dept = {
  key: string;
  label: string;
  buttons: readonly DeptButton[];
};

const ACTION_LABEL: Record<DepartmentQuickAction, string> = {
  collectTrend: '시장분석 수집',
  refreshInventory: '재고 분석 업데이트',
  syncSellpia: '셀피아 동기화',
  collectAllOrders: '몰 주문수집',
  collectCoupangShipmentSummary: '쿠팡 쉽먼트 조회',
  collectCoupangRocketPurchaseOrders: '쿠팡 로켓 PO 수집',
};

const DEPT_MAP: readonly Dept[] = [
  {
    key: 'sourcing', label: '소싱',
    buttons: [{ label: '시장분석', kind: 'action', action: 'collectTrend' }],
  },
  {
    key: 'product', label: '상품',
    buttons: [
      { label: '상품 관리', kind: 'link', href: '/product-hub' },
      { label: '재고 관리', kind: 'link', href: '/inventory-hub' },
    ],
  },
  {
    key: 'order', label: '주문',
    buttons: [{ label: '몰 주문수집', kind: 'action', action: 'collectAllOrders' }],
  },
  {
    key: 'shipping', label: '출고',
    buttons: [
      { label: '쿠팡 쉽먼트', kind: 'action', action: 'collectCoupangShipmentSummary' },
      { label: '쿠팡 로켓 PO 수집', kind: 'action', action: 'collectCoupangRocketPurchaseOrders' },
    ],
  },
  {
    key: 'analysis', label: '분석',
    buttons: [
      { label: '재고 분석 업데이트', kind: 'action', action: 'refreshInventory' },
      { label: '셀피아 동기화', kind: 'action', action: 'syncSellpia' },
    ],
  },
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setChartTab(tab.key)}
                className={cn('rounded-md px-2.5 py-1 text-xs font-semibold transition-colors', chartTab === tab.key ? 'bg-violet-600 text-white' : 'text-slate-600 hover:text-slate-900')}
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
      {/* One column per department, so there is no gap where a sixth used to be.
          The department name is a label, not a status: colouring five of them
          five different accents made the row read as five objects and left the
          action text competing with its own heading. */}
      <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">
        {DEPT_MAP.map(dept => (
          <div key={dept.key} className="bg-white px-2.5 py-1.5">
            <p className="truncate text-xs font-semibold text-slate-900">{dept.label}</p>
            <ul className="mt-0.5 space-y-0.5">
              {dept.buttons.map(button => button.kind === 'action' ? (
                <li key={`${dept.key}:${button.action}`}>
                  <button
                    type="button"
                    onClick={() => void runAction(dept.key, button.action)}
                    disabled={runningAction !== null}
                    className="flex w-full items-center gap-1 text-left text-[11px] leading-snug text-slate-600 hover:text-slate-900 disabled:opacity-60"
                  >
                    {runningAction === `${dept.key}:${button.action}`
                      ? <Loader2 size={10} className="shrink-0 animate-spin" />
                      : <Play size={10} className="shrink-0 text-slate-400" />}
                    <span className="truncate">{button.label}</span>
                  </button>
                </li>
              ) : (
                <li key={button.href}>
                  <Link
                    href={button.href}
                    className="flex items-center gap-1 text-[11px] leading-snug text-slate-600 hover:text-slate-900"
                  >
                    <ArrowRight size={10} className="shrink-0 text-slate-400" />
                    <span className="truncate">{button.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

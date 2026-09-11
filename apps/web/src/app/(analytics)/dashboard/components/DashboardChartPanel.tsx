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
import { type DashboardMetricBasis } from './DashboardDataBasis';

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
  color: string;
  faceColor: string;
  faceRole: string;
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
    key: 'sourcing', label: '소싱', color: '#8b5cf6', faceColor: 'violet', faceRole: 'sourcing',
    buttons: [{ label: '시장분석', kind: 'action', action: 'collectTrend' }],
  },
  {
    key: 'product', label: '상품', color: '#10b981', faceColor: 'emerald', faceRole: 'inventory',
    buttons: [
      { label: '상품 관리', kind: 'link', href: '/product-hub' },
      { label: '재고 관리', kind: 'link', href: '/inventory-hub' },
    ],
  },
  {
    key: 'order', label: '주문', color: '#f59e0b', faceColor: 'amber', faceRole: 'order',
    buttons: [{ label: '몰 주문수집', kind: 'action', action: 'collectAllOrders' }],
  },
  {
    key: 'shipping', label: '출고', color: '#0ea5e9', faceColor: 'cyan', faceRole: 'shipping',
    buttons: [
      { label: '쿠팡 쉽먼트', kind: 'action', action: 'collectCoupangShipmentSummary' },
      { label: '쿠팡 로켓 PO 수집', kind: 'action', action: 'collectCoupangRocketPurchaseOrders' },
    ],
  },
  {
    key: 'analysis', label: '분석', color: '#ef4444', faceColor: 'rose', faceRole: 'finance',
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
}: {
  dailyTrend: DailyTrendPoint[];
  industryBenchmark?: IndustryBenchmark;
  benchmarkBases?: {
    adRate: DashboardMetricBasis | null;
    roas: DashboardMetricBasis | null;
    ctr: DashboardMetricBasis | null;
    cvr: DashboardMetricBasis | null;
  };
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
        <span className="text-[11px] text-slate-500">최근 30일</span>
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
      {chartTab === 'benchmark' && (
        <div className="px-5 pb-3 text-[11px] text-slate-400">
          지표별 기준 근거는 각 카드에서 확인할 수 있습니다.
        </div>
      )}
      {(chartTab === 'revenue' || chartTab === 'rate') && (
        <div className="px-5 pb-3 text-[11px] text-slate-400">
          날짜별 원천 근거와 누락 여부는 각 점의 툴팁에서 확인할 수 있습니다.
        </div>
      )}
      {/* Agent OS — the same departments and the same promoted actions, folded
          into one row under the chart. It was a tab holding a full-height board
          to show five idle agents; as a row it stays reachable without deciding
          the height of the screen. */}
      <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
        {DEPT_MAP.map(dept => (
          <div key={dept.key} className="bg-white px-2.5 py-1.5">
            <p className="truncate text-xs font-semibold" style={{ color: dept.color }}>{dept.label}</p>
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
                      : <Play size={10} className="shrink-0" style={{ color: dept.color }} />}
                    <span className="truncate">{button.label}</span>
                  </button>
                </li>
              ) : (
                <li key={button.href}>
                  <Link
                    href={button.href}
                    className="flex items-center gap-1 text-[11px] leading-snug text-slate-600 hover:text-slate-900"
                  >
                    <ArrowRight size={10} className="shrink-0" style={{ color: dept.color }} />
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

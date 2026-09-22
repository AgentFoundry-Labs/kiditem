'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useDepartmentQuickActions,
  type DashboardCollectionControl,
  type DepartmentQuickAction,
} from '../hooks/use-department-quick-actions';
import { DashboardBasisDisclosure, type DashboardMetricBasis } from './DashboardDataBasis';
import { useCollectionFreshness } from '../hooks/use-collection-freshness';

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
  /** What this actually does, for the cell's tooltip. */
  hint: string;
  /**
   * What the state line says when this collection publishes no run to read.
   * Two of the six do not, and each for its own reason worth stating.
   */
  standing: string;
}> = [
  {
    key: 'sourcing', label: '시장분석', action: 'collectTrend',
    hint: '네이버·쇼츠 트렌드 소스를 수집합니다.',
    standing: '소싱 화면에서 확인',
  },
  {
    key: 'order', label: '몰 주문수집', action: 'collectAllOrders',
    hint: '연결된 모든 몰의 주문을 내려받아 셀피아 변환 파일을 만듭니다.',
    standing: '미수집',
  },
  {
    key: 'shipping', label: '쿠팡 쉽먼트', action: 'collectCoupangShipmentSummary',
    hint: '쿠팡 Wing의 날짜별 출고 요약을 수집합니다.',
    standing: '미수집',
  },
  {
    key: 'rocket', label: '쿠팡 로켓 PO', action: 'collectCoupangRocketPurchaseOrders',
    hint: '쿠팡 로켓 발주서와 상세 품목을 수집합니다.',
    standing: '미수집',
  },
  {
    key: 'inventory', label: '재고 분석', action: 'refreshInventory',
    hint: '이미 수집된 재고·판매 데이터로 분석을 다시 계산합니다.',
    standing: '수집이 아닌 재계산',
  },
  {
    key: 'sellpia', label: '셀피아 동기화', action: 'syncSellpia',
    hint: '셀피아 재고를 동기화합니다.',
    standing: '미수집',
  },
];

type CellView = Readonly<{
  busy: boolean;
  disabled: boolean;
  /** What the state line says instead of the last completion; null keeps it. */
  line: string | null;
  tone: 'active' | 'warning' | 'error' | null;
}>;

const CELL_TONE_CLASS: Record<NonNullable<CellView['tone']>, string> = {
  active: 'font-medium text-violet-700',
  warning: 'font-medium text-amber-700',
  error: 'font-medium text-red-700',
};

/** A collection with a shared control shows what its source reports, as every other screen does. */
function sharedCell(control: DashboardCollectionControl): CellView {
  const notice = control.notice
    ? {
      line: control.notice.message,
      tone: control.notice.tone === 'error' ? 'error' as const
        : control.notice.tone === 'refused' ? 'warning' as const
        : null,
    }
    : null;
  switch (control.state) {
    case 'loading':
      return { busy: false, disabled: true, line: '상태 확인 중', tone: null };
    case 'unavailable':
      return { busy: false, disabled: true, line: '상태 확인 필요', tone: 'error' };
    case 'starting':
      return { busy: true, disabled: true, line: '시작 요청 중…', tone: 'active' };
    case 'stopping':
      return { busy: true, disabled: true, line: '중단 요청 중…', tone: 'active' };
    case 'running':
      return {
        busy: true,
        disabled: true,
        line: notice?.line
          ?? (control.running?.scopeLabel ? `수집 중 · ${control.running.scopeLabel}` : '수집 중'),
        tone: notice?.tone ?? 'active',
      };
    default:
      return { busy: false, disabled: false, line: notice?.line ?? null, tone: notice?.tone ?? null };
  }
}

/** A collection without a shared control waits only on its own start. */
function localCell(action: DepartmentQuickAction, pending: boolean): CellView {
  if (!pending) return { busy: false, disabled: false, line: null, tone: null };
  return {
    busy: true,
    disabled: true,
    // 재고 분석 re-reads collected data; it never collects.
    line: action === 'refreshInventory' ? '다시 불러오는 중…' : '수집 중…',
    tone: 'active',
  };
}

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
  const freshnessOf = useCollectionFreshness();
  // Cells without a shared control wait only on their own start. A shared
  // control's state comes from its source, so no cell waits on another.
  const pendingActions = useRef(new Set<DepartmentQuickAction>());
  const [pendingCells, setPendingCells] = useState<ReadonlySet<DepartmentQuickAction>>(() => new Set());

  const runAction = async (action: DepartmentQuickAction) => {
    const shared = Boolean(quickActions.controls[action]);
    if (!shared) {
      if (pendingActions.current.has(action)) return;
      pendingActions.current.add(action);
      setPendingCells(new Set(pendingActions.current));
    }
    try {
      await quickActions.start(action);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${ACTION_LABEL[action]} 실패`);
    } finally {
      if (!shared) {
        pendingActions.current.delete(action);
        setPendingCells(new Set(pendingActions.current));
      }
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
      {/* The row is a shelf of collections, and it says so. Six icons in a
          line said only that six things were clickable — not that clicking one
          opens a browser and runs for minutes, and not whether it needs running
          at all. The heading names the shelf; each cell carries when it last
          finished. */}
      <div className="border-t border-slate-200">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <span className="text-[13px] font-semibold text-slate-900">데이터 수집</span>
          <span className="text-[11px] text-slate-500">
            누르면 브라우저가 열려 수집합니다
          </span>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
          {COLLECTIONS.map(collection => {
            const control = quickActions.controls[collection.action];
            const cell = control
              ? sharedCell(control)
              : localCell(collection.action, pendingCells.has(collection.action));
            const freshness = freshnessOf(collection.action);
            return (
              <div key={collection.key} className="flex items-center bg-white">
                <button
                  type="button"
                  onClick={() => void runAction(collection.action)}
                  disabled={cell.disabled}
                  title={collection.hint}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  <span className="flex w-full items-center gap-1.5">
                    {cell.busy
                      ? <Loader2 size={13} className="shrink-0 animate-spin text-violet-600" />
                      : <Play size={13} className="shrink-0 text-slate-400" />}
                    <span className="truncate text-[13px] font-semibold text-slate-900">{collection.label}</span>
                  </span>
                  {/* Never a blank: a collection that publishes no run says that,
                      rather than looking like one that has never run. */}
                  <span className={cn(
                    'truncate text-[11px]',
                    cell.tone ? CELL_TONE_CLASS[cell.tone]
                      : !cell.line && freshness?.label === '미수집' ? 'font-medium text-amber-700'
                      : 'text-slate-500',
                  )}>
                    {cell.line ?? freshness?.label ?? collection.standing}
                  </span>
                </button>
                {control?.canStop && control.state === 'running' && (
                  <button
                    type="button"
                    onClick={control.stop}
                    className="mr-2 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    수집 중단
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

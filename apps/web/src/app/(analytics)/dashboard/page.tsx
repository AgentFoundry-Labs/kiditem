'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  Database,
  Megaphone,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DashboardSalesSummarySchema,
  DashboardAdSummarySchema,
  DashboardInventorySummarySchema,
  DashboardTrendItemSchema,
  type DashboardSalesSummary,
  type DashboardAdSummary,
  type DashboardInventorySummary,
  type TrafficKpi,
} from '@kiditem/shared/dashboard';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber, formatDateTime } from '@/lib/utils';
import { friendlyError } from '@/lib/api-error';
import ReadinessModal from '@/components/ReadinessModal';
import { useSellpiaChannelSales, sellpiaPeriodRange } from '@/hooks/useSellpiaChannelSales';
import { DashboardChartPanel } from './components/DashboardChartPanel';
import { MetricCard, UnavailableMetricCard } from './components/DashboardMetricCard';
import { DashboardProfitDetailModal } from './components/DashboardProfitDetailModal';
import { DashboardSidePanel } from './components/DashboardSidePanel';
import { DashboardTopProducts } from './components/DashboardTopProducts';
import { DashboardAdPerformance } from './components/DashboardAdPerformance';
import { DashboardTrafficFunnel } from './components/DashboardTrafficFunnel';
import { DashboardWarningTable, buildWarningRows } from './components/DashboardWarningTable';
import { DashboardExpenseAmount } from './components/DashboardExpenseAmount';
import { DashboardGradeCards } from './components/DashboardGradeCards';
import { WingDailyTrafficCollection } from './components/WingDailyTrafficCollection';
import {
  DashboardBasisDisclosure,
  DashboardDataBasis,
  basisHasValues,
  readFirstMetricBasis,
  readMetricBasis,
  type BasisBreakdownEntry,
  type DashboardMetricBasis,
  type MetricBasisCarrier,
} from './components/DashboardDataBasis';

type TrafficMetric = 'views' | 'cartAdds' | 'orders' | 'salesQty' | 'revenue';

const trafficMetricLabels: ReadonlyArray<readonly [TrafficMetric, string]> = [
  ['views', '조회'],
  ['cartAdds', '장바구니'],
  ['orders', '주문'],
  ['salesQty', '판매량'],
  ['revenue', '매출'],
];

function trafficMetricValue(kpi: TrafficKpi | undefined, metric: TrafficMetric): number | null {
  if (!kpi || kpi.reconciliation?.[metric]?.status === 'MISMATCH') return null;
  return kpi[metric] ?? null;
}

function formatTrafficMetric(value: number | null, unit: string): string {
  return value === null ? '—' : `${formatNumber(value)}${unit}`;
}

function nullableValue<T>(value: T | null | undefined, fallback: T | null | undefined): T | null {
  return value === undefined ? fallback ?? null : value;
}

/**
 * A warning count is only a measured value when its own basis says so. Without
 * a verified basis the card shows the unavailable marker instead of a number.
 */
function formatWarningCount(value: number | null | undefined, basis: DashboardMetricBasis | null): string {
  if (!basisHasValues(basis) || value === null || value === undefined) return '—';
  return formatNumber(value);
}

function formatNullableKRW(value: number | null): string {
  return value === null ? '—' : `${formatKRW(value)}원`;
}

function formatNullablePercent(value: number | null, digits = 1): string {
  return value === null ? '—' : `${value.toFixed(digits)}%`;
}

function percentage(value: number | null, base: number | null): number | null {
  return value !== null && base !== null && base > 0 ? (value / base) * 100 : null;
}

function coverageIsIncomplete(
  coverage: { targetDays: number; completedDays: number; missingDates: string[] } | null,
): boolean {
  return coverage !== null
    && (coverage.completedDays < coverage.targetDays || coverage.missingDates.length > 0);
}

function coverageNote(
  coverage: { targetDays: number; completedDays: number; missingDates: string[] } | null,
): string | null {
  if (!coverage || !coverageIsIncomplete(coverage)) return null;
  return `부분 커버리지 · ${coverage.completedDays}/${coverage.targetDays}일 · 누락 ${coverage.missingDates.length}일`;
}

function rangeMetricBasis(
  value: MetricBasisCarrier,
  range: 'month' | 'week' | 'day' | 'custom',
  rangeKey: string,
  monthKey: string | null = rangeKey,
): DashboardMetricBasis | null {
  if (range === 'month' && monthKey !== null) {
    const monthlyBasis = readMetricBasis(value, `monthly.${monthKey}`);
    if (monthlyBasis) return monthlyBasis;
  }
  return readMetricBasis(value, `rangeKpi.${rangeKey}`);
}

function ExpenseAmountOrUnavailable({ amount }: { amount: number | null }) {
  return amount === null
    ? <span className="font-mono tabular-nums text-slate-300">—</span>
    : <DashboardExpenseAmount amount={amount} />;
}

const EMPTY_SALES_SUMMARY: DashboardSalesSummary = {
  today: { revenue: 0, orders: 0 },
  monthly: {
    revenue: null,
    wingRevenue: null,
    profit: null,
    adRate: null,
    prevRevenue: null,
    prevProfit: null,
    revenueChange: null,
    profitChange: null,
    prevAdRate: null,
    available: false,
    previousAvailable: false,
  },
  topProducts: [],
  monthlyTrend: [],
};

const EMPTY_AD_SUMMARY: DashboardAdSummary = {
  monthly: {
    roas: null,
    ctr: null,
    adRevenue: null,
    totalAdSpend: null,
    prevRoas: null,
    prevCtr: null,
    prevAdRevenue: null,
    prevTotalAdSpend: null,
    coverage: null,
  },
};

const EMPTY_INVENTORY_SUMMARY: DashboardInventorySummary = {
  totalProducts: 0,
  channelLinkedProducts: 0,
  channelUnlinkedProducts: 0,
  gradeCount: { A: 0, B: 0, C: 0 },
  abcStatusCount: {
    READY: 0,
    INSUFFICIENT_EVIDENCE: 0,
    SOURCE_UNMAPPED: 0,
    SELLPIA_SOURCE_STALE: 0,
    AD_SOURCE_STALE: 0,
  },
  abcContributionProfit: { amountByGrade: { A: 0, B: 0, C: 0 }, shareByGrade: { A: 0, B: 0, C: 0 } },
  abcFormula: null,
  classifiedProductCount: 0,
  unclassifiedProductCount: 0,
  mappingStatusCounts: { matched: 0, unmatched: 0, needsReview: 0 },
  alerts: [],
  warnings: { minusProducts: 0, lowProfitProducts: 0, highAdProducts: 0, outOfStockSkus: 0, mappingAttentionSkus: 0 },
};

function DashboardSectionEmpty({ label }: { label: string }) {
  return <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">{label} 데이터가 없습니다.</div>;
}

/**
 * A read that failed is not a read that returned nothing, so this never
 * borrows the empty state's wording. The section keeps its place and says the
 * value could not be read; the one page-level retry is what re-runs it.
 */
function DashboardSectionUnavailable({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-1 py-6 text-center', className)}
      data-testid="dashboard-section-unavailable"
      data-section={label}
    >
      <span className="text-sm font-semibold text-red-600">읽기 실패</span>
      <span className="text-xs text-slate-400">{label} 값을 읽지 못했습니다. 위 알림의 다시 시도를 눌러 주세요.</span>
    </div>
  );
}

/** One failed dashboard read, named in the words the section header uses. */
type DashboardReadFailure = {
  key: string;
  label: string;
  message: string;
  retry: () => void;
};

/**
 * One notice for the whole page instead of a retry button per section: a
 * single failed read used to stack identical buttons down the dashboard. It
 * names every source that failed and re-runs exactly those.
 */
function DashboardReadFailureNotice({ failures }: { failures: readonly DashboardReadFailure[] }) {
  if (failures.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="dashboard-read-failure"
      className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-red-700">
          읽기 실패 · {failures.map((failure) => failure.label).join(', ')}
        </p>
        <ul className="mt-1 space-y-0.5">
          {failures.map((failure) => (
            <li key={failure.key} className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-red-600">
              <span className="font-medium">{failure.label}</span>
              <span aria-hidden="true" className="text-red-300">·</span>
              <span>{failure.message}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-red-500">
          읽지 못한 값만 ‘읽기 실패’로 표시되고, 성공한 값은 그대로 유지됩니다.
        </p>
      </div>
      <button
        type="button"
        onClick={() => failures.forEach((failure) => failure.retry())}
        className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
      >
        다시 시도
      </button>
    </div>
  );
}

/**
 * A section header carries one ⓘ for every value below it. The affordance is
 * section-level; the explanation behind it stays per value.
 */
function DashboardSectionHeader({
  title,
  scope,
  disclosureLabel,
  entries,
}: {
  title: string;
  scope: string;
  disclosureLabel: string;
  entries: readonly BasisBreakdownEntry[];
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-[11px] text-slate-400">{scope}</span>
      </div>
      {/* The app shell parks a fixed quick-action button over the right edge
          at every scroll position, and this is the only way to the evidence
          behind the section, so it keeps clear of that strip. */}
      <DashboardBasisDisclosure label={disclosureLabel} entries={entries} className="mr-16" />
    </div>
  );
}

type TrendEvidence = {
  revenue: DashboardMetricBasis | null;
  profit: DashboardMetricBasis | null;
  adCost: DashboardMetricBasis | null;
};

function fillTrendDateGaps(rows: Array<{
  date: string;
  revenue: number | null;
  profit: number | null;
  adCost: number | null;
  evidence: TrendEvidence;
}>) {
  if (rows.length < 2) return rows;
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const sortedDates = rows.map((row) => row.date).sort();
  const start = Date.parse(`${sortedDates[0]}T00:00:00.000Z`);
  const end = Date.parse(`${sortedDates[sortedDates.length - 1]}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return rows;
  const filled: Array<{
    date: string;
    revenue: number | null;
    profit: number | null;
    adCost: number | null;
    evidence: TrendEvidence;
  }> = [];
  for (let cursor = start; cursor <= end; cursor += 24 * 60 * 60 * 1000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    filled.push(byDate.get(date) ?? {
      date,
      revenue: null,
      profit: null,
      adCost: null,
      evidence: { revenue: null, profit: null, adCost: null },
    });
  }
  return filled;
}

export default function Dashboard() {
  const queryClient = useQueryClient();

  const [showProfitDetail, setShowProfitDetail] = useState(false);
  const [kpiRange, setKpiRange] = useState<'month' | 'week' | 'day' | 'custom'>('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showReadiness, setShowReadiness] = useState(false);
  const requestReadinessOpen = useCallback(() => setShowReadiness(true), []);
  const channelSales = useSellpiaChannelSales(sellpiaPeriodRange(kpiRange, dateFrom, dateTo));

  // Baseline (month) — always fetched
  const {
    data: salesBaseline,
    isLoading: salesBaselineLoading,
    isError: salesBaselineHasErr,
    error: salesBaselineError,
    refetch: refetchSalesBaseline,
  } = useQuery({
    queryKey: queryKeys.dashboard.salesBaseline(),
    queryFn: () => apiClient.getParsed('/api/dashboard/sales', DashboardSalesSummarySchema),
    refetchInterval: 60_000,
  });

  const {
    data: adBaseline,
    isLoading: adBaselineLoading,
    isError: adBaselineHasErr,
    error: adBaselineError,
    refetch: refetchAdBaseline,
  } = useQuery({
    queryKey: queryKeys.dashboard.adBaseline(),
    queryFn: () => apiClient.getParsed('/api/dashboard/ad', DashboardAdSummarySchema),
    refetchInterval: 60_000,
  });

  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    isError: inventoryHasErr,
    error: inventoryError,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: queryKeys.dashboard.inventory(),
    queryFn: () => apiClient.getParsed('/api/dashboard/inventory', DashboardInventorySummarySchema),
    refetchInterval: 60_000,
  });

  const {
    data: trendData = [],
    isLoading: trendLoading,
    isError: trendHasErr,
    error: trendError,
    refetch: refetchTrend,
  } = useQuery({
    queryKey: queryKeys.dashboard.trend('30d'),
    queryFn: () =>
      apiClient.getParsed('/api/dashboard/trend?range=30d', z.array(DashboardTrendItemSchema)),
    refetchInterval: 60_000,
  });

  // Range-aware — enabled when not month; custom requires both dates
  const rangeEnabled = kpiRange === 'custom' ? (!!dateFrom && !!dateTo) : kpiRange !== 'month';

  const {
    data: salesRange,
    isLoading: salesRangeLoading,
    isError: salesRangeHasErr,
    error: salesRangeError,
    refetch: refetchSalesRange,
  } = useQuery({
    queryKey: queryKeys.dashboard.salesRange(kpiRange, dateFrom, dateTo),
    queryFn: () => {
      const params = kpiRange === 'custom' && dateFrom && dateTo
        ? `?range=custom&from=${dateFrom}&to=${dateTo}`
        : `?range=${kpiRange}`;
      return apiClient.getParsed(`/api/dashboard/sales${params}`, DashboardSalesSummarySchema);
    },
    enabled: rangeEnabled,
    refetchInterval: 60_000,
  });

  const {
    data: adRange,
    isLoading: adRangeLoading,
    isError: adRangeHasErr,
    error: adRangeError,
    refetch: refetchAdRange,
  } = useQuery({
    queryKey: queryKeys.dashboard.adRange(kpiRange, dateFrom, dateTo),
    queryFn: () => {
      const params = kpiRange === 'custom' && dateFrom && dateTo
        ? `?range=custom&from=${dateFrom}&to=${dateTo}`
        : `?range=${kpiRange}`;
      return apiClient.getParsed(`/api/dashboard/ad${params}`, DashboardAdSummarySchema);
    },
    enabled: rangeEnabled,
    refetchInterval: 60_000,
  });

  const applyCustomRange = useCallback(() => {
    if (!dateFrom || !dateTo) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.salesRange('custom', dateFrom, dateTo) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.adRange('custom', dateFrom, dateTo) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.sellpiaSalesAll() });
  }, [dateFrom, dateTo, queryClient]);

  // A selected range is authoritative. A failed or still-loading range must
  // not silently fall back to the baseline month.
  const effectiveSales = kpiRange === 'month' ? salesBaseline : salesRange;
  const effectiveAd = kpiRange === 'month' ? adBaseline : adRange;
  const baselineSales = salesBaseline ?? EMPTY_SALES_SUMMARY;
  const baselineAd = adBaseline ?? EMPTY_AD_SUMMARY;
  const inventory = inventoryData ?? EMPTY_INVENTORY_SUMMARY;

  // Keep the dashboard shell visible while individual read models load or
  // fail. Only the all-three initial request state uses the page skeleton.
  if (inventoryLoading && salesBaselineLoading && adBaselineLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const selectedRangeLoading = kpiRange === 'month'
    ? false
    : kpiRange === 'custom' && (!dateFrom || !dateTo)
      ? false
      : salesRangeLoading || adRangeLoading;
  const rangeLabelMap: Record<string, string> = { month: '월', week: '주', day: '일', custom: '기간' };
  // Range label derived from local state (not server)
  const rangeLabel = kpiRange !== 'month' ? (rangeLabelMap[kpiRange] ?? '월') : '월';

  // 서버가 effectivePeriod.revenueSource 에 맞춰 monthly/rangeKpi 를 이미
  // (Order 또는 Wing daily-fact) 출처로 채워준다. UI 에서는 source 별 분기 없이
  // rangeKpi 우선, baseline 폴백.
  const rk = effectiveSales?.rangeKpi;
  const rkAd = effectiveAd?.rangeKpi;
  const salesMonthly = effectiveSales?.monthly ?? (kpiRange === 'month' ? baselineSales.monthly : EMPTY_SALES_SUMMARY.monthly);
  // A range payload is authoritative even when one of its nullable fields is
  // null. Only fall back when that range field is absent, never when it says
  // the metric is unavailable.
  const kpiRevenue = rk ? rk.revenue : salesMonthly.revenue;
  const kpiProfit = rk ? rk.profit : salesMonthly.profit;
  const kpiPrevRevenue = rk ? rk.prevRevenue : salesMonthly.prevRevenue;
  const kpiPrevProfit = rk ? rk.prevProfit : salesMonthly.prevProfit;
  const revenueChange = rk ? rk.revenueChange : salesMonthly.revenueChange;
  const profitChange = rk ? rk.profitChange : salesMonthly.profitChange;
  const profitRate = rk && rk.profitRate !== undefined
    ? rk.profitRate
    : percentage(salesMonthly.profit, salesMonthly.revenue);
  const prevProfitRate = rk && rk.prevProfitRate !== undefined
    ? rk.prevProfitRate
    : percentage(salesMonthly.prevProfit, salesMonthly.prevRevenue);
  const profitRateChange = rk && rk.profitRateChange !== undefined
    ? rk.profitRateChange
    : profitRate !== null && prevProfitRate !== null ? profitRate - prevProfitRate : null;
  const adMonthly = effectiveAd?.monthly ?? (kpiRange === 'month' ? baselineAd.monthly : EMPTY_AD_SUMMARY.monthly);
  const adKpi = effectiveAd?.adKpi;
  const rawAdConvRevenue = rkAd
    ? rkAd.adConvRevenue
    : nullableValue(adKpi?.convRevenue, adMonthly.adRevenue);
  const rawAdRoas = rkAd
    ? rkAd.adRoas
    : nullableValue(adKpi?.roas, adMonthly.roas);
  const rawAdPrevRoas = rkAd
    ? rkAd.prevAdRoas ?? null
    : nullableValue(adKpi?.prevRoas, adMonthly.prevRoas);
  const adCoverage = rkAd
    ? rkAd.coverage ?? null
    : nullableValue(adKpi?.coverage, adMonthly.coverage);
  // Partial evidence still supports the values that were actually measured.
  // Coverage is disclosed beside the metric; it must not turn non-null partial
  // values into an unavailable card.
  const adCoverageIncomplete = coverageIsIncomplete(adCoverage);
  const adConvRevenue = rawAdConvRevenue;
  const adRoas = rawAdRoas;
  const adPrevRoas = rawAdPrevRoas;
  // Impressions/clicks/conversions are published by the ad owner and simply
  // were never rendered. Nothing here is derived in the browser: a rate without
  // its own basis could not answer "where did this number come from?".
  const adClicks = adKpi?.clicks ?? null;
  const adImpressions = adKpi?.impressions ?? null;
  const adCtr = adKpi?.ctr ?? null;
  const adConversions = adKpi?.conversions ?? null;
  const adCvr = adKpi?.cvr ?? null;
  const adPerformanceRows = [
    { key: 'convRevenue', label: '광고전환매출', sublabel: '쿠팡', display: formatNullableKRW(adConvRevenue) },
    { key: 'impressions', label: '노출', display: adImpressions === null ? '—' : `${formatNumber(adImpressions)}회` },
    {
      key: 'clicks',
      label: '클릭 · CTR',
      display: adClicks === null
        ? '—'
        : `${formatNumber(adClicks)}회${adCtr === null ? '' : ` · ${adCtr.toFixed(2)}%`}`,
    },
    {
      key: 'conversions',
      label: '광고주문 · CVR',
      display: adConversions === null
        ? '—'
        : `${formatNumber(adConversions)}건${adCvr === null || adCvr === undefined ? '' : ` · ${adCvr.toFixed(2)}%`}`,
    },
  ];
  const adCoverageLabel = adCoverage
    ? `${adCoverage.completedDays}/${adCoverage.targetDays}일`
    : null;

  const rawAdRate = rkAd ? rkAd.adRate ?? null : salesMonthly.adRate;
  const rawAdPrevRate = rkAd ? rkAd.prevAdRate ?? null : salesMonthly.prevAdRate;
  const kpiAdRate = rawAdRate;
  const kpiPrevAdRate = rawAdPrevRate;
  const adRateChange = rkAd && rkAd.adRateChange !== undefined
      ? rkAd.adRateChange
      : kpiAdRate !== null && kpiPrevAdRate !== null ? kpiAdRate - kpiPrevAdRate : null;
  const adRoasChange = rkAd && rkAd.adRoasChange !== undefined
      ? rkAd.adRoasChange
      : adRoas !== null && adPrevRoas !== null ? adRoas - adPrevRoas : null;
  // Dashboard revenue is selected Order/Wing revenue. Channel splits come
  // only from Sellpia daily facts when that coverage is ready.
  const wingRevenue = nullableValue(salesMonthly.wingRevenue, kpiRevenue);

  // 트렌드 차트용 데이터
  const dailyTrend = fillTrendDateGaps(trendData.map((d) => ({
    ...d,
    evidence: {
      revenue: readMetricBasis(d, 'revenue'),
      profit: readMetricBasis(d, 'profit'),
      adCost: readMetricBasis(d, 'adCost'),
    },
  }))).map(d => ({
    date: d.date,
    revenue: d.revenue,
    profit: d.profit,
    adCost: d.adCost,
    evidence: d.evidence,
    profitRate: d.revenue !== null && d.profit !== null && d.revenue > 0
      ? Math.round((d.profit / d.revenue) * 1000) / 10
      : null,
    adRate: d.revenue !== null && d.adCost !== null && d.revenue > 0
      ? Math.round((d.adCost / d.revenue) * 1000) / 10
      : null,
  }));

  // 데이터 출처 라벨 — Drive replay / Wing / 쿠팡 광고 / 주문 기준 등을 한 곳에서 결정
  const effectivePeriod = effectiveSales?.effectivePeriod ?? (kpiRange === 'month' ? baselineSales.effectivePeriod : undefined);
  const trafficKpi = effectiveSales?.trafficKpi;
  const periodLabel = effectivePeriod
    ? `${effectivePeriod.year}년 ${effectivePeriod.month}월`
    : new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const periodShifted = effectivePeriod?.shifted ?? false;
  const latestDataDate = effectivePeriod?.latestDataDate ?? null;
  const revenueSource = effectivePeriod?.revenueSource
    ?? (trafficKpi?.source === 'wing' ? 'wing' : 'orders');
  const revenueSourceLabel =
    revenueSource === 'wing' ? 'Wing 매출 기준'
    : revenueSource === 'mixed' ? '주문 + Wing'
    : revenueSource === 'orders' ? '주문 기준'
    : '데이터 대기';
  const orderProfitInputs = effectiveSales?.profitInputs ?? null;
  const orderProfitInputsAvailable = (revenueSource === 'orders' || revenueSource === 'mixed')
    && orderProfitInputs !== null
    && basisHasValues(orderProfitInputs.basis);
  // 정산 데이터가 있어야 산출 가능한 지표 (순이익/이익률/매입가/수수료/배송비) 는
  // Wing/Drive 단독 데이터로는 신뢰할 수 없다. Wing의 netProfit null도 0으로
  // 추정하지 않고 그 카드는 "—" 로 표시한다.
  const profitMetricsAvailable = orderProfitInputsAvailable && kpiProfit !== null;
  // 광고비/매출 비율은 명시적인 0도 유효하지만 null은 미수집이다.
  const adRateAvailable = kpiAdRate !== null;
  const channelLinkedProducts = inventory?.channelLinkedProducts ?? 0;
  const channelUnlinkedProducts = inventory?.channelUnlinkedProducts ?? Math.max(inventory?.totalProducts - channelLinkedProducts, 0);
  const trafficAvailable = trafficKpi?.trafficAvailable
    ?? Boolean(
      trafficKpi
      && [
        trafficKpi.visitors,
        trafficKpi.views,
        trafficKpi.orders,
        trafficKpi.salesQty,
        trafficKpi.revenue,
        trafficKpi.cartAdds,
      ].some((value) => value !== null && value !== undefined),
    );
  const trafficViews = trafficMetricValue(trafficKpi, 'views');
  const trafficCartAdds = trafficMetricValue(trafficKpi, 'cartAdds');
  const trafficOrders = trafficMetricValue(trafficKpi, 'orders');
  const trafficSalesQty = trafficMetricValue(trafficKpi, 'salesQty');
  const trafficRevenue = trafficMetricValue(trafficKpi, 'revenue');
  const trafficDailyAverageVisitors = trafficKpi?.dailyAverageVisitors ?? null;
  const trafficConversionRate = trafficKpi?.reconciliation?.orders?.status === 'MISMATCH'
    || trafficKpi?.reconciliation?.views?.status === 'MISMATCH'
    ? null
    : trafficKpi?.conversionRate ?? null;
  const trafficProviderConversionRate = trafficKpi?.providerConversionRate ?? null;
  const trafficCoverage = trafficKpi?.coverage ?? null;
  const trafficCoverageComplete = trafficCoverage !== null
    && trafficCoverage.targetDays > 0
    && trafficCoverage.completedDays === trafficCoverage.targetDays;
  const trafficMismatchLabels = trafficMetricLabels
    .filter(([metric]) => trafficKpi?.reconciliation?.[metric]?.status === 'MISMATCH')
    .map(([, label]) => label);
  const trafficUnverifiedLabels = trafficMetricLabels
    .filter(([metric]) => trafficKpi?.reconciliation?.[metric]?.status === 'UNVERIFIED')
    .map(([, label]) => label);
  const trafficFilterScope = trafficKpi?.exactPeriodEvidence?.filterScope === 'ALL_NORMAL_RFM'
    ? 'ALL_NORMAL_RFM'
    : null;
  const trafficObservedAt = trafficKpi?.trafficObservedAt ?? null;

  // The funnel reads in the order it happens. Each step's rate is the share of
  // the step before it, and it is shown only when both steps are measured —
  // a rate against a withheld denominator would be an invented number.
  const funnelRate = (value: number | null, base: number | null): string | null =>
    value === null || base === null || base === 0 ? null : `${((value / base) * 100).toFixed(1)}%`;
  const trafficFunnelSteps = [
    { key: 'visitors', label: '일평균 방문자', display: formatTrafficMetric(trafficDailyAverageVisitors, '명'), rate: null },
    { key: 'views', label: '조회', display: formatTrafficMetric(trafficViews, '회'), rate: funnelRate(trafficViews, trafficDailyAverageVisitors) },
    { key: 'cartAdds', label: '장바구니', display: formatTrafficMetric(trafficCartAdds, '회'), rate: funnelRate(trafficCartAdds, trafficViews) },
    { key: 'orders', label: '주문', display: formatTrafficMetric(trafficOrders, '건'), rate: funnelRate(trafficOrders, trafficCartAdds) },
    { key: 'salesQty', label: '판매량', display: formatTrafficMetric(trafficSalesQty, '개'), rate: null },
  ];
  const trafficSourceNote = [
    trafficObservedAt ? formatDateTime(trafficObservedAt) : '미수집',
    trafficKpi?.source === 'wing'
      ? `${trafficFilterScope ? `계정 원본 · ${trafficFilterScope}` : 'Wing 계정 원본'} · 상품 매칭 합산 아님`
      : null,
    trafficProviderConversionRate !== null ? `Wing 제공 전환율 ${trafficProviderConversionRate.toFixed(1)}%` : null,
    trafficObservedAt && (Date.now() - new Date(trafficObservedAt).getTime()) > 86400000
      ? '24시간 이상 미동기화'
      : null,
  ].filter(Boolean).join(' · ');

  // 셀피아 판매현황(몰별 매출) 파생값 — 월 매출/순이익 카드가 이 소스로 표시된다.
  const sp = channelSales.summary;
  const sellpiaMetricBasis = readMetricBasis(sp, 'totalRevenue');
  const sellpiaProfitInputs = sp?.profitInputs ?? null;
  const spTotal = sp?.totalRevenue ?? null;
  const spRocket = sp?.rocket.revenue ?? null;
  const spOthers = sp?.others.revenue ?? null;
  const spCost = sellpiaProfitInputs?.cost ?? null;
  const spAdCost = sellpiaProfitInputs?.adCost ?? null;
  const spQty = sellpiaProfitInputs?.qty ?? null;
  // Sellpia publishes a compact basis map. Prefer the fixed group keys so
  // rocket/others cards inherit the same evidence without requiring a basis
  // entry per seller ID; row-local keys remain valid when a group diverges.
  const sellpiaRocketBasis = readFirstMetricBasis(sp, ['rocket', 'rocket.revenue']);
  const sellpiaOthersBasis = readFirstMetricBasis(sp, ['others', 'others.revenue']);
  const sellpiaHasData = sp?.hasData === true
    && spTotal !== null
    && (!sellpiaMetricBasis || basisHasValues(sellpiaMetricBasis));
  const sellpiaProfitInputsAvailable = sellpiaProfitInputs !== null && basisHasValues(sellpiaProfitInputs.basis);
  // Keep the server-owned profitability projection. The inputs explain why
  // the value is available, but the client must not re-derive a possibly
  // rounded or policy-adjusted netProfit/profitRate.
  const spProfit = sellpiaProfitInputsAvailable ? sp?.netProfit ?? null : null;
  const spProfitRate = sellpiaProfitInputsAvailable ? sp?.profitRate ?? null : null;
  const profitRateAvailable = sellpiaHasData
    ? sellpiaProfitInputsAvailable && spProfitRate !== null
    : orderProfitInputsAvailable && profitRate !== null;
  const displayProfitRate = sellpiaHasData && sellpiaProfitInputsAvailable
    ? spProfitRate
    : sellpiaHasData
      ? null
      : orderProfitInputsAvailable ? profitRate : null;
  // 카드 표시값: 셀피아 데이터가 있으면 셀피아 기준으로 통일(로켓/기타몰/합계가 서로 맞음).
  const primaryRevenueAvailable = sellpiaHasData
    ? spTotal !== null
    : kpiRevenue !== null && (
      revenueSource === 'orders'
      || revenueSource === 'mixed'
      || (revenueSource === 'wing' && trafficRevenue !== null)
    );
  const displayRevenue = primaryRevenueAvailable
    ? (sellpiaHasData ? spTotal : kpiRevenue)
    : null;
  const displayRocket = sellpiaHasData ? spRocket : null;
  const displayOthers = sellpiaHasData ? spOthers : wingRevenue;
  const salesAnalysisPeriod = sp?.range.from?.slice(0, 7)
    ?? (effectivePeriod
      ? `${effectivePeriod.year}-${String(effectivePeriod.month).padStart(2, '0')}`
      : new Date().toISOString().slice(0, 7));
  const salesAnalysisHref = `/sales-analysis?tab=overview&period=${encodeURIComponent(salesAnalysisPeriod)}`;
  const revenueBasis = rangeMetricBasis(effectiveSales, kpiRange, 'revenue');
  const revenueComparisonBasis = rangeMetricBasis(effectiveSales, kpiRange, 'revenueChange');
  const profitBasis = rangeMetricBasis(effectiveSales, kpiRange, 'profit');
  const profitComparisonBasis = rangeMetricBasis(effectiveSales, kpiRange, 'profitChange');
  // Rates and their changes are range-owned metrics. Do not substitute a
  // monthly profit or ROAS period basis when the selected range lacks its
  // own rate evidence.
  const profitRateBasis = rangeMetricBasis(effectiveSales, kpiRange, 'profitRate', null);
  const profitRateComparisonBasis = rangeMetricBasis(effectiveSales, kpiRange, 'profitRateChange', null);
  const adRateBasis = rangeMetricBasis(effectiveAd, kpiRange, 'adRate', null);
  const adRateComparisonBasis = rangeMetricBasis(effectiveAd, kpiRange, 'adRateChange', null);
  const adRoasBasis = rangeMetricBasis(effectiveAd, kpiRange, 'adRoas', null);
  const adRoasComparisonBasis = rangeMetricBasis(effectiveAd, kpiRange, 'adRoasChange', null);
  const trafficBasis = readMetricBasis(effectiveSales, 'trafficKpi.conversionRate');
  const benchmark = effectiveAd?.industryBenchmark;
  const benchmarkBases = {
    adRate: readMetricBasis(effectiveAd?.industryBenchmark, 'myAdRate'),
    roas: readMetricBasis(effectiveAd?.industryBenchmark, 'myRoas'),
    ctr: readMetricBasis(effectiveAd?.industryBenchmark, 'myCtr'),
    cvr: readMetricBasis(effectiveAd?.industryBenchmark, 'myCvr'),
  };
  const inventoryBasis = readFirstMetricBasis(inventoryData, [
    'gradeCount.A',
    'abcStatusCount.READY',
    'alerts',
  ]);
  const inventoryHeaderBasis = readFirstMetricBasis(inventoryData, [
    'totalProducts',
    'channelLinkedProducts',
    'channelUnlinkedProducts',
  ]);
  const topProductsBasis = readFirstMetricBasis(effectiveSales, [
    'topProducts.revenue',
    'topProducts.netProfit',
  ]);
  const topProducts = effectiveSales?.topProducts ?? [];
  const topProductsLoading = kpiRange === 'month' ? salesBaselineLoading : salesRangeLoading;
  // Top Products reads whichever sales query the selected range uses; its
  // failure is already named and retried by the page-level notice.
  const topProductsHasErr = kpiRange === 'month' ? salesBaselineHasErr : salesRangeHasErr;
  const warningBasis = (key: string): DashboardMetricBasis | null => readMetricBasis(inventoryData, key);
  const alertsBasis = readMetricBasis(inventoryData, 'alerts');

  // The basis a card actually displays is decided once, so the section's
  // breakdown explains the number on screen rather than a parallel guess.
  const revenueCardBasis = sellpiaHasData ? sellpiaMetricBasis : revenueBasis;
  const profitCardUsesSellpia = sellpiaHasData && sellpiaProfitInputsAvailable && spProfit !== null;
  const profitCardBasis = profitCardUsesSellpia
    ? sellpiaProfitInputs?.basis ?? null
    : sellpiaHasData ? sellpiaMetricBasis : profitBasis;
  const profitRateCardBasis = profitRateAvailable
    ? (sellpiaHasData ? sellpiaProfitInputs?.basis ?? null : profitRateBasis)
    : (sellpiaHasData ? sellpiaMetricBasis : profitRateBasis);

  const periodBasisEntries: BasisBreakdownEntry[] = [
    { label: `${rangeLabel} 매출`, basis: revenueCardBasis },
    ...(sellpiaHasData
      ? [
        { label: '쿠팡윙 · 기타몰 매출', basis: sellpiaOthersBasis },
        { label: '쿠팡 로켓 매출', basis: sellpiaRocketBasis },
      ]
      : [{ label: `${rangeLabel} 매출 증감`, basis: revenueComparisonBasis }]),
    { label: `${rangeLabel} 순이익`, basis: profitCardBasis },
    ...(sellpiaHasData ? [] : [{ label: `${rangeLabel} 순이익 증감`, basis: profitComparisonBasis }]),
    { label: '이익률', basis: profitRateCardBasis },
    ...(sellpiaHasData ? [] : [{ label: '이익률 증감', basis: profitRateComparisonBasis }]),
    { label: '광고비율', basis: adRateBasis },
    { label: '광고비율 증감', basis: adRateComparisonBasis },
    { label: '구매전환율', basis: trafficBasis },
    { label: '광고수익률', basis: adRoasBasis },
    { label: '광고수익률 증감', basis: adRoasComparisonBasis },
    { label: '벤치마크 광고비율', basis: benchmarkBases.adRate },
    { label: '벤치마크 ROAS', basis: benchmarkBases.roas },
    { label: '벤치마크 CTR', basis: benchmarkBases.ctr },
    { label: '벤치마크 CVR', basis: benchmarkBases.cvr },
    { label: 'Top 상품 매출', basis: topProductsBasis },
    { label: 'Wing 일별 트래픽 커버리지', coverage: trafficCoverage, coverageSources: ['wing_traffic'] },
    { label: '광고 커버리지', coverage: adCoverage, coverageSources: ['coupang_ads'] },
  ];

  const snapshotBasisEntries: BasisBreakdownEntry[] = [
    { label: '운영 상품 · 채널 연결', basis: inventoryHeaderBasis },
    { label: '알림', basis: alertsBasis },
    { label: '수익성 ABC', basis: inventoryBasis },
    { label: '적자 상품', basis: warningBasis('warnings.minusProducts') },
    { label: '저이익 상품', basis: warningBasis('warnings.lowProfitProducts') },
    { label: '광고비 초과', basis: warningBasis('warnings.highAdProducts') },
    { label: '셀피아 재고 0', basis: warningBasis('warnings.outOfStockSkus') },
    { label: '매칭 확인 필요', basis: warningBasis('warnings.mappingAttentionSkus') },
  ];

  // Every failed read on the page, named once. React Query already owns this
  // state, so nothing here is a second copy of it.
  const readFailures: DashboardReadFailure[] = [];
  const addReadFailure = (key: string, label: string, failed: boolean, error: unknown, retry: () => void) => {
    if (failed) readFailures.push({ key, label, message: friendlyError(error) ?? '조회 실패', retry });
  };
  addReadFailure('sales-baseline', '주문 매출', salesBaselineHasErr, salesBaselineError, () => { void refetchSalesBaseline(); });
  addReadFailure('ad-baseline', '쿠팡 광고', adBaselineHasErr, adBaselineError, () => { void refetchAdBaseline(); });
  addReadFailure('sales-range', `선택 기간 매출(${rangeLabel})`, salesRangeHasErr, salesRangeError, () => { void refetchSalesRange(); });
  addReadFailure('ad-range', `선택 기간 광고(${rangeLabel})`, adRangeHasErr, adRangeError, () => { void refetchAdRange(); });
  // The Sellpia hook publishes only a boolean, so its reason stays the fixed
  // sentence the page already showed rather than an invented detail.
  if (channelSales.isError) {
    readFailures.push({
      key: 'sellpia',
      label: '셀피아 판매현황',
      message: '셀피아 판매현황을 불러올 수 없습니다. 주문·Wing 지표는 별도로 표시합니다.',
      retry: () => { void channelSales.refetch(); },
    });
  }
  addReadFailure('inventory', '상품·재고', inventoryHasErr, inventoryError, () => { void refetchInventory(); });
  addReadFailure('trend', '매출 추이', trendHasErr, trendError, () => { void refetchTrend(); });

  return (
    <div className="space-y-4 w-full pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Kiditem Foundry</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-xs font-mono text-slate-400">운영 상품 {inventoryData ? formatNumber(inventory.totalProducts) : '—'}</span>
              <span className="text-xs font-mono text-slate-400">·</span>
              <span className="text-xs font-mono text-slate-400">판매중 채널 연결 재고상품 {inventoryData ? formatNumber(channelLinkedProducts) : '—'}</span>
              {inventoryData && channelUnlinkedProducts > 0 && (
                <>
                  <span className="text-xs font-mono text-slate-400">·</span>
                  <span className="text-xs font-mono text-amber-500">판매중 채널 미연결 재고상품 {formatNumber(channelUnlinkedProducts)}</span>
                </>
              )}
              {inventoryHeaderBasis && <DashboardDataBasis basis={inventoryHeaderBasis} className="ml-1" />}
              <span className="text-xs font-mono text-slate-400">|</span>
              <span className="text-xs font-mono text-slate-400">{periodLabel}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {periodShifted && latestDataDate && (
                <span
                  className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                  title={`현재 월에 데이터가 없어 최신 데이터 기준 (${latestDataDate})로 표시 중`}
                >
                  최신 데이터 기준 · {latestDataDate}
                </span>
              )}
              {!periodShifted && revenueSource === 'wing' && (
                <span
                  className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200"
                  title="이번 달 주문 데이터가 없어 Wing 매출분석을 기준으로 표시 중"
                >
                  Wing 기준
                </span>
              )}
            </div>
          </div>
        </div>
        {/* The expanded sidebar leaves ~1,420px here, which is not enough for
            these controls to wrap gracefully — they stacked one character per
            line. They stay on one line and the identity block yields instead. */}
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
          <button
            onClick={requestReadinessOpen}
            className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
            title="쿠팡 Wing/광고 데이터 수집 상태 확인 + 누락분 수집 트리거"
          >
            <Database size={14} /> 데이터 수집
          </button>
          <div className="flex rounded-lg p-0.5 bg-slate-100">
            {([['month', '월'], ['week', '주'], ['day', '일']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setKpiRange(val)}
                className={cn('px-4 py-1.5 rounded-md text-sm font-semibold transition-colors', kpiRange === val ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400')}
              >{label}</button>
            ))}
            <button
              onClick={() => {
                setKpiRange('custom');
                // 기간 진입 시 비어 있으면 이번 달로 기본 채움(빈 입력 방지)
                const def = sellpiaPeriodRange('month', '', '');
                if (!dateFrom) setDateFrom(def.from);
                if (!dateTo) setDateTo(def.to);
              }}
              className={cn('px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-1', kpiRange === 'custom' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400')}
            ><Calendar size={13} /> 기간</button>
          </div>
          {kpiRange === 'custom' ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-1">
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 px-2.5 rounded-md text-sm border border-slate-200 bg-white text-slate-700 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <span className="text-slate-400 px-0.5">~</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 px-2.5 rounded-md text-sm border border-slate-200 bg-white text-slate-700 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <button
                onClick={applyCustomRange}
                disabled={!dateFrom || !dateTo}
                className="h-8 px-4 rounded-md text-white text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                조회
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400">
              {kpiRange === 'month' ? '이번 달 vs 전월' : kpiRange === 'week' ? '7일 vs 이전 7일' : '오늘 vs 어제'}
            </span>
          )}
        </div>
      </div>

      <DashboardReadFailureNotice failures={readFailures} />

      {selectedRangeLoading && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          선택한 기간의 매출·광고 데이터를 불러오는 중입니다.
        </div>
      )}
      {channelSales.isLoading && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          셀피아 판매현황을 불러오는 중입니다.
        </div>
      )}

      <DashboardSectionHeader
        title="기간 지표"
        scope={`${rangeLabel} KPI · 벤치마크 · Top 상품`}
        disclosureLabel="기간 지표 근거"
        entries={periodBasisEntries}
      />

      {/* KPI 카드 — 월 매출 + 월 순이익 + 이익률 + 광고비율 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2" style={{ alignItems: 'stretch' }}>
        {/* 월 매출 — 채널 카드를 누르면 매출 분석의 동일 월·채널 상세로 이동한다. */}
        <div
          className="rounded-xl px-3 py-2 flex flex-col justify-between bg-white border border-slate-200"
          data-testid="dashboard-primary-revenue"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={18} className="text-blue-600" />
              <span className="text-sm font-bold uppercase tracking-wider text-blue-600">{rangeLabel} 매출</span>
              {!sellpiaHasData && displayRevenue !== null && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono',
                    revenueChange === null
                      ? 'bg-slate-50 text-slate-400'
                      : revenueChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
                  )}
                  data-testid="dashboard-primary-revenue-change"
                >
                  {revenueChange === null
                    ? <span>—</span>
                    : <>
                      {revenueChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <span>{revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(1)}%</span>
                    </>}
                </span>
              )}
              <Link
                href={salesAnalysisHref}
                className="ml-auto text-[11px] font-semibold text-blue-500 hover:text-blue-700"
              >
                매출 분석 →
              </Link>
            </div>
            <div className="text-[10px] font-mono text-slate-400 mb-1.5">{sellpiaHasData ? '셀피아 판매현황' : revenueSourceLabel}</div>
            <DashboardDataBasis basis={revenueCardBasis} className="mb-1" />
            {!sellpiaHasData && <DashboardDataBasis basis={revenueComparisonBasis} className="mb-1" />}
            <div className="flex items-baseline gap-1.5 mb-1">
              <span
                className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-blue-600"
                data-testid="dashboard-primary-revenue-value"
              >
                {displayRevenue === null ? '—' : formatKRW(displayRevenue)}
              </span>
              {displayRevenue !== null && <span className="text-lg font-semibold text-blue-600/60">원</span>}
            </div>
            {!sellpiaHasData && displayRevenue !== null && (
              <div className="text-sm text-slate-500">이전 {formatNullableKRW(kpiPrevRevenue)}</div>
            )}
            {sellpiaHasData && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  href={`${salesAnalysisHref}&channel=others`}
                  className="rounded-lg bg-blue-50/70 px-2.5 py-1.5 transition-colors hover:bg-blue-100"
                >
                  <div className="text-[11px] font-medium text-blue-500">
                    {sellpiaHasData ? '쿠팡윙 · 기타몰' : '쿠팡 윙'} <span className="text-[9px] text-blue-400">→ 분석</span>
                  </div>
                  <div className="text-sm font-bold tabular-nums text-blue-700">{displayOthers === null ? '—' : `${formatKRW(displayOthers)}원`}</div>
                  <DashboardDataBasis basis={sellpiaOthersBasis} className="mt-1" />
                </Link>
                <Link
                  href={`${salesAnalysisHref}&channel=rocket`}
                  className="rounded-lg bg-purple-50 px-2.5 py-1.5 transition-colors hover:bg-purple-100"
                >
                  <div className="text-[11px] font-medium text-purple-600">
                    쿠팡 로켓 <span className="text-[9px] text-purple-400">→ 분석</span>
                  </div>
                  <div className="text-sm font-bold tabular-nums text-purple-700">{displayRocket === null ? '—' : `${formatKRW(displayRocket)}원`}</div>
                  <DashboardDataBasis basis={sellpiaRocketBasis} className="mt-1" />
                </Link>
              </div>
            )}
          </div>
          {/* The funnel and the day-count coverage moved out of this card — they
              belong to the Wing traffic owner. These two stay: they say why THIS
              card's own value is withheld, so they have to be read with it. */}
          {(trafficCoverageComplete && trafficUnverifiedLabels.length > 0) && (
            <div className="mt-1 text-xs text-amber-700">
              일별 합산·기간 원본 미대사 · {trafficUnverifiedLabels.join(', ')}
            </div>
          )}
          {trafficMismatchLabels.length > 0 && (
            <div className="mt-1 text-xs text-amber-700">
              기간 원본 불일치로 숨김 · {trafficMismatchLabels.join(', ')}
            </div>
          )}
        </div>

        {/* 월 순이익 — 셀피아 판매현황(판매금액−매입가−쿠팡 광고비)이 있으면 우선 */}
        {profitCardUsesSellpia ? (
          <div className="rounded-xl px-3 py-2 flex flex-col justify-between bg-white border border-slate-200" data-testid="dashboard-primary-profit">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {spProfit === null || spProfit >= 0
                  ? <TrendingUp size={18} className="text-emerald-600" />
                  : <TrendingDown size={18} className="text-red-600" />}
                <span className="text-sm font-bold uppercase tracking-wider text-emerald-600">{rangeLabel} 순이익</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 mb-1.5">셀피아 · 판매금액 − 매입가 − 쿠팡 광고비</div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className={cn('text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight', spProfit === null ? 'text-slate-300' : spProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatNullableKRW(spProfit)}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                판매금액에서 매입가와 선택 기간에 수집된 쿠팡 광고비를 뺀 금액입니다.
              </div>
              <DashboardDataBasis basis={profitCardBasis} className="mt-1" />
            </div>
            <div className="mt-2 pt-2 space-y-1.5 border-t border-emerald-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">판매금액</span>
                <span className="font-bold tabular-nums text-slate-900">{sellpiaProfitInputs ? `${formatKRW(sellpiaProfitInputs.revenue)}원` : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">매입가</span>
                <ExpenseAmountOrUnavailable amount={spCost} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">쿠팡 광고비</span>
                <ExpenseAmountOrUnavailable amount={spAdCost} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">판매수량</span>
                <span className="font-bold tabular-nums text-slate-900">{spQty === null ? '—' : `${formatNumber(spQty)}개`}</span>
              </div>
            </div>
          </div>
        ) : !sellpiaHasData && profitMetricsAvailable ? (
          <div
            className="rounded-xl px-3 py-2 flex flex-col justify-between cursor-pointer hover:border-violet-300 transition-colors bg-white border border-slate-200"
            data-testid="dashboard-primary-profit"
            onClick={() => setShowProfitDetail(true)}
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={18} className="text-emerald-600" />
                <span className="text-sm font-bold uppercase tracking-wider text-emerald-600">{rangeLabel} 순이익</span>
                {profitChange !== null && (
                  <span className={cn('flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono', profitChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                    {profitChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    <span>{profitChange > 0 ? '+' : ''}{profitChange.toFixed(1)}%</span>
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono text-slate-400 mb-1.5">주문 기준</div>
              <DashboardDataBasis basis={profitCardBasis} className="mb-1" />
              <DashboardDataBasis basis={profitComparisonBasis} className="mb-1" />
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-emerald-600">{formatKRW(kpiProfit)}</span>
                <span className="text-lg font-semibold text-emerald-600/60">원</span>
              </div>
              <div className="text-sm text-slate-500">이전 {formatNullableKRW(kpiPrevProfit)}</div>
            </div>
            <div className="mt-2 pt-2 space-y-1.5 border-t border-emerald-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">집행광고비</span>
                <ExpenseAmountOrUnavailable amount={orderProfitInputs?.adCost ?? null} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">비광고 비용</span>
                <ExpenseAmountOrUnavailable amount={orderProfitInputs?.cost ?? null} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">판매수량</span>
                <span className="font-bold tabular-nums text-slate-900">
                  {orderProfitInputs?.qty === null || orderProfitInputs?.qty === undefined
                    ? '—'
                    : `${formatNumber(orderProfitInputs.qty)}개`}
                </span>
              </div>
            </div>
          </div>
        ) : (
          // Wing/Drive 단독 — 매입가/수수료/배송비 source 가 없어 순이익 산출 불가.
          // 광고비는 쿠팡 광고에서 측정값으로 표시.
          <div className="rounded-xl px-3 py-2 flex flex-col justify-between bg-white border border-slate-200" data-testid="dashboard-primary-profit">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={18} className="text-emerald-600" />
                <span className="text-sm font-bold uppercase tracking-wider text-emerald-600">{rangeLabel} 순이익</span>
              </div>
              <DashboardDataBasis basis={profitCardBasis} className="mb-1" />
              {!sellpiaHasData && <DashboardDataBasis basis={profitComparisonBasis} className="mb-1" />}
              <div className="text-[10px] font-mono text-slate-400 mb-1.5">
                {sellpiaHasData ? '셀피아 · 판매금액 − 매입가 − 쿠팡 광고비' : '정산 데이터 없음'}
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-slate-300">—</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {sellpiaHasData
                  ? !sellpiaProfitInputsAvailable
                    ? '판매금액과 비용의 공통 유효 날짜가 없어 순이익을 산출할 수 없습니다. 공통 유효 날짜 집합이 비어 있습니다.'
                    : '선택 기간의 순이익 데이터가 없어 순이익을 산출할 수 없습니다.'
                  : revenueSource === 'wing'
                    ? 'Wing/Drive 데이터에는 매입가·수수료·배송비가 없어 순이익을 산출할 수 없습니다.'
                    : orderProfitInputs === null
                      ? '매출·비용의 공통 유효 날짜가 없어 순이익을 산출할 수 없습니다.'
                    : '선택 기간의 순이익 데이터가 없어 순이익을 산출할 수 없습니다.'}
              </div>
            </div>
            <div className="mt-2 pt-2 space-y-1.5 border-t border-emerald-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">집행광고비 <span className="text-[10px] text-slate-400">쿠팡</span></span>
                <ExpenseAmountOrUnavailable amount={sellpiaProfitInputs?.adCost ?? null} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">비광고 비용</span>
                <ExpenseAmountOrUnavailable amount={sellpiaProfitInputs?.cost ?? null} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">판매수량</span>
                <span className="font-bold tabular-nums text-slate-900">
                  {sellpiaProfitInputs?.qty === null || sellpiaProfitInputs?.qty === undefined
                    ? '—'
                    : `${formatNumber(sellpiaProfitInputs.qty)}개`}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 이익률 — 순이익을 못 구하면 정의가 없으니 placeholder 로 */}
        {profitRateAvailable ? (
          <MetricCard
            label="이익률"
            value={displayProfitRate === null ? '—' : displayProfitRate.toFixed(1)}
            unit="%"
            change={sellpiaHasData ? null : profitRateChange}
            prevLabel={sellpiaHasData ? '셀피아 공통 유효 날짜 기준' : `이전 ${formatNullablePercent(prevProfitRate)}`}
            accentColor="#733de5"
            icon={Target}
            goal={15}
            current={displayProfitRate ?? undefined}
            goalUnit="%"
            goalLabel="목표 15%"
            basis={profitRateCardBasis}
            comparisonBasis={sellpiaHasData ? null : profitRateComparisonBasis}
          />
        ) : (
          <UnavailableMetricCard
            label="이익률"
            icon={Target}
            accentColor="#733de5"
            note={sellpiaHasData ? '쿠팡 광고비 수집 필요' : '정산 데이터 필요'}
            basis={profitRateCardBasis}
            comparisonBasis={sellpiaHasData ? null : profitRateComparisonBasis}
          />
        )}

        {/* 광고비율 */}
        {adRateAvailable ? (
          <MetricCard
            label="광고비율"
            value={kpiAdRate === null ? '—' : kpiAdRate.toFixed(1)}
            unit="%"
            change={adRateChange === null ? null : -adRateChange}
            prevLabel={`이전 ${formatNullablePercent(kpiPrevAdRate)}`}
            accentColor="#dc2626"
            icon={Megaphone}
            invertColor
            goal={10}
            current={kpiAdRate ?? undefined}
            goalUnit="%"
            goalLabel="목표 10% 이하"
            invertGoal
            basis={adRateBasis}
            comparisonBasis={adRateComparisonBasis}
          />
        ) : (
          <UnavailableMetricCard
            label="광고비율"
            icon={Megaphone}
            accentColor="#dc2626"
            note={adCoverageIncomplete ? '광고 데이터 커버리지 부족' : '광고비 데이터 미수집'}
            basis={adRateBasis}
            comparisonBasis={adRateComparisonBasis}
          />
        )}

        {/* 구매전환율 */}
        {trafficConversionRate !== null ? (
          <MetricCard
            label="구매전환율"
            value={trafficConversionRate.toFixed(1)}
            unit="%"
            change={null}
            prevLabel="비교 기준 없음"
            accentColor="#0284c7"
            icon={ShoppingCart}
            goal={5}
            current={trafficConversionRate}
            goalUnit="%"
            goalLabel="목표 5%"
            basis={trafficBasis}
          />
        ) : (
          <UnavailableMetricCard
            label="구매전환율"
            icon={ShoppingCart}
            accentColor="#0284c7"
            note={trafficAvailable ? '조회·주문 원본 필요' : 'Wing 트래픽 미수집'}
            basis={trafficBasis}
          />
        )}

        {/* 광고수익률(ROAS) */}
        {adRoas !== null ? (
          <MetricCard
            label="광고수익률"
            value={adRoas.toFixed(0)}
            unit="%"
            change={adRoasChange}
            prevLabel={`이전 ${formatNullablePercent(adPrevRoas, 0)}`}
            accentColor="#059669"
            icon={BarChart3}
            goal={400}
            current={adRoas}
            goalUnit="%"
            goalLabel="목표 400%"
            basis={adRoasBasis}
            comparisonBasis={adRoasComparisonBasis}
          />
        ) : (
          <UnavailableMetricCard
            label="광고수익률"
            icon={BarChart3}
            accentColor="#059669"
            note={adCoverageIncomplete ? '광고 데이터 커버리지 부족' : '광고 데이터 미수집'}
            basis={adRoasBasis}
            comparisonBasis={adRoasComparisonBasis}
          />
        )}
      </div>

      {/* 커버리지 — 위 KPI 여섯 개가 무엇에 근거하는지 한 줄로. 카드마다
          같은 문장을 반복하던 것을 여기 한 번으로 모았다. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-500">
        {trafficCoverage && (
          <span data-testid="wing-traffic-coverage">
            일별 커버리지 {trafficCoverage.from} ~ {trafficCoverage.to} ·{' '}
            {trafficCoverage.completedDays}/{trafficCoverage.targetDays}일
            {trafficCoverage.missingDates.length > 0 && ` · 누락 ${trafficCoverage.missingDates.length}일`}
          </span>
        )}
        {adCoverage && (
          <span data-testid="ad-coverage">
            광고 커버리지 {adCoverage.from} ~ {adCoverage.to} ·{' '}
            {adCoverage.completedDays}/{adCoverage.targetDays}일
            {adCoverage.missingDates.length > 0 && ` · 누락 ${adCoverage.missingDates.length}일`}
          </span>
        )}
        {coverageNote(adCoverage) && (
          <span className="text-amber-700" data-testid="ad-coverage-note">
            {coverageNote(adCoverage)} · 측정된 날짜의 값만 표시
          </span>
        )}
      </div>

      <DashboardTrafficFunnel
        steps={trafficFunnelSteps}
        basis={trafficBasis}
        sourceNote={trafficSourceNote}
        collected={trafficAvailable}
        onCollect={requestReadinessOpen}
      />

      {/* 본문 — 왼쪽은 기간을 읽는 것, 오른쪽은 지금 손이 필요한 것.
          한 화면에서 훑는 것이 이 페이지의 용도라 세로로 쌓지 않는다. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <div className="lg:col-span-2 space-y-3">
          {trendLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">트렌드 데이터를 불러오는 중입니다.</div>
          ) : trendHasErr ? (
            <DashboardSectionUnavailable label="매출 추이" className="rounded-xl border border-slate-200 bg-white" />
          ) : (
            <DashboardChartPanel
              dailyTrend={dailyTrend}
              industryBenchmark={benchmark}
              benchmarkBases={benchmarkBases}
            />
          )}

          {inventoryHasErr ? (
            <DashboardSectionUnavailable label="수익성 ABC" />
          ) : !inventoryData ? (
            <DashboardSectionEmpty label="수익성 ABC" />
          ) : (
            <DashboardGradeCards
              gradeCount={inventory.gradeCount}
              classifiedProductCount={inventory.classifiedProductCount}
              unclassifiedProductCount={inventory.unclassifiedProductCount}
              abcStatusCount={inventory.abcStatusCount}
              abcContributionProfit={inventory.abcContributionProfit}
              abcFormula={inventory.abcFormula}
              gradeChanges={inventory.gradeChanges}
              basis={inventoryBasis}
            />
          )}

          {topProductsHasErr ? (
            <DashboardSectionUnavailable label="Top Revenue Products" />
          ) : topProductsLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-500">상품 매출 데이터를 불러오는 중입니다.</div>
          ) : !effectiveSales ? (
            <DashboardSectionEmpty label="Top Revenue Products" />
          ) : (
            <DashboardTopProducts products={topProducts} basis={topProductsBasis} />
          )}
        </div>

        <div className="space-y-3">
          <DashboardSectionHeader
            title="스냅샷 지표"
            scope="광고 성과 · 경고 · 알림"
            disclosureLabel="스냅샷 지표 근거"
            entries={snapshotBasisEntries}
          />

          <DashboardAdPerformance
            rows={adPerformanceRows}
            basis={adRoasBasis}
            coverageLabel={adCoverageLabel}
          />

          {inventoryHasErr ? (
            <DashboardSectionUnavailable label="경고" />
          ) : !inventoryData ? (
            <DashboardSectionEmpty label="경고" />
          ) : (
            <DashboardWarningTable rows={buildWarningRows(inventory.warnings, warningBasis)} />
          )}

          {inventoryHasErr ? (
            <DashboardSectionUnavailable label="알림" className="rounded-xl border border-slate-200 bg-white" />
          ) : !inventoryData ? (
            <DashboardSectionEmpty label="알림" />
          ) : (
            <DashboardSidePanel
              alerts={inventoryData.alerts}
              queryClient={queryClient}
              basis={alertsBasis}
            />
          )}
        </div>
      </div>

      {/* 순이익 상세 모달 */}
      {showProfitDetail && (
        <DashboardProfitDetailModal
          salesBaseline={effectiveSales ?? (kpiRange === 'month' ? baselineSales : EMPTY_SALES_SUMMARY)}
          adBaseline={effectiveAd ?? (kpiRange === 'month' ? baselineAd : EMPTY_AD_SUMMARY)}
          selectedRange={kpiRange}
          onClose={() => setShowProfitDetail(false)}
        />
      )}
      <ReadinessModal
        open={showReadiness}
        onClose={() => setShowReadiness(false)}
        onRequestOpen={requestReadinessOpen}
        autoOpenWhen="collectionIssue"
        additionalCollection={(
          <WingDailyTrafficCollection
            period={kpiRange}
            selectedFrom={kpiRange === 'custom' ? dateFrom : undefined}
            selectedTo={kpiRange === 'custom' ? dateTo : undefined}
          />
        )}
      />
    </div>
  );
}

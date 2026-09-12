'use client';

import { useCallback, useState, type ReactNode } from 'react';
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
  periodBasisStatus,
} from '@kiditem/shared/dashboard';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber, formatDateTime } from '@/lib/utils';
import ReadinessModal from '@/components/ReadinessModal';
import { useSellpiaChannelSales, sellpiaPeriodRange } from '@/hooks/useSellpiaChannelSales';
import { DashboardChartPanel } from './components/DashboardChartPanel';
import { MetricCard, UnavailableMetricCard } from './components/DashboardMetricCard';
import { DashboardProfitDetailModal } from './components/DashboardProfitDetailModal';
import { DashboardSidePanel, type DashboardReadFailure } from './components/DashboardSidePanel';
import { DashboardTopProducts } from './components/DashboardTopProducts';
import { DashboardAdPerformance } from './components/DashboardAdPerformance';
import { DashboardTrafficFunnel } from './components/DashboardTrafficFunnel';
import { DashboardWarningTable, buildWarningRows } from './components/DashboardWarningTable';
import { DashboardGradeCards } from './components/DashboardGradeCards';
import { WingDailyTrafficCollection } from './components/WingDailyTrafficCollection';
import {
  DashboardBasisDisclosure,
  DashboardDataBasis,
  basisHasValues,
  readFirstMetricBasis,
  readMetricBasis,
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
      <span className="text-[13px] text-slate-400">{label} 값을 읽지 못했습니다. 알림에서 다시 시도할 수 있습니다.</span>
    </div>
  );
}

/**
 * A section header carries one ⓘ for every value below it. The affordance is
 * section-level; the explanation behind it stays per value.
 */
/**
 * A filter that sits above something it does not govern will be read as
 * governing it — placement wins that argument against any label. So the period
 * controls live in this header, and this header spans only the column whose
 * values answer to them. The snapshot column carries its own header beside it,
 * and the two rules underneath are the scope boundary.
 */
function DashboardSectionHeader({
  title,
  scope,
  controls,
}: {
  title: string;
  /** Only when it says something the controls beside it do not. */
  scope?: ReactNode;
  controls?: ReactNode;
}) {
  // A 2px slate-900 rule was a third border weight the design system does not
  // have — its borders are slate-200 and slate-100 — and it made a column
  // heading heavier than every panel under it. A section still reads as a
  // section: it is the only heading with no card around it.
  return (
    <div className="flex min-h-[30px] items-center justify-between gap-3 border-b border-slate-200 pb-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {scope && <span className="text-xs text-slate-500">{scope}</span>}
      </div>
      {controls}
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
    queryKey: queryKeys.dashboard.trend(kpiRange === 'custom' ? 'custom' : '30d', dateFrom, dateTo),
    queryFn: () => {
      // The chart is inside the period column, so it asks for the selected
      // window. Every other range keeps the rolling 30 days it always used.
      const params = kpiRange === 'custom' && dateFrom && dateTo
        ? `?range=custom&from=${dateFrom}&to=${dateTo}`
        : '?range=30d';
      return apiClient.getParsed(`/api/dashboard/trend${params}`, z.array(DashboardTrendItemSchema));
    },
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
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.trend('custom', dateFrom, dateTo) });
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
    : '미수집';
  const orderProfitInputs = effectiveSales?.profitInputs ?? null;
  // `revenueSource` describes the baseline month. It used to gate profit too,
  // so a July selection with settlement inputs went blank whenever September
  // happened to be empty. The inputs carry their own basis; that is the test.
  const orderProfitInputsAvailable = orderProfitInputs !== null
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
    // No rate against visitors. The first step is a daily average of account
    // unique visitors and every later step is a period sum, so the quotient is
    // not a share of anything — with ten days collected it read 1256.1%. Wing
    // publishes UV per day and a visitor returning on two days is one visitor
    // on each, so there is no period UV to divide by either.
    { key: 'views', label: '조회', display: formatTrafficMetric(trafficViews, '회'), rate: null },
    { key: 'cartAdds', label: '장바구니', display: formatTrafficMetric(trafficCartAdds, '회'), rate: funnelRate(trafficCartAdds, trafficViews) },
    { key: 'orders', label: '주문', display: formatTrafficMetric(trafficOrders, '건'), rate: funnelRate(trafficOrders, trafficCartAdds) },
    { key: 'salesQty', label: '판매량', display: formatTrafficMetric(trafficSalesQty, '개'), rate: null },
  ];
  // "부분 N/M일" is the one phrase for partially collected, the same one the
  // ad lane uses. These five numbers sum only the days the provider has
  // published, and Wing publishes traffic a day behind its sales, so the last
  // day of a month-to-date window is routinely absent. Without this the strip
  // would read as a total for the whole window.
  const trafficCoverageLabel = trafficCoverage
    ? trafficCoverageComplete
      ? `${trafficCoverage.targetDays}/${trafficCoverage.targetDays}일`
      : `부분 ${trafficCoverage.completedDays}/${trafficCoverage.targetDays}일`
    : null;
  const trafficSourceNote = [
    trafficObservedAt ? formatDateTime(trafficObservedAt) : '미수집',
    trafficCoverageLabel,
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
  // A measured value never reads 미수집. When the baseline month has no source
  // but the selected range does, the range's own coverage is what to say.
  const revenueRangeBasis = readMetricBasis(effectiveSales, 'rangeKpi.revenue');
  const revenueCoverageNote = revenueRangeBasis?.kind === 'period' && periodBasisStatus(revenueRangeBasis) === 'partial'
    ? `부분 ${revenueRangeBasis.includedDates.length}/${revenueRangeBasis.targetDays}일`
    : null;

  // `revenueSource` describes the baseline month. A selected range publishes
  // its own value and its own basis, and a baseline month with nothing in it
  // said "none" — which blanked a range that had 18,945,520 and said so. The
  // range's own evidence stands on its own, the same way the ad metrics do.
  const rangeRevenueMeasured = rk?.available === true
    && kpiRevenue !== null
    && basisHasValues(revenueRangeBasis);
  const primaryRevenueAvailable = sellpiaHasData
    ? spTotal !== null
    : kpiRevenue !== null && (
      rangeRevenueMeasured
      || revenueSource === 'orders'
      || revenueSource === 'mixed'
      || (revenueSource === 'wing' && trafficRevenue !== null)
    );
  const revenueCellNote = sellpiaHasData
    ? '셀피아 판매현황'
    : primaryRevenueAvailable
      ? (revenueCoverageNote ?? revenueSourceLabel)
      : '미수집';
  const displayRevenue = primaryRevenueAvailable
    ? (sellpiaHasData ? spTotal : kpiRevenue)
    : null;
  const salesAnalysisPeriod = sp?.range.from?.slice(0, 7)
    ?? (effectivePeriod
      ? `${effectivePeriod.year}-${String(effectivePeriod.month).padStart(2, '0')}`
      : new Date().toISOString().slice(0, 7));
  const salesAnalysisHref = `/sales-analysis?tab=overview&period=${encodeURIComponent(salesAnalysisPeriod)}`;
  const revenueBasis = rangeMetricBasis(effectiveSales, kpiRange, 'revenue');
  const profitBasis = rangeMetricBasis(effectiveSales, kpiRange, 'profit');
  // Rates and their changes are range-owned metrics. Do not substitute a
  // monthly profit or ROAS period basis when the selected range lacks its
  // own rate evidence.
  const profitRateBasis = rangeMetricBasis(effectiveSales, kpiRange, 'profitRate', null);
  const adRateBasis = rangeMetricBasis(effectiveAd, kpiRange, 'adRate', null);
  const adRoasBasis = rangeMetricBasis(effectiveAd, kpiRange, 'adRoas', null);
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

  // "관측 6분 전" answers the question the ISO timestamp was being asked: is
  // what I am looking at current? The exact instant stays on hover.
  const observedAtRaw = inventoryHeaderBasis?.kind === 'snapshot' ? inventoryHeaderBasis.observedAt ?? null : null;
  const observedAtTitle = observedAtRaw ? String(observedAtRaw) : '관측 시각 확인 불가';
  const observedAgo = (() => {
    if (!observedAtRaw) return '시각 미상';
    const ms = Date.now() - new Date(String(observedAtRaw)).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '시각 미상';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
  })();

  // The basis a card actually displays is decided once, so the section's
  // breakdown explains the number on screen rather than a parallel guess.
  const revenueCardBasis = sellpiaHasData ? sellpiaMetricBasis : revenueBasis;
  const profitCardUsesSellpia = sellpiaHasData && sellpiaProfitInputsAvailable && spProfit !== null;


  // One cell, so one value and one reason for it. The reason is the card's
  // own state, not a sentence assembled from three variants.
  const displayProfit = profitCardUsesSellpia
    ? spProfit
    : (!sellpiaHasData && profitMetricsAvailable) ? kpiProfit : null;
  // The source line names what the value would be built from, withheld or not
  // — it is how the operator knows which collection to go fix.
  const profitCellNote = sellpiaHasData
    ? '셀피아 · 판매금액 − 매입가 − 쿠팡 광고비'
    : profitMetricsAvailable ? '주문 기준' : '정산 데이터 없음';
  // Why it is withheld reads under it, and only when it is.
  const profitCellReason = displayProfit !== null
    ? null
    : sellpiaHasData
      ? (sellpiaProfitInputsAvailable
        ? '선택 기간의 순이익 데이터가 없어 순이익을 산출할 수 없습니다.'
        : '판매금액과 비용의 공통 유효 날짜가 없어 순이익을 산출할 수 없습니다.')
      : revenueSource === 'wing'
        ? 'Wing/Drive 데이터에는 매입가·수수료·배송비가 없어 순이익을 산출할 수 없습니다.'
        : orderProfitInputs === null
          ? '매출·비용의 공통 유효 날짜가 없어 순이익을 산출할 수 없습니다.'
          : '선택 기간의 순이익 데이터가 없어 순이익을 산출할 수 없습니다.';
  // The modal shows the inputs of whichever source the cell is reading — never
  // the other one. Falling back across sources would put order inputs under a
  // Sellpia card whose own value was withheld, which is the borrowing the card
  // itself is careful not to do.
  const profitDetailInputs = sellpiaHasData
    ? sellpiaProfitInputs ?? null
    : orderProfitInputs ?? null;
  const profitCardBasis = profitCardUsesSellpia
    ? sellpiaProfitInputs?.basis ?? null
    : sellpiaHasData ? sellpiaMetricBasis : profitBasis;
  const profitRateCardBasis = profitRateAvailable
    ? (sellpiaHasData ? sellpiaProfitInputs?.basis ?? null : profitRateBasis)
    : (sellpiaHasData ? sellpiaMetricBasis : profitRateBasis);

  // `periodLabel` is the month the server built the baseline for; it does not
  // follow a custom range, so beside July's day counts it read "2026년 9월".
  // The section names the window that was actually selected.




  // Every failed read on the page, named once. React Query already owns this
  // state, so nothing here is a second copy of it.
  const readFailures: DashboardReadFailure[] = [];
  /**
   * The name and the retry, and nothing else. A transport's own words are how
   * "502 Bad Gateway" reached the screen, and the schema-drift sentinel reads
   * "개발팀에 문의하세요" — a message for us, shown to whoever is looking at the
   * dashboard. Neither is something the reader can act on.
   */
  const addReadFailure = (key: string, label: string, failed: boolean, _error: unknown, retry: () => void) => {
    if (failed) readFailures.push({ key, label, retry });
  };
  addReadFailure('sales-baseline', '주문 매출', salesBaselineHasErr, salesBaselineError, () => { void refetchSalesBaseline(); });
  addReadFailure('ad-baseline', '쿠팡 광고', adBaselineHasErr, adBaselineError, () => { void refetchAdBaseline(); });
  addReadFailure('sales-range', `선택 기간 매출(${rangeLabel})`, salesRangeHasErr, salesRangeError, () => { void refetchSalesRange(); });
  addReadFailure('ad-range', `선택 기간 광고(${rangeLabel})`, adRangeHasErr, adRangeError, () => { void refetchAdRange(); });
  // The Sellpia hook publishes only a boolean, so there is no reason to report
  // beyond the name — which the notice shows, like every other failed read.
  if (channelSales.isError) {
    readFailures.push({
      key: 'sellpia',
      label: '셀피아 판매현황',
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Kiditem Foundry</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-[13px] font-mono text-slate-500">운영 상품 {inventoryData ? formatNumber(inventory.totalProducts) : '—'}</span>
              <span className="text-[13px] font-mono text-slate-400">·</span>
              <span className="text-[13px] font-mono text-slate-500">채널 연결 {inventoryData ? formatNumber(channelLinkedProducts) : '—'}</span>
              {inventoryData && channelUnlinkedProducts > 0 && (
                <>
                  <span className="text-[13px] font-mono text-slate-400">·</span>
                  <span className="text-[13px] font-mono text-amber-700">미연결 {formatNumber(channelUnlinkedProducts)}</span>
                </>
              )}
              <span className="text-[13px] font-mono text-slate-400" aria-hidden="true">·</span>
              <span className="text-[13px] font-mono text-slate-500" title={observedAtTitle}>관측 {observedAgo}</span>
              {periodShifted && latestDataDate && (
                <span
                  className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                  title={`현재 월에 데이터가 없어 최신 데이터 기준 (${latestDataDate})로 표시 중`}
                >
                  최신 데이터 기준 · {latestDataDate}
                </span>
              )}
              {!periodShifted && revenueSource === 'wing' && (
                <span
                  className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200"
                  title="이번 달 주문 데이터가 없어 Wing 매출분석을 기준으로 표시 중"
                >
                  Wing 기준
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Collecting is not scoped by the period, so it stays on the identity
            row. The period controls moved down to the column they govern. */}
        <button
          onClick={requestReadinessOpen}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1 text-[13px] font-semibold text-white transition-colors hover:bg-violet-700"
          title="쿠팡 Wing/광고 데이터 수집 상태 확인 + 누락분 수집 트리거"
        >
          <Database size={13} /> 데이터 수집
        </button>
      </div>


      {selectedRangeLoading && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-[13px] text-slate-500">
          선택한 기간의 매출·광고 데이터를 불러오는 중입니다.
        </div>
      )}
      {channelSales.isLoading && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-[13px] text-slate-500">
          셀피아 판매현황을 불러오는 중입니다.
        </div>
      )}

      {/* 본문 — 왼쪽은 기간을 읽는 것, 오른쪽은 지금 손이 필요한 것.
          한 화면에서 훑는 것이 이 페이지의 용도라 세로로 쌓지 않는다. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <div className="lg:col-span-2 space-y-3">
          <DashboardSectionHeader
            title="기간 지표"
            controls={(
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                {/* One ⓘ for the six cells, broken down per value: two cards in
                    this row can report different windows and different sources,
                    so the panel never states one shared basis. */}
                <DashboardBasisDisclosure
                  label="기간 지표 근거"
                  meaning={(
                    <p>
                      위 선택한 기간의 합계입니다. 매출은 주문 품목 금액의 합이고, 순이익은
                      원가·수수료·배송비 근거가 갖춰진 주문만 계산합니다. 광고비율은
                      광고비÷매출, 광고수익률은 광고전환매출÷광고비이며, 분모가 없으면
                      비율도 내지 않습니다. 여섯 칸의 원천과 기간이 서로 다를 수 있어
                      아래에 값마다 따로 적습니다.
                    </p>
                  )}
                  entries={[
                    { label: `${rangeLabel} 매출`, basis: revenueCardBasis },
                    { label: `${rangeLabel} 순이익`, basis: profitBasis },
                    { label: '이익률', basis: profitRateBasis },
                    { label: '광고비율', basis: adRateBasis },
                    { label: '구매전환율', basis: trafficBasis },
                    { label: '광고수익률', basis: adRoasBasis },
                  ]}
                />
                {kpiRange === 'custom' && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={e => setDateFrom(e.target.value)}
                      aria-label="시작일"
                      className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-700 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <span className="text-slate-400" aria-hidden="true">~</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={e => setDateTo(e.target.value)}
                      aria-label="종료일"
                      className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-700 [color-scheme:light] focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <button
                      onClick={applyCustomRange}
                      disabled={!dateFrom || !dateTo}
                      className="h-7 rounded-md bg-violet-600 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      조회
                    </button>
                  </div>
                )}
                <div className="flex overflow-hidden rounded-md border border-slate-200">
                  {([['month', '월'], ['week', '주'], ['day', '일']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setKpiRange(val)}
                      className={cn(
                        'border-l border-slate-200 px-3 py-1 text-[13px] font-semibold transition-colors first:border-l-0',
                        kpiRange === val ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50',
                      )}
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
                    className={cn(
                      'flex items-center gap-1 border-l border-slate-200 px-3 py-1 text-[13px] font-semibold transition-colors',
                      kpiRange === 'custom' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  ><Calendar size={12} /> 기간</button>
                </div>
              </div>
            )}
          />

        {/* KPI 카드 — 월 매출 + 월 순이익 + 이익률 + 광고비율 */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 lg:grid-cols-6" style={{ alignItems: 'stretch' }}>
          {/* 기간 매출 — 채널 분해는 매출 분석 화면이 owner라 셀 전체가 그리로 간다. */}
        <Link
          href={salesAnalysisHref}
          className="flex flex-col bg-white px-4 py-3 transition-colors hover:bg-slate-50"
          data-testid="dashboard-primary-revenue"
        >
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{rangeLabel} 매출</p>
          <p
            className="whitespace-nowrap text-xl font-bold leading-tight tracking-tight tabular-nums text-slate-900"
            data-testid="dashboard-primary-revenue-value"
          >
            {displayRevenue === null ? '—' : <>{formatKRW(displayRevenue)}<span className="ml-0.5 text-[13px] font-semibold text-slate-500">원</span></>}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-slate-500">
            {revenueCellNote}
            {/* A change against a period that published nothing is not a
                change; the slot stays out of the way rather than showing a
                dash beside a real number. */}
            {!sellpiaHasData && displayRevenue !== null && revenueChange !== null && (
              <span
                className={cn('ml-1 font-medium', revenueChange >= 0 ? 'text-emerald-700' : 'text-red-600')}
                data-testid="dashboard-primary-revenue-change"
              >
                {revenueChange > 0 ? '▲' : '▼'} {Math.abs(revenueChange).toFixed(1)}%
              </span>
            )}
          </p>
          {(trafficCoverageComplete && trafficUnverifiedLabels.length > 0) && (
            <p className="mt-0.5 text-xs text-amber-700">일별 합산·기간 원본 미대사 · {trafficUnverifiedLabels.join(', ')}</p>
          )}
          {trafficMismatchLabels.length > 0 && (
            <p className="mt-0.5 text-xs text-amber-700">기간 원본 불일치로 숨김 · {trafficMismatchLabels.join(', ')}</p>
          )}
        </Link>

          {/* 기간 순이익 — 세 갈래였던 카드가 한 셀이다. 비용 구성과 판매수량은
              어느 갈래든 상세 모달이 들고, 셀은 어느 상태에서든 그 모달을 연다. */}
          <button
            type="button"
            onClick={() => setShowProfitDetail(true)}
            className="flex flex-col items-start bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
            data-testid="dashboard-primary-profit"
            title={profitCellReason ?? undefined}
          >
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{rangeLabel} 순이익</p>
            <p className={cn(
              'whitespace-nowrap text-xl font-bold leading-tight tracking-tight tabular-nums',
              displayProfit === null ? 'text-slate-400' : displayProfit >= 0 ? 'text-slate-900' : 'text-red-600',
            )}>
              {displayProfit === null ? '—' : <>{formatKRW(displayProfit)}<span className="ml-0.5 text-[13px] font-semibold text-slate-500">원</span></>}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">
              {profitCellNote}
              {displayProfit !== null && !sellpiaHasData && profitChange !== null && (
                <span className={cn('ml-1 font-medium', profitChange >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                  {profitChange > 0 ? '▲' : '▼'} {Math.abs(profitChange).toFixed(1)}%
                </span>
              )}
            </p>

          </button>

          {/* 이익률 — 순이익을 못 구하면 정의가 없으니 placeholder 로 */}
          {profitRateAvailable ? (
            <MetricCard
              label="이익률"
              value={displayProfitRate === null ? '—' : displayProfitRate.toFixed(1)}
              unit="%"
              change={sellpiaHasData ? null : profitRateChange}
              prevLabel={sellpiaHasData ? '셀피아 공통 유효 날짜 기준' : `이전 ${formatNullablePercent(prevProfitRate)}`}
            />
          ) : (
            <UnavailableMetricCard
              label="이익률"
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
              invertColor
            />
          ) : (
            <UnavailableMetricCard
              label="광고비율"
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
            />
          ) : (
            <UnavailableMetricCard
              label="구매전환율"
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
            />
          ) : (
            <UnavailableMetricCard
              label="광고수익률"
            />
          )}
        </div>

        <DashboardTrafficFunnel
          steps={trafficFunnelSteps}
          basis={trafficBasis}
          sourceNote={trafficSourceNote}
          partial={trafficCoverage !== null && !trafficCoverageComplete}
          collected={trafficAvailable}
          onCollect={requestReadinessOpen}
        />

          {trendLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">트렌드 데이터를 불러오는 중입니다.</div>
          ) : trendHasErr ? (
            <DashboardSectionUnavailable label="매출 추이" className="rounded-xl border border-slate-200 bg-white" />
          ) : (
            <DashboardChartPanel
              dailyTrend={dailyTrend}
              industryBenchmark={benchmark}
              benchmarkBases={benchmarkBases}
              rangeLabel={kpiRange === 'custom' && dateFrom && dateTo ? `${dateFrom} ~ ${dateTo}` : '최근 30일'}
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
          {/* Its twin, so the two rules read as one boundary. */}
          <DashboardSectionHeader
            title="현재 상태"
            scope="기간과 무관"
          />

          {inventoryHasErr ? (
            <DashboardSectionUnavailable label="경고" />
          ) : !inventoryData ? (
            <DashboardSectionEmpty label="경고" />
          ) : (
            <DashboardWarningTable
              rows={buildWarningRows(inventory.warnings, warningBasis, inventory.unclassifiedProductCount, inventoryHeaderBasis, inventory.gradeChanges?.downgraded)}
            />
          )}

          <DashboardAdPerformance
            rows={adPerformanceRows}
            basis={adRoasBasis}
          />

          {inventoryHasErr ? (
            <DashboardSectionUnavailable label="수익성 ABC" />
          ) : !inventoryData ? (
            <DashboardSectionEmpty label="수익성 ABC" />
          ) : (
            <DashboardGradeCards
              gradeCount={inventory.gradeCount}
              classifiedProductCount={inventory.classifiedProductCount}
              abcStatusCount={inventory.abcStatusCount}
              abcContributionProfit={inventory.abcContributionProfit}
              abcFormula={inventory.abcFormula}
              basis={inventoryBasis}
              refetchReads={async () => { await refetchInventory(); }}
            />
          )}

          {/* Always rendered. Replacing it on a failed read hid the one place a
              failed read can be retried from — including its own. */}
          <DashboardSidePanel
            alerts={inventoryData?.alerts ?? []}
            readFailures={readFailures}
          />
        </div>
      </div>

      {/* 순이익 상세 모달 */}
      {showProfitDetail && (
        <DashboardProfitDetailModal
          salesBaseline={effectiveSales ?? (kpiRange === 'month' ? baselineSales : EMPTY_SALES_SUMMARY)}
          adBaseline={effectiveAd ?? (kpiRange === 'month' ? baselineAd : EMPTY_AD_SUMMARY)}
          selectedRange={kpiRange}
          inputs={profitDetailInputs}
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

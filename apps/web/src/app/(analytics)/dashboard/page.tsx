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
  DashboardCollectionsSchema,
  DashboardFindingsSchema,
  DashboardInventorySummarySchema,
  DashboardTrendItemSchema,
  type TrafficKpi,
  periodBasisStatus,
} from '@kiditem/shared/dashboard';
import { adTrafficReconciliationStatus } from '@kiditem/shared/advertising';
import { MallListingMatrixResponseSchema } from '@kiditem/shared/mall-publishing';
import { z } from 'zod';
import {
  businessDateKey,
  datesInclusive,
  parseBusinessDate,
  shiftBusinessDateKey,
} from '@kiditem/shared/common';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber, formatDateTime, timeAgo } from '@/lib/utils';
import ReadinessModal from '@/components/ReadinessModal';
import {
  sellpiaPeriodRange,
  useSellpiaChannelSales,
  useSellpiaKnownThrough,
} from '@/hooks/useSellpiaChannelSales';
import { DashboardHeadlineCards, type HeadlineMetric } from './components/DashboardHeadlineCards';
import { DashboardRevenue } from './components/DashboardRevenue';
import { DashboardAgentStatus } from './components/DashboardAgentStatus';
import { DashboardAgentSummary, DashboardUrgentQueue } from './components/DashboardWorkQueue';
import { DashboardAiSuggestion } from './components/DashboardAiSuggestion';
import { buildAiSuggestions } from './lib/ai-suggestions';
import { DashboardRecentProducts, RECENT_PRODUCT_SLOTS } from './components/DashboardRecentProducts';
import { MetricCard, UnavailableMetricCard } from './components/DashboardMetricCard';
import { DashboardReadFailures, type DashboardReadFailure } from './components/DashboardReadFailures';
import { DashboardTopProducts } from './components/DashboardTopProducts';
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

function trafficReconciliation(kpi: TrafficKpi | undefined, metric: TrafficMetric) {
  const reconciled = kpi?.reconciliation?.[metric];
  return reconciled ? adTrafficReconciliationStatus(reconciled) : null;
}

function trafficMetricValue(kpi: TrafficKpi | undefined, metric: TrafficMetric): number | null {
  if (!kpi || trafficReconciliation(kpi, metric) === 'MISMATCH') return null;
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

const RECENT_PRODUCTS_PARAMS = {
  filter: 'all',
  page: '1',
  limit: String(RECENT_PRODUCT_SLOTS),
} as const satisfies Record<string, string>;

const FINDINGS_REFRESH_MS = 5 * 60_000;

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
  const start = parseBusinessDate(sortedDates[0]!);
  const end = parseBusinessDate(sortedDates[sortedDates.length - 1]!);
  if (!start || !end || end <= start) return rows;
  const filled: Array<{
    date: string;
    revenue: number | null;
    profit: number | null;
    adCost: number | null;
    evidence: TrendEvidence;
  }> = [];
  for (const cursor of datesInclusive(start, end)) {
    const date = businessDateKey(cursor);
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

  const [kpiRange, setKpiRange] = useState<'month' | 'week' | 'day' | 'custom'>('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showReadiness, setShowReadiness] = useState(false);
  const requestReadinessOpen = useCallback(() => setShowReadiness(true), []);
  const sellpiaKnownThrough = useSellpiaKnownThrough();
  const channelSales = useSellpiaChannelSales(
    sellpiaKnownThrough
      ? sellpiaPeriodRange(kpiRange, dateFrom, dateTo, sellpiaKnownThrough)
      : null,
  );

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
    queryKey: queryKeys.dashboard.trend(kpiRange, dateFrom, dateTo),
    queryFn: () => {
      const params = kpiRange === 'custom' && dateFrom && dateTo
        ? `?range=custom&from=${dateFrom}&to=${dateTo}`
        : `?range=${kpiRange}`;
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

  const findingsQuery = useQuery({
    queryKey: queryKeys.dashboard.findings(),
    queryFn: () => apiClient.getParsed('/api/dashboard/findings', DashboardFindingsSchema),
    staleTime: FINDINGS_REFRESH_MS,
    refetchInterval: FINDINGS_REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  const collectionsQuery = useQuery({
    queryKey: queryKeys.dashboard.collections(),
    queryFn: () => apiClient.getParsed('/api/dashboard/collections', DashboardCollectionsSchema),
    staleTime: FINDINGS_REFRESH_MS,
    refetchInterval: FINDINGS_REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  const recentProductsQuery = useQuery({
    queryKey: queryKeys.mallPublishing.listingMatrix(RECENT_PRODUCTS_PARAMS),
    queryFn: () => apiClient.getParsed(
      `/api/channels/mall-publishing/listing-matrix?${new URLSearchParams(RECENT_PRODUCTS_PARAMS).toString()}`,
      MallListingMatrixResponseSchema,
    ),
    staleTime: FINDINGS_REFRESH_MS,
    refetchInterval: FINDINGS_REFRESH_MS,
    refetchIntervalInBackground: false,
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
  const baselineSales = salesBaseline;
  const baselineAd = adBaseline;

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
  const salesMonthly = effectiveSales?.monthly ?? (kpiRange === 'month' ? baselineSales?.monthly : undefined);
  // A range payload is authoritative even when one of its nullable fields is
  // null. Only fall back when that range field is absent, never when it says
  // the metric is unavailable.
  const kpiRevenue = rk ? rk.revenue : salesMonthly?.revenue ?? null;
  const kpiProfit = rk ? rk.profit : salesMonthly?.profit ?? null;
  const revenueChange = rk ? rk.revenueChange : salesMonthly?.revenueChange ?? null;
  const profitChange = rk ? rk.profitChange : salesMonthly?.profitChange ?? null;
  const profitRate = rk && rk.profitRate !== undefined
    ? rk.profitRate
    : percentage(salesMonthly?.profit ?? null, salesMonthly?.revenue ?? null);
  const prevProfitRate = rk && rk.prevProfitRate !== undefined
    ? rk.prevProfitRate
    : percentage(salesMonthly?.prevProfit ?? null, salesMonthly?.prevRevenue ?? null);
  const profitRateChange = rk && rk.profitRateChange !== undefined
    ? rk.profitRateChange
    : profitRate !== null && prevProfitRate !== null ? profitRate - prevProfitRate : null;
  const adMonthly = effectiveAd?.monthly ?? (kpiRange === 'month' ? baselineAd?.monthly : undefined);
  const adKpi = effectiveAd?.adKpi;
  const rawAdConvRevenue = rkAd
    ? rkAd.adConvRevenue
    : nullableValue(adKpi?.convRevenue, adMonthly?.adRevenue);
  const rawAdRoas = rkAd
    ? rkAd.adRoas
    : nullableValue(adKpi?.roas, adMonthly?.roas);
  const rawAdPrevRoas = rkAd
    ? rkAd.prevAdRoas ?? null
    : nullableValue(adKpi?.prevRoas, adMonthly?.prevRoas);
  const adCoverage = rkAd
    ? rkAd.coverage ?? null
    : nullableValue(adKpi?.coverage, adMonthly?.coverage);
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
  const adPerformanceBasis = (key: string) => readMetricBasis(effectiveAd, `adKpi.${key}`);
  const adPerformanceRows = [
    { key: 'convRevenue', label: '광고전환매출', sublabel: '쿠팡', display: formatNullableKRW(adConvRevenue), basis: adPerformanceBasis('convRevenue') },
    { key: 'impressions', label: '노출', display: adImpressions === null ? '—' : `${formatNumber(adImpressions)}회`, basis: adPerformanceBasis('impressions') },
    {
      key: 'clicks',
      label: '클릭 · CTR',
      display: adClicks === null
        ? '—'
        : `${formatNumber(adClicks)}회${adCtr === null ? '' : ` · ${adCtr.toFixed(2)}%`}`,
      basis: adPerformanceBasis('ctr'),
    },
    {
      key: 'conversions',
      label: '광고주문 · CVR',
      display: adConversions === null
        ? '—'
        : `${formatNumber(adConversions)}건${adCvr === null || adCvr === undefined ? '' : ` · ${adCvr.toFixed(2)}%`}`,
      basis: adPerformanceBasis('cvr'),
    },
  ];

  const rawAdRate = rkAd ? rkAd.adRate ?? null : salesMonthly?.adRate ?? null;
  const rawAdPrevRate = rkAd ? rkAd.prevAdRate ?? null : salesMonthly?.prevAdRate ?? null;
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
  const wingRevenue = nullableValue(salesMonthly?.wingRevenue, kpiRevenue);

  // 트렌드 차트용 데이터
  // 읽기가 `null` 을 돌려주면 기본값(`= []`)이 걸리지 않는다 — 기본값은 `undefined` 에만 붙는다.
  // 막지 않으면 추이 하나가 비었다고 대시보드 전체가 죽는다.
  const dailyTrend = fillTrendDateGaps((trendData ?? []).map((d) => ({
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
  const effectivePeriod = effectiveSales?.effectivePeriod ?? (kpiRange === 'month' ? baselineSales?.effectivePeriod : undefined);
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
  const channelLinkedProducts = inventoryData?.channelLinkedProducts ?? null;
  const channelUnlinkedProducts = inventoryData?.channelUnlinkedProducts ?? null;
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
  const trafficCartRate = trafficKpi?.cartRate ?? null;
  const trafficOrders = trafficMetricValue(trafficKpi, 'orders');
  const trafficOrderCartRate = trafficKpi?.orderCartRate ?? null;
  const trafficSalesQty = trafficMetricValue(trafficKpi, 'salesQty');
  const trafficRevenue = trafficMetricValue(trafficKpi, 'revenue');
  const trafficDailyAverageVisitors = trafficKpi?.dailyAverageVisitors ?? null;
  const trafficConversionRate = trafficReconciliation(trafficKpi, 'orders') === 'MISMATCH'
    || trafficReconciliation(trafficKpi, 'views') === 'MISMATCH'
    ? null
    : trafficKpi?.conversionRate ?? null;
  const trafficProviderConversionRate = trafficKpi?.providerConversionRate ?? null;
  const trafficCoverage = trafficKpi?.coverage ?? null;
  const trafficCoverageComplete = trafficCoverage !== null
    && trafficCoverage.targetDays > 0
    && trafficCoverage.completedDays === trafficCoverage.targetDays;
  const trafficMismatchLabels = trafficMetricLabels
    .filter(([metric]) => trafficReconciliation(trafficKpi, metric) === 'MISMATCH')
    .map(([, label]) => label);
  const trafficUnverifiedLabels = trafficMetricLabels
    .filter(([metric]) => trafficReconciliation(trafficKpi, metric) === 'UNVERIFIED')
    .map(([, label]) => label);
  const trafficFilterScope = trafficKpi?.exactPeriodEvidence?.filterScope === 'ALL_NORMAL_RFM'
    ? 'ALL_NORMAL_RFM'
    : null;
  const trafficObservedAt = trafficKpi?.trafficObservedAt ?? null;

  // The server owns each rate because it can restrict both operands to the
  // same owner-confirmed listing/date population. The screen only formats it.
  const formatFunnelRate = (value: number | null): string | null =>
    value === null ? null : `${value.toFixed(1)}%`;
  const trafficFunnelSteps = [
    // A daily average is rarely whole (2,424 visitors over 13 days is 186.46);
    // show whole visitors, as the sales-analysis card does.
    { key: 'visitors', label: '일평균 방문자', display: formatTrafficMetric(trafficDailyAverageVisitors === null ? null : Math.round(trafficDailyAverageVisitors), '명'), rate: null, basis: readMetricBasis(effectiveSales, 'trafficKpi.visitors'), rateBasis: null },
    // No rate against visitors. The first step is a daily average of account
    // unique visitors and every later step is a period sum, so the quotient is
    // not a share of anything — with ten days collected it read 1256.1%. Wing
    // publishes UV per day and a visitor returning on two days is one visitor
    // on each, so there is no period UV to divide by either.
    { key: 'views', label: '조회', display: formatTrafficMetric(trafficViews, '회'), rate: null, basis: readMetricBasis(effectiveSales, 'trafficKpi.views'), rateBasis: null },
    { key: 'cartAdds', label: '장바구니', display: formatTrafficMetric(trafficCartAdds, '회'), rate: formatFunnelRate(trafficCartRate), basis: readMetricBasis(effectiveSales, 'trafficKpi.cartAdds'), rateBasis: readMetricBasis(effectiveSales, 'trafficKpi.cartRate') },
    { key: 'orders', label: '주문', display: formatTrafficMetric(trafficOrders, '건'), rate: formatFunnelRate(trafficOrderCartRate), basis: readMetricBasis(effectiveSales, 'trafficKpi.orders'), rateBasis: readMetricBasis(effectiveSales, 'trafficKpi.orderCartRate') },
    { key: 'salesQty', label: '판매량', display: formatTrafficMetric(trafficSalesQty, '개'), rate: null, basis: readMetricBasis(effectiveSales, 'trafficKpi.salesQty'), rateBasis: null },
  ];
  // "부분 N/M일" is the one phrase for partially collected, the same one the
  // ad lane uses. Values carry their own date basis because Orders-owned steps
  // use the exact Orders × Wing listing/date intersection.
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
      : trafficKpi?.source === 'mixed'
        ? 'Wing 트래픽 + Orders 상품·날짜 교집합'
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
  const salesAnalysisPeriod = sp?.range?.from.slice(0, 7)
    ?? (effectivePeriod
      ? `${effectivePeriod.year}-${String(effectivePeriod.month).padStart(2, '0')}`
      : sellpiaKnownThrough
        ? shiftBusinessDateKey(sellpiaKnownThrough, 1).slice(0, 7)
        : '');
  const salesAnalysisHref = `/sales-analysis?tab=overview&period=${encodeURIComponent(salesAnalysisPeriod)}`;
  const revenueBasis = rangeMetricBasis(effectiveSales, kpiRange, 'revenue');
  const todayBasis = readFirstMetricBasis(baselineSales, ['today.revenue', 'today.orders']);
  const today = baselineSales?.today ?? null;
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
  const contributionBasis = readFirstMetricBasis(inventoryData, [
    'abcContributionProfit.amountByGrade.A',
    'abcContributionProfit.amountByGrade.B',
    'abcContributionProfit.amountByGrade.C',
  ]);
  const unclassifiedBasis = readMetricBasis(inventoryData, 'unclassifiedProductCount');
  const downgradedBasis = readMetricBasis(inventoryData, 'gradeChanges.downgraded');
  /** 등급 이동(▲들어온 수 ▼나간 수)의 근거. 없으면 ABC 칸이 화살표를 그리지 않는다. */
  const changesBasis = readFirstMetricBasis(inventoryData, ['gradeChanges.total']);
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
    return timeAgo(String(observedAtRaw));
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
  const profitCardBasis = profitCardUsesSellpia
    ? sellpiaProfitInputs?.basis ?? null
    : sellpiaHasData ? sellpiaMetricBasis : profitBasis;
  const profitRateCardBasis = profitRateAvailable
    ? (sellpiaHasData ? sellpiaProfitInputs?.basis ?? null : profitRateBasis)
    : (sellpiaHasData ? sellpiaMetricBasis : profitRateBasis);

  // Operational headline cards reuse values selected above. They do not derive
  // a second profit or availability policy in the browser.
  const headlineRevenueChange = !sellpiaHasData && displayRevenue !== null ? revenueChange : null;
  const headlineProfitChange = !sellpiaHasData && displayProfit !== null ? profitChange : null;
  const changeNote = (change: number | null) =>
    change === null ? null : `${change > 0 ? '▲' : change < 0 ? '▼' : '−'} ${Math.abs(change).toFixed(1)}% 이전 대비`;
  const trendOf = (change: number | null): 'up' | 'down' | null =>
    change === null || change === 0 ? null : change > 0 ? 'up' : 'down';
  const headlineAdSpend = rkAd ? rkAd.adSpend : adMonthly?.totalAdSpend ?? null;
  const headlinePrevAdSpend = rkAd ? rkAd.prevAdSpend ?? null : adMonthly?.prevTotalAdSpend ?? null;
  const headlineAdCtr = rkAd?.adCtr ?? adCtr;
  const headlinePrevAdCtr = rkAd ? rkAd.prevAdCtr ?? null : adMonthly?.prevCtr ?? null;
  const headlinePrevAdConvRevenue = rkAd ? rkAd.prevAdConvRevenue ?? null : adMonthly?.prevAdRevenue ?? null;
  const prevNote = (previous: number | null, format: (value: number) => string) =>
    previous === null ? null : `이전 ${format(previous)}`;
  const adCoverageForHeadline = rkAd ? rkAd.coverage ?? null : adMonthly?.coverage ?? adKpi?.coverage ?? null;
  const adCoverageNote = adCoverageForHeadline && adCoverageForHeadline.completedDays < adCoverageForHeadline.targetDays
    ? `광고 수집 ${adCoverageForHeadline.completedDays}/${adCoverageForHeadline.targetDays}일`
    : null;
  const receiptReady = sellpiaHasData && sp !== undefined;
  const headlineRevenue: HeadlineMetric[] = [
    {
      key: 'revenue',
      label: `${rangeLabel} 매출`,
      value: displayRevenue === null ? null : formatKRW(displayRevenue),
      unit: '원',
      note: changeNote(headlineRevenueChange),
      trend: trendOf(headlineRevenueChange),
    },
    {
      key: 'cost',
      label: '매입 원가',
      value: receiptReady ? formatKRW(sp.totalCost) : null,
      unit: '원',
      negative: true,
    },
    {
      key: 'adCost',
      label: '광고비',
      value: receiptReady && sp.adCost !== null ? formatKRW(sp.adCost) : null,
      unit: '원',
      negative: true,
      note: receiptReady && sp.adCost === null ? '광고비 수집 전' : null,
    },
    {
      key: 'profit',
      label: `${rangeLabel} 순이익`,
      value: displayProfit === null ? null : formatKRW(displayProfit),
      unit: '원',
      suffix: receiptReady && sp.profitRate !== null ? `${sp.profitRate.toFixed(1)}%` : undefined,
      note: displayProfit === null ? '필수 비용 근거 없음' : changeNote(headlineProfitChange),
      trend: trendOf(headlineProfitChange),
      emphasis: true,
    },
  ];
  const headlineAds: HeadlineMetric[] = [
    {
      key: 'roas',
      label: 'ROAS',
      value: adRoas === null ? null : adRoas.toFixed(0),
      unit: '%',
      note: adRoas === null ? adCoverageNote : prevNote(adPrevRoas, (value) => `${value.toFixed(0)}%`),
      trend: trendOf(adRoasChange),
    },
    {
      key: 'ctr',
      label: '클릭률 (CTR)',
      value: headlineAdCtr === null ? null : headlineAdCtr.toFixed(2),
      unit: '%',
      note: prevNote(headlinePrevAdCtr, (value) => `${value.toFixed(2)}%`),
    },
    {
      key: 'adConvRevenue',
      label: '광고 전환매출',
      value: adConvRevenue === null ? null : formatKRW(adConvRevenue),
      unit: '원',
      note: prevNote(headlinePrevAdConvRevenue, (value) => `${formatKRW(value)}원`),
    },
    {
      key: 'adSpend',
      label: '광고비',
      value: headlineAdSpend === null ? null : formatKRW(headlineAdSpend),
      unit: '원',
      note: prevNote(headlinePrevAdSpend, (value) => `${formatKRW(value)}원`),
      higherIsWorse: true,
    },
  ];
  const lastCompleted = collectionsQuery.data?.lastCompleted ?? null;
  const collectedAgo = (sourceType: string) => {
    const iso = lastCompleted?.[sourceType];
    return iso ? timeAgo(new Date(iso), new Date()) : null;
  };
  const orderCollectAgo = collectedAgo('order_collection_mall');
  const trackingAgo = collectedAgo('sellpia_shipment_tracking');
  const todayCollectedOrders = today?.collectedOrders ?? null;
  const headlineMall: HeadlineMetric[] = [
    {
      key: 'mallOrders',
      label: '오늘 주문',
      // 주문일이 아니라 **오늘 걷은 주문**이다. 주문수집 화면이 세는 것과 같은 사실을 읽어야
      // 두 화면이 같은 수를 말한다(사장님 2026-09-22: 63 대 82).
      value: todayCollectedOrders === null ? null : formatNumber(todayCollectedOrders),
      unit: '건',
      note: todayCollectedOrders === null
        ? (orderCollectAgo ? `오늘은 아직 — 마지막 수집 ${orderCollectAgo}` : '아직 수집 전')
        : '몰에서 수집한 주문',
      href: '/order-collection',
    },
    { key: 'mallOrderCollect', label: '주문 수집', value: orderCollectAgo, href: '/order-collection' },
    { key: 'mallTracking', label: '송장 수집', value: trackingAgo, href: '/order-collection' },
    { key: 'mallCancelReturn', label: '취소 · 반품', value: null },
  ];
  const measuredWarning = (key: keyof NonNullable<typeof inventoryData>['warnings']): number | null => {
    const value = inventoryData?.warnings[key];
    return basisHasValues(warningBasis(`warnings.${key}`)) && typeof value === 'number' ? value : null;
  };
  const reorderProductCount = basisHasValues(readMetricBasis(findingsQuery.data, 'reorderProductCount'))
    ? findingsQuery.data?.reorderProductCount ?? null : null;
  const outOfStockCount = measuredWarning('outOfStockSkus');
  const mappingAttentionCount = measuredWarning('mappingAttentionSkus');
  const negativeProfitCount = measuredWarning('minusProducts');
  const count = (value: number | null) => value === null ? null : formatNumber(value);
  const headlineInventory: HeadlineMetric[] = [
    {
      key: 'stockSoon', label: '발주 검토', value: count(reorderProductCount), unit: '개',
      note: '기존 소진 분석 · 매출 연결 상품', alert: (reorderProductCount ?? 0) > 0,
      href: '/product-hub?inventoryFocus=reorder&activeStatus=all',
    },
    {
      key: 'stockOut', label: '품절 상품', value: count(outOfStockCount), unit: '개',
      alert: (outOfStockCount ?? 0) > 0, href: '/product-hub?inventoryFocus=out_of_stock&activeStatus=all',
    },
    {
      key: 'stockMatching', label: '매칭 확인 필요', value: count(mappingAttentionCount), unit: '개',
      note: '쇼핑몰 옵션 연결 기준', href: '/mall-listings',
    },
    {
      key: 'lossProducts', label: '적자 쇼핑몰 상품', value: count(negativeProfitCount), unit: '개',
      note: '기존 상품×쇼핑몰 손익 기준', higherIsWorse: true, href: '/profit-loss',
    },
  ];
  const aiSuggestions = buildAiSuggestions({
    findings: findingsQuery.data,
    stock: { outOfStockCount, reorderProductCount },
    unlinkedProducts: channelUnlinkedProducts,
  });

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
  addReadFailure('findings', 'AI 발견 · 제안', findingsQuery.isError, findingsQuery.error, () => { void findingsQuery.refetch(); });
  addReadFailure('collections', '몰 수집 기록', collectionsQuery.isError, collectionsQuery.error, () => { void collectionsQuery.refetch(); });
  addReadFailure('recent-products', '상품별 쇼핑몰 연결 현황', recentProductsQuery.isError, recentProductsQuery.error, () => { void recentProductsQuery.refetch(); });

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
              <span className="text-[13px] font-mono text-slate-500">운영 상품 {inventoryData ? formatNumber(inventoryData.totalProducts) : '—'}</span>
              <span className="text-[13px] font-mono text-slate-400">·</span>
              <span className="text-[13px] font-mono text-slate-500">
                채널 연결 {channelLinkedProducts === null ? '—' : formatNumber(channelLinkedProducts)}
              </span>
              {channelUnlinkedProducts !== null && channelUnlinkedProducts > 0 && (
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

      {/* 다섯 칸 한 줄. 아래 줄은 매출 추이 세 칸과 AI 에이전트 두 칸이 나란히 선다.
          이 요약은 서버가 발표한 값을 카드에 배치하고, 기존 운영 상세 영역은 아래에 남긴다. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 min-[1500px]:grid-cols-5">
        <DashboardAgentStatus>
          {({ agents }) => (
            <>
              <DashboardHeadlineCards
                className="contents"
                revenue={headlineRevenue}
                mall={headlineMall}
                ads={headlineAds}
                inventory={headlineInventory}
                salesHref={salesAnalysisHref}
              />

              {inventoryHasErr ? (
                <DashboardSectionUnavailable label="수익성 ABC" />
              ) : !inventoryData ? (
                <DashboardSectionEmpty label="수익성 ABC" />
              ) : (
                <DashboardGradeCards
                  gradeCount={inventoryData.gradeCount}
                  classifiedProductCount={inventoryData.classifiedProductCount}
                  unclassifiedProductCount={inventoryData.unclassifiedProductCount}
                  unclassifiedBasis={unclassifiedBasis}
                  abcContributionProfit={inventoryData.abcContributionProfit}
                  abcFormula={inventoryData.abcFormula}
                  gradeChanges={inventoryData.gradeChanges}
                  changesMeasured={basisHasValues(changesBasis)}
                  basis={inventoryBasis}
                  contributionBasis={contributionBasis}
                  refetchReads={async () => { await refetchInventory(); }}
                />
              )}

              <DashboardRevenue
                className="min-w-0 min-[1500px]:col-span-3"
                summary={channelSales.summary}
                isLoading={channelSales.isLoading}
                isError={channelSales.isError}
                salesHref={salesAnalysisHref}
              />

              <section
                aria-label="AI 에이전트"
                className="flex min-w-0 flex-col gap-4 self-start rounded-2xl border border-violet-200 bg-violet-100/60 p-3 min-[1500px]:col-span-2"
              >
                <DashboardAgentSummary findings={findingsQuery.data} findingsError={findingsQuery.isError} findingsLoading={findingsQuery.isLoading} />
                <div className="grid min-w-0 grid-cols-1 gap-4 lg:h-[22.5rem] lg:grid-cols-2">
                  {agents}
                  <DashboardUrgentQueue findings={findingsQuery.data} findingsLoading={findingsQuery.isLoading} findingsError={findingsQuery.isError} />
                </div>
                <DashboardAiSuggestion
                  className="min-w-0"
                  suggestions={aiSuggestions}
                  basis={readMetricBasis(findingsQuery.data, 'reorderSuggestions')}
                  isLoading={findingsQuery.isLoading}
                  isError={findingsQuery.isError}
                />
              </section>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 min-[1500px]:col-span-5 min-[1500px]:grid-cols-5">
                {topProductsHasErr ? (
                  <DashboardSectionUnavailable label="Top Revenue Products" className="rounded-2xl border border-slate-200/80 bg-white min-[1500px]:col-span-3" />
                ) : topProductsLoading ? (
                  <div className="flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white py-8 text-center text-sm text-slate-500 min-[1500px]:col-span-3">
                    상품 매출 데이터를 불러오는 중입니다.
                  </div>
                ) : !effectiveSales ? (
                  <div className="rounded-2xl border border-slate-200/80 bg-white min-[1500px]:col-span-3">
                    <DashboardSectionEmpty label="Top Revenue Products" />
                  </div>
                ) : (
                  <DashboardTopProducts className="min-w-0 min-[1500px]:col-span-3" products={topProducts} basis={topProductsBasis} />
                )}
                <DashboardRecentProducts
                  className="min-w-0 min-[1500px]:col-span-2"
                  rows={recentProductsQuery.data?.rows}
                  isLoading={recentProductsQuery.isLoading}
                  isError={recentProductsQuery.isError}
                />
              </div>
            </>
          )}
        </DashboardAgentStatus>
      </div>


      {/* 읽지 못한 값은 숨기지 않고 한 줄로 모은다 — 빈 칸의 까닭을 사장님이 알아야 한다. */}
      <DashboardReadFailures failures={readFailures} />

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

'use client';

import { useCallback, useState } from 'react';
import { Calendar, Database, Zap } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DashboardSalesSummarySchema,
  DashboardAdSummarySchema,
  DashboardCollectionsSchema,
  DashboardFindingsSchema,
  DashboardInventorySummarySchema,
  type TrafficKpi,
} from '@kiditem/shared/dashboard';
import { MallListingMatrixResponseSchema } from '@kiditem/shared/mall-publishing';
import { adTrafficReconciliationStatus } from '@kiditem/shared/advertising';
import { shiftBusinessDateKey } from '@kiditem/shared/common';
import { MasterProductOperationsListResponseSchema } from '@kiditem/shared/product-operations';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';
import ReadinessModal from '@/components/ReadinessModal';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber, timeAgo } from '@/lib/utils';
import {
  sellpiaPeriodRange,
  useSellpiaChannelSales,
  useSellpiaKnownThrough,
} from '@/hooks/useSellpiaChannelSales';
import { DashboardReadFailures, type DashboardReadFailure } from './components/DashboardReadFailures';
import { DashboardHeadlineCards, type HeadlineMetric } from './components/DashboardHeadlineCards';
import { DashboardRevenue } from './components/DashboardRevenue';
import { DashboardAgentStatus } from './components/DashboardAgentStatus';
import { DashboardAgentSummary, DashboardUrgentQueue } from './components/DashboardWorkQueue';
import { DashboardTopProducts } from './components/DashboardTopProducts';
import { DashboardGradeCards } from './components/DashboardGradeCards';
import { DashboardAiSuggestion } from './components/DashboardAiSuggestion';
import { buildAiSuggestions } from './lib/ai-suggestions';
import { DashboardRecentProducts, RECENT_PRODUCT_SLOTS } from './components/DashboardRecentProducts';
import { WingDailyTrafficCollection } from './components/WingDailyTrafficCollection';
import {
  basisHasValues,
  readFirstMetricBasis,
  readMetricBasis,
} from './components/DashboardDataBasis';

type TrafficMetric = 'views' | 'cartAdds' | 'orders' | 'salesQty' | 'revenue';

function trafficReconciliation(kpi: TrafficKpi | undefined, metric: TrafficMetric) {
  const reconciled = kpi?.reconciliation?.[metric];
  return reconciled ? adTrafficReconciliationStatus(reconciled) : null;
}

function trafficMetricValue(kpi: TrafficKpi | undefined, metric: TrafficMetric): number | null {
  if (!kpi || trafficReconciliation(kpi, metric) === 'MISMATCH') return null;
  return kpi[metric] ?? null;
}

function nullableValue<T>(value: T | null | undefined, fallback: T | null | undefined): T | null {
  return value === undefined ? fallback ?? null : value;
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

/** 상품 관리 첫 화면의 요약 읽기와 같은 인자 — 같은 캐시를 쓴다. */
const PRODUCT_OVERVIEW_PARAMS = {
  page: '1',
  limit: '1',
  periodDays: '30',
  activeStatus: 'active',
  adStatus: 'all',
} as const satisfies Record<string, string>;

/** 몰 등록 현황의 첫 줄들 — 셀피아 코드가 큰(나중에 등록된) 상품부터, 몰 등록 여부와 함께. */
const RECENT_PRODUCTS_PARAMS = {
  filter: 'all',
  page: '1',
  limit: String(RECENT_PRODUCT_SLOTS),
} as const satisfies Record<string, string>;

/**
 * findings 는 셀피아 상품별 소진 전체를 읽는 무거운 읽기다(1~2초). 그 원천은 하루 몇 번
 * 모이므로 5분마다면 충분하다 — 탭 하나에 분당 0.2회씩 두 읽기가 더해진다.
 */
const FINDINGS_REFRESH_MS = 5 * 60_000;

export default function Dashboard() {
  const queryClient = useQueryClient();

  const [kpiRange, setKpiRange] = useState<'month' | 'week' | 'day' | 'custom'>('month');
  // 데이터 수집 버튼이 여는 수집 점검 창(사장님 2026-09-19 복원 — 9/18 단순화에서 빠졌던 것).
  const [showReadiness, setShowReadiness] = useState(false);
  const requestReadinessOpen = useCallback(() => setShowReadiness(true), []);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
  const baselineSales = salesBaseline;
  const baselineAd = adBaseline;

  // Keep the dashboard shell visible while individual read models load or
  // fail. Only the all-three initial request state uses the page skeleton.
  // 재고 칸은 상품 관리가 내는 요약을 그대로 읽는다 — 상품 관리 첫 화면과 같은 읽기라 캐시도,
  // 숫자도 같다. 대시보드는 세지 않는다.
  const productOverview = useQuery({
    queryKey: queryKeys.products.operations.list(PRODUCT_OVERVIEW_PARAMS),
    queryFn: () => apiClient.getParsed(
      `/api/products/masters?${new URLSearchParams(PRODUCT_OVERVIEW_PARAMS).toString()}`,
      MasterProductOperationsListResponseSchema,
    ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  // AI가 발견한 문제 · AI 제안 — 서버가 원천의 판정을 골라 센 값. 대시보드는 세지 않는다.
  const findingsQuery = useQuery({
    queryKey: queryKeys.dashboard.findings(),
    queryFn: () => apiClient.getParsed('/api/dashboard/findings', DashboardFindingsSchema),
    staleTime: FINDINGS_REFRESH_MS,
    refetchInterval: FINDINGS_REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  // 쇼핑몰 칸의 '마지막 수집' — 원천마다 마지막으로 끝난 시각. 대시보드는 세지 않는다.
  const collectionsQuery = useQuery({
    queryKey: queryKeys.dashboard.collections(),
    queryFn: () => apiClient.getParsed('/api/dashboard/collections', DashboardCollectionsSchema),
    staleTime: FINDINGS_REFRESH_MS,
    refetchInterval: FINDINGS_REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  // 최근 등록된 상품 — Channels 의 몰 등록 현황 읽기를 그대로 쓴다.
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

  if (inventoryLoading && salesBaselineLoading && adBaselineLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

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
  // Partial evidence still supports the values that were actually measured.
  // Coverage is disclosed beside the metric; it must not turn non-null partial
  // values into an unavailable card.
  const adConvRevenue = rawAdConvRevenue;
  const adRoas = rawAdRoas;
  const adPrevRoas = rawAdPrevRoas;
  // Impressions/clicks/conversions are published by the ad owner and simply
  // were never rendered. Nothing here is derived in the browser: a rate without
  // its own basis could not answer "where did this number come from?".
  const adCtr = adKpi?.ctr ?? null;

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
  // 데이터 출처 라벨 — Drive replay / Wing / 쿠팡 광고 / 주문 기준 등을 한 곳에서 결정
  const effectivePeriod = effectiveSales?.effectivePeriod ?? (kpiRange === 'month' ? baselineSales?.effectivePeriod : undefined);
  const trafficKpi = effectiveSales?.trafficKpi;
  const periodShifted = effectivePeriod?.shifted ?? false;
  const latestDataDate = effectivePeriod?.latestDataDate ?? null;
  const revenueSource = effectivePeriod?.revenueSource
    ?? (trafficKpi?.source === 'wing' ? 'wing' : 'orders');
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
  const channelLinkedProducts = inventoryData?.channelLinkedProducts ?? null;
  const channelUnlinkedProducts = inventoryData?.channelUnlinkedProducts ?? null;
  const trafficRevenue = trafficMetricValue(trafficKpi, 'revenue');

  // 셀피아 판매현황(몰별 매출) 파생값 — 월 매출/순이익 카드가 이 소스로 표시된다.
  const sp = channelSales.summary;
  const sellpiaMetricBasis = readMetricBasis(sp, 'totalRevenue');
  const sellpiaProfitInputs = sp?.profitInputs ?? null;
  const spTotal = sp?.totalRevenue ?? null;
  // Sellpia publishes a compact basis map. Prefer the fixed group keys so
  // rocket/others cards inherit the same evidence without requiring a basis
  // entry per seller ID; row-local keys remain valid when a group diverges.
  const sellpiaHasData = sp?.hasData === true
    && spTotal !== null
    && (!sellpiaMetricBasis || basisHasValues(sellpiaMetricBasis));
  const sellpiaProfitInputsAvailable = sellpiaProfitInputs !== null && basisHasValues(sellpiaProfitInputs.basis);
  // Keep the server-owned profitability projection. The inputs explain why
  // the value is available, but the client must not re-derive a possibly
  // rounded or policy-adjusted netProfit/profitRate.
  const spProfit = sellpiaProfitInputsAvailable ? sp?.netProfit ?? null : null;
  // 카드 표시값: 셀피아 데이터가 있으면 셀피아 기준으로 통일(로켓/기타몰/합계가 서로 맞음).
  // A measured value never reads 미수집. When the baseline month has no source
  // but the selected range does, the range's own coverage is what to say.
  const revenueRangeBasis = readMetricBasis(effectiveSales, 'rangeKpi.revenue');

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
  const today = baselineSales?.today ?? null;
  // Rates and their changes are range-owned metrics. Do not substitute a
  // monthly profit or ROAS period basis when the selected range lacks its
  // own rate evidence.
  const inventoryHeaderBasis = readFirstMetricBasis(inventoryData, [
    'totalProducts',
    'channelLinkedProducts',
    'channelUnlinkedProducts',
  ]);
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
  const changesBasis = readFirstMetricBasis(inventoryData, ['gradeChanges.total']);
  const newProductsBasis = readFirstMetricBasis(inventoryData, ['newProductCount']);
  const topProductsBasis = readFirstMetricBasis(effectiveSales, [
    'topProducts.revenue',
    'topProducts.netProfit',
  ]);
  const topProducts = effectiveSales?.topProducts ?? [];
  const topProductsLoading = kpiRange === 'month' ? salesBaselineLoading : salesRangeLoading;
  // Top Products reads whichever sales query the selected range uses; its
  // failure is already named and retried by the page-level notice.
  const topProductsHasErr = kpiRange === 'month' ? salesBaselineHasErr : salesRangeHasErr;

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
  const profitCardUsesSellpia = sellpiaHasData && sellpiaProfitInputsAvailable && spProfit !== null;


  // One cell, so one value and one reason for it. The reason is the card's
  // own state, not a sentence assembled from three variants.
  const displayProfit = profitCardUsesSellpia
    ? spProfit
    : (!sellpiaHasData && profitMetricsAvailable) ? kpiProfit : null;

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
  addReadFailure('products-overview', '재고 요약', productOverview.isError, productOverview.error, () => { void productOverview.refetch(); });
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
  addReadFailure('findings', 'AI 발견 · 제안', findingsQuery.isError, findingsQuery.error, () => { void findingsQuery.refetch(); });
  addReadFailure('recent-products', '최근 등록 상품', recentProductsQuery.isError, recentProductsQuery.error, () => { void recentProductsQuery.refetch(); });

  // ── 맨 위 매출 · 광고 카드 ───────────────────────────────────────────────
  // 처음 대시보드의 KPI 두 줄(매출 넷 · 광고 넷)을 카드 두 장으로 세운다. 값은 아래 기간
  // 지표와 같은 변수에서 온다 — 여기서 다시 계산하면 두 자리가 어긋난다. 변화는 아래 칸과
  // 같은 조건에서만 적는다(셀피아 기준 매출은 비교 기준이 달라 변화를 싣지 않는다).
  // 출처 문구(셀피아 · 정산 없음 …)는 아래 칸이 이미 말하므로 되풀이하지 않는다.
  const headlineRevenueChange = !sellpiaHasData && displayRevenue !== null ? revenueChange : null;
  const headlineProfitChange = !sellpiaHasData && displayProfit !== null ? profitChange : null;
  const changeNote = (change: number | null) =>
    change === null ? null : `${change > 0 ? '▲' : change < 0 ? '▼' : '−'} ${Math.abs(change).toFixed(1)}% 이전 대비`;
  const trendOf = (change: number | null) => (change === null || change === 0 ? null : change > 0 ? 'up' : 'down');
  const headlineAdSpend = rkAd ? rkAd.adSpend : adMonthly?.totalAdSpend ?? null;
  const headlinePrevAdSpend = rkAd ? rkAd.prevAdSpend ?? null : adMonthly?.prevTotalAdSpend ?? null;
  const headlineAdCtr = rkAd?.adCtr ?? adCtr;
  const headlinePrevAdCtr = rkAd ? rkAd.prevAdCtr ?? null : adMonthly?.prevCtr ?? null;
  const headlinePrevAdConvRevenue = rkAd ? rkAd.prevAdConvRevenue ?? null : adMonthly?.prevAdRevenue ?? null;
  const prevNote = (prev: number | null, format: (value: number) => string) =>
    prev === null ? null : `이전 ${format(prev)}`;
  // 빈 칸이 왜 비었는지 한 줄. 광고는 서버가 낸 수집 범위(완료한 날/기간 날)를 그대로 옮기고,
  // 셀피아 순이익은 서버가 광고비를 모른다고 낸 경우(adCost null)만 그 까닭을 적는다.
  const adCoverage = rkAd ? rkAd.coverage ?? null : adMonthly?.coverage ?? adKpi?.coverage ?? null;
  const adCoverageNote = adCoverage && adCoverage.completedDays < adCoverage.targetDays
    ? `광고 수집 ${adCoverage.completedDays}/${adCoverage.targetDays}일`
    : null;
  const profitUnknownNote = sellpiaHasData && sp?.adCost === null ? '광고비 수집 전' : null;
  // 매출 카드는 영수증이다 — 매출에서 매입 원가와 광고비를 빼면 순이익(사장님 2026-09-20).
  // 네 값 모두 셀피아 판매현황 읽기가 낸 것이다. 화면은 빼기도 하지 않는다.
  const receiptReady = sellpiaHasData && sp !== undefined && sp !== null;
  const headlineRevenue: HeadlineMetric[] = [
    {
      key: 'revenue', label: `${rangeLabel} 매출`,
      value: displayRevenue === null ? null : formatKRW(displayRevenue), unit: '원',
      note: changeNote(headlineRevenueChange), trend: trendOf(headlineRevenueChange),
    },
    {
      key: 'cost', label: '매입 원가',
      value: receiptReady ? formatKRW(sp.totalCost) : null, unit: '원',
      negative: true,
    },
    {
      key: 'adCost', label: '광고비',
      value: receiptReady && sp.adCost !== null ? formatKRW(sp.adCost) : null, unit: '원',
      negative: true,
    },
    {
      key: 'profit', label: `${rangeLabel} 순이익`,
      value: displayProfit === null ? null : formatKRW(displayProfit), unit: '원',
      suffix: receiptReady && sp.profitRate !== null ? `${sp.profitRate.toFixed(1)}%` : undefined,
      trend: trendOf(headlineProfitChange),
      emphasis: true,
    },
  ];
  const headlineAds: HeadlineMetric[] = [
    {
      key: 'roas', label: 'ROAS',
      value: adRoas === null ? null : adRoas.toFixed(0), unit: '%',
      note: adRoas === null ? adCoverageNote : prevNote(adPrevRoas, (value) => `${value.toFixed(0)}%`),
      trend: trendOf(adRoasChange),
    },
    {
      key: 'ctr', label: '클릭률 (CTR)',
      value: headlineAdCtr === null ? null : headlineAdCtr.toFixed(2), unit: '%',
      note: prevNote(headlinePrevAdCtr, (value) => `${value.toFixed(2)}%`),
    },
    {
      key: 'adConvRevenue', label: '광고 전환매출',
      value: adConvRevenue === null ? null : formatKRW(adConvRevenue), unit: '원',
      note: prevNote(headlinePrevAdConvRevenue, (value) => `${formatKRW(value)}원`),
    },
    {
      key: 'adSpend', label: '광고비',
      value: headlineAdSpend === null ? null : formatKRW(headlineAdSpend), unit: '원',
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
  const headlineMall: HeadlineMetric[] = [
    {
      key: 'mallOrders', label: '오늘 주문',
      value: today?.orders === null || today?.orders === undefined ? null : formatNumber(today.orders), unit: '건',
      // 모르면 왜 모르는지 — 오늘 몫을 아직 안 걷었으면 그 말을 한다.
      note: today?.orders === null || today?.orders === undefined
        ? (orderCollectAgo ? `오늘은 아직 — 마지막 수집 ${orderCollectAgo}` : '아직 수집 전')
        : '몰에서 수집해 들어온 주문',
      href: '/order-collection',
    },
    {
      key: 'mallOrderCollect', label: '주문 수집', value: orderCollectAgo, href: '/order-collection',
    },
    {
      key: 'mallTracking', label: '송장 수집', value: trackingAgo, href: '/order-collection',
    },
    {
      // 서버에 세는 곳이 없다 — 0 으로 찍지 않는다. 세려면 Orders 쪽에 읽기모델이 있어야 한다.
      key: 'mallCancelReturn', label: '취소 · 반품', value: null,
    },
  ];

  const stock = productOverview.data?.summary ?? null;
  // AI 제안 — 이미 발표된 수만 줄로 바꾼다(`lib/ai-suggestions`).
  const aiSuggestions = buildAiSuggestions({
    findings: findingsQuery.data,
    stock: stock
      ? {
        outOfStockCount: stock.inventoryStatusCounts?.out_of_stock ?? null,
        reorderProductCount: stock.reorderProductCount ?? null,
      }
      : undefined,
    unlinkedProducts: channelUnlinkedProducts,
  });
  const count = (value: number | undefined) => (stock && value !== undefined ? formatNumber(value) : null);
  const headlineInventory: HeadlineMetric[] = [
    {
      key: 'stockSoon', label: '품절 임박',
      value: count(stock?.reorderProductCount), unit: '개', note: '지금 발주해야 할 상품',
      alert: (stock?.reorderProductCount ?? 0) > 0, href: '/product-hub?inventoryFocus=reorder',
    },
    {
      key: 'stockOut', label: '품절 상품',
      value: count(stock?.inventoryStatusCounts.out_of_stock), unit: '개',
      alert: (stock?.inventoryStatusCounts.out_of_stock ?? 0) > 0, href: '/product-hub?inventoryFocus=out_of_stock',
    },
    {
      // 상품 관리의 '재고 설정 확인'과 같은 두 무리(설정 필요 · 검토 필요)다.
      key: 'stockMatching', label: '매칭 확인 필요',
      value: stock ? formatNumber(stock.inventoryStatusCounts.configuration_required + stock.inventoryStatusCounts.review_required) : null,
      unit: '개', href: '/product-hub?inventoryFocus=attention',
    },
    {
      // 손익을 셀 근거(기여이익)가 없으면 적자 0 개가 아니라 모름이다.
      key: 'lossProducts', label: '적자 상품',
      value: stock?.contributionOverview ? count(stock.negativeProfitCount) : null, unit: '개',
      note: stock && !stock.contributionOverview ? '손익 근거 없음' : null,
      higherIsWorse: true, href: '/product-hub',
    },
  ];

  const findings = findingsQuery.data;

  // 기간 선택은 대시보드 전체(맨 위 두 장 · 매출)를 다스린다. 그래서 그 모두의 위, 헤더에 선다.
  const periodControls = (
    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
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
            if (sellpiaKnownThrough) {
              const def = sellpiaPeriodRange('month', '', '', sellpiaKnownThrough);
              if (def && !dateFrom) setDateFrom(def.from);
              if (def && !dateTo) setDateTo(def.to);
            }
          }}
          className={cn(
            'flex items-center gap-1 border-l border-slate-200 px-3 py-1 text-[13px] font-semibold transition-colors',
            kpiRange === 'custom' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50',
          )}
        ><Calendar size={12} /> 기간</button>
      </div>
    </div>
  );

  // 수익성 ABC 는 오른쪽 칸, 방금 위에 선다(사장님 2026-09-18).
  const abcPanel = inventoryHasErr ? (
    <DashboardSectionUnavailable label="수익성 ABC" />
  ) : !inventoryData ? (
    <DashboardSectionEmpty label="수익성 ABC" />
  ) : (
    <DashboardGradeCards
      gradeCount={inventoryData.gradeCount}
      classifiedProductCount={inventoryData.classifiedProductCount}
      abcStatusCount={inventoryData.abcStatusCount}
      abcContributionProfit={inventoryData.abcContributionProfit}
      abcFormula={inventoryData.abcFormula}
      gradeChanges={inventoryData.gradeChanges}
      changesMeasured={basisHasValues(changesBasis)}
      newProductCount={basisHasValues(newProductsBasis) ? inventoryData.newProductCount ?? null : null}
      basis={inventoryBasis}
      contributionBasis={contributionBasis}
      refetchReads={async () => { await refetchInventory(); }}
    />
  );

  return (
    <div className="relative w-full space-y-4 pb-12">
      {/* 화면 위쪽만 아주 옅은 보라 — 머리와 첫 줄 카드가 바탕에서 뜬다(사장님 2026-09-20). */}
      <div className="pointer-events-none absolute inset-x-0 -top-6 -z-10 h-72 bg-gradient-to-b from-violet-100/50 via-violet-50/20 to-transparent" aria-hidden />
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Kiditem Foundry</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-[13px] tabular-nums text-slate-500">운영 상품 {inventoryData ? formatNumber(inventoryData.totalProducts) : '—'}</span>
              <span className="text-[13px] tabular-nums text-slate-400">·</span>
              <span className="text-[13px] tabular-nums text-slate-500">
                채널 연결 {channelLinkedProducts === null ? '—' : formatNumber(channelLinkedProducts)}
              </span>
              {channelUnlinkedProducts !== null && channelUnlinkedProducts > 0 && (
                <>
                  <span className="text-[13px] tabular-nums text-slate-400">·</span>
                  <span className="text-[13px] tabular-nums text-amber-700">미연결 {formatNumber(channelUnlinkedProducts)}</span>
                </>
              )}
              <span className="text-[13px] tabular-nums text-slate-400" aria-hidden="true">·</span>
              <span className="text-[13px] tabular-nums text-slate-500" title={observedAtTitle}>관측 {observedAgo}</span>
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={requestReadinessOpen}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1 text-[13px] font-semibold text-white transition-colors hover:bg-violet-700"
            title="쿠팡 Wing/광고 데이터 수집 상태 확인 + 누락분 수집 트리거"
          >
            <Database size={13} /> 데이터 수집
          </button>
          {periodControls}
        </div>
      </div>

      <DashboardReadFailures failures={readFailures} />

      {/* 다섯 칸 한 줄. 아래 줄은 매출 추이 세 칸과 AI 에이전트 두 칸이 나란히 선다
          (사장님 2026-09-20). 바탕으로 묶지 않는다 — 카드만 있다. */}
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
              {abcPanel}

              <DashboardRevenue
                className="min-w-0 min-[1500px]:col-span-3"
                summary={channelSales.summary}
                isLoading={channelSales.isLoading}
                isError={channelSales.isError}
                salesHref={salesAnalysisHref}
              />

              {/* AI 에이전트 — 무엇을 하고 있나, 내가 할 일, 그리고 제안 하나. */}
              <section aria-label="AI 에이전트" className="flex min-w-0 flex-col gap-4 self-start rounded-2xl border border-violet-200 bg-violet-100/60 p-3 min-[1500px]:col-span-2">
                <DashboardAgentSummary findings={findingsQuery.data} />
                {/* 두 칸은 에이전트 일곱 줄 높이(헤더 40 + 7×40 = 320px)에 딱 맞는다. */}
                <div className="grid min-w-0 grid-cols-1 gap-4 lg:h-[22.5rem] lg:grid-cols-2">
                  {agents}
                  <DashboardUrgentQueue findings={findingsQuery.data} findingsLoading={findingsQuery.isLoading} />
                </div>
                <DashboardAiSuggestion
                  className="min-w-0"
                  suggestions={aiSuggestions}
                  basis={readMetricBasis(findings, 'reorderSuggestions')}
                  isLoading={findingsQuery.isLoading}
                  isError={findingsQuery.isError}
                />
              </section>

              {/* 맨 아래 — 매출 상위 상품, 최근 등록된 상품, 방금. */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 min-[1500px]:col-span-5 min-[1500px]:grid-cols-5">
                {topProductsHasErr ? (
                  <DashboardSectionUnavailable label="Top Revenue Products" className="rounded-2xl border border-slate-200/80 bg-white min-[1500px]:col-span-3" />
                ) : topProductsLoading ? (
                  <div className="flex items-center justify-center rounded-2xl border border-slate-200/80 bg-white py-8 text-center text-sm text-slate-500 min-[1500px]:col-span-3">상품 매출 데이터를 불러오는 중입니다.</div>
                ) : !effectiveSales ? (
                  <div className="rounded-2xl border border-slate-200/80 bg-white min-[1500px]:col-span-3"><DashboardSectionEmpty label="Top Revenue Products" /></div>
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


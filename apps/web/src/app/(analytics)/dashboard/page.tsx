'use client';

import { useCallback, useState } from 'react';
import { Calendar, Zap } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DashboardSalesSummarySchema,
  DashboardAdSummarySchema,
  DashboardInventorySummarySchema,
  type TrafficKpi,
} from '@kiditem/shared/dashboard';
import { adTrafficReconciliationStatus } from '@kiditem/shared/advertising';
import { shiftBusinessDateKey } from '@kiditem/shared/common';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';
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
import { DashboardTopProducts } from './components/DashboardTopProducts';
import { DashboardGradeCards } from './components/DashboardGradeCards';
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

export default function Dashboard() {
  const queryClient = useQueryClient();

  const [kpiRange, setKpiRange] = useState<'month' | 'week' | 'day' | 'custom'>('month');
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
  const headlineRevenue: HeadlineMetric[] = [
    {
      key: 'revenue', label: `${rangeLabel} 매출`,
      value: displayRevenue === null ? null : formatKRW(displayRevenue), unit: '원',
      note: changeNote(headlineRevenueChange), trend: trendOf(headlineRevenueChange),
    },
    {
      key: 'profit', label: `${rangeLabel} 순이익`,
      value: displayProfit === null ? null : formatKRW(displayProfit), unit: '원',
      note: changeNote(headlineProfitChange), trend: trendOf(headlineProfitChange),
    },
    {
      key: 'today', label: '오늘 매출',
      value: today?.revenue === null || today?.revenue === undefined ? null : formatKRW(today.revenue), unit: '원',
      note: today?.orders === null || today?.orders === undefined ? null : `주문 ${formatNumber(today.orders)}건`,
    },
    {
      key: 'adRate', label: '광고비율',
      value: kpiAdRate === null ? null : kpiAdRate.toFixed(1), unit: '%',
      note: prevNote(kpiPrevAdRate, (value) => `${value.toFixed(1)}%`),
      trend: trendOf(adRateChange), higherIsWorse: true,
      // 처음 대시보드와 같은 문턱: 광고비율 15% 를 넘으면 붉다.
      alert: kpiAdRate !== null && kpiAdRate > 15,
    },
  ];
  const headlineAds: HeadlineMetric[] = [
    {
      key: 'roas', label: 'ROAS',
      value: adRoas === null ? null : adRoas.toFixed(0), unit: '%',
      note: prevNote(adPrevRoas, (value) => `${value.toFixed(0)}%`), trend: trendOf(adRoasChange),
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
        <div className="flex shrink-0 items-center gap-2">
          {periodControls}
        </div>
      </div>

      <DashboardReadFailures failures={readFailures} />

      {/* 바깥 두 칸 — 왼쪽은 매출 · 광고와 매출 추이, 오른쪽은 에이전트 실시간.
          겹치던 것(기간 지표 = 매출 카드, 광고 성과 = 광고 카드, 알림 = 긴급)은 걷었다(사장님 2026-09-18). */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="min-w-0 space-y-3">
          <DashboardHeadlineCards revenue={headlineRevenue} ads={headlineAds} salesHref={salesAnalysisHref} />
          <DashboardRevenue
            summary={channelSales.summary}
            isLoading={channelSales.isLoading}
            isError={channelSales.isError}
            salesHref={salesAnalysisHref}
          />
          {/* Top 상품과 A/B/C 현황을 한 줄에 — 무엇이 잘 팔리는지와 그 등급을 나란히 본다(사장님 2026-09-18). */}
          <div className="grid grid-cols-1 items-start gap-3 2xl:grid-cols-5">
            <div className="min-w-0 2xl:col-span-3">
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
            <div className="min-w-0 2xl:col-span-2">
              {inventoryHasErr ? (
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
                  basis={inventoryBasis}
                  contributionBasis={contributionBasis}
                  refetchReads={async () => { await refetchInventory(); }}
                />
              )}
            </div>
          </div>
        </div>
        <DashboardAgentStatus />
      </div>

    </div>
  );
}


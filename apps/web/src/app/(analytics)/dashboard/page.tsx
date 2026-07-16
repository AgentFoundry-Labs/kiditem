'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { toast } from 'sonner';
import {
  DashboardSalesSummarySchema,
  DashboardAdSummarySchema,
  DashboardInventorySummarySchema,
  DashboardTrendItemSchema,
} from '@kiditem/shared/dashboard';
import { ActionTaskListSchema } from '@kiditem/shared/action-task';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { detectExtensionId } from '@/lib/extension-bridge';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { runReadinessExtensionCollection } from '@/components/readiness/readiness-extension-collection';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber, formatDateTime } from '@/lib/utils';
import { friendlyError } from '@/lib/api-error';
import ReadinessModal from '@/components/ReadinessModal';
import { DashboardChartPanel } from './components/DashboardChartPanel';
import { MetricCard, UnavailableMetricCard } from './components/DashboardMetricCard';
import { DashboardProfitDetailModal } from './components/DashboardProfitDetailModal';
import { DashboardSectionError } from './components/DashboardSectionError';
import { DashboardSidePanel } from './components/DashboardSidePanel';
import { DashboardTopProducts } from './components/DashboardTopProducts';

export default function Dashboard() {
  const queryClient = useQueryClient();

  const [showProfitDetail, setShowProfitDetail] = useState(false);
  const [kpiRange, setKpiRange] = useState<'month' | 'week' | 'day' | 'custom'>('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showReadiness, setShowReadiness] = useState(false);

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
  }, [dateFrom, dateTo, queryClient]);

  // For "displayed KPIs" — prefer range, fall back to baseline
  const effectiveSales = (kpiRange === 'month' && !dateFrom && !dateTo) ? salesBaseline : (salesRange ?? salesBaseline);
  const effectiveAd = (kpiRange === 'month' && !dateFrom && !dateTo) ? adBaseline : (adRange ?? adBaseline);

  const { data: actionTasks = [] } = useQuery({
    queryKey: queryKeys.actionTasks.list(),
    queryFn: () => apiClient.getParsed('/api/action-tasks', ActionTaskListSchema),
    refetchInterval: 60_000,
  });

  const aiActions = actionTasks.filter(t => t.type === 'ai');

  // 트래픽 데이터가 없으면 Wing 매출분석 수집을 백그라운드로 요청한다.
  // Drive replay 또는 Wing 동기화 데이터가 이미 있으면 트리거하지 않는다.
  useEffect(() => {
    if (!salesBaseline?.trafficKpi?.needsScrape) return;
    const source = salesBaseline?.effectivePeriod?.revenueSource;
    if (source === 'wing' || source === 'mixed' || source === 'orders' || source === 'rocket' || source === 'wing_rocket') return;
    const COOLDOWN_KEY = 'kiditem_wing_scrape_triggered';
    const lastTrigger = safeStorageGet('local', COOLDOWN_KEY);
    if (lastTrigger && Date.now() - Number(lastTrigger) < 30 * 60 * 1000) return; // 30분 쿨다운
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().slice(0, 10);
    const wingUrl = `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${monthStart}&end_date=${today}`;
    safeStorageSet('local', COOLDOWN_KEY, String(Date.now()));
    void (async () => {
      const extensionId = await detectExtensionId();
      if (!extensionId) {
        await recordMissingBrowserCollection('dashboard.wing_sales', {
          trigger: 'dashboard_traffic',
        });
        toast.warning('Wing 트래픽 수집 익스텐션을 찾을 수 없습니다.');
        return;
      }
      const session = await runReadinessExtensionCollection({
        check: {
          key: 'wing_sales',
          label: 'Wing 월간 매출·트래픽',
          status: 'missing',
          detail: '현재 월 트래픽 데이터 수집',
          lastSyncedAt: null,
          count: null,
          collector: 'extension',
          collectEndpoint: null,
          scrapeUrls: [wingUrl],
          referenceDate: today,
          expectedDates: null,
          missingDates: null,
        },
        producer: 'dashboard.wing_sales',
        extensionId,
        runId: crypto.randomUUID(),
      });
      if (session.status === 'succeeded') {
        toast.success('Wing 매출·트래픽 수집이 완료되었습니다.');
        await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      } else if (session.status === 'attention_required') {
        toast.warning(session.attention?.message ?? 'Wing 확인이 필요합니다.');
      }
    })().catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Wing 트래픽 수집 실패');
    });
  }, [
    queryClient,
    salesBaseline?.trafficKpi?.needsScrape,
    salesBaseline?.effectivePeriod?.revenueSource,
  ]);

  // Gate initial render on inventoryData (totalProducts in header blocks layout)
  const loading = inventoryLoading || salesBaselineLoading || adBaselineLoading;
  if (loading) return <PageSkeleton variant="dashboard" />;

  if (!inventoryData || !salesBaseline || !adBaseline) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500 text-sm">대시보드 데이터를 불러오는데 실패했습니다.</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">Retry</button>
      </div>
    );
  }

  const rangeLabelMap: Record<string, string> = { month: '월', week: '주', day: '일', custom: '기간' };
  // Range label derived from local state (not server)
  const rangeLabel = kpiRange !== 'month' ? (rangeLabelMap[kpiRange] ?? '월') : '월';

  // 서버가 effectivePeriod.revenueSource 에 맞춰 monthly/rangeKpi 를 이미
  // (Order 또는 Wing daily-fact) 출처로 채워준다. UI 에서는 source 별 분기 없이
  // rangeKpi 우선, baseline 폴백.
  const rk = effectiveSales?.rangeKpi;
  const rkAd = effectiveAd?.rangeKpi;
  // 매출은 server 가 source 별 fallback 을 이미 마쳤으니 그대로 사용.
  const kpiRevenue = rk?.revenue ?? salesBaseline.monthly.revenue;
  // 순이익은 정산 데이터 없을 때(Wing fallback) 서버가 0 을 반환한다 — UI 가
  // `profitMetricsAvailable` 로 카드를 placeholder 로 바꿔 0 이 노출되지 않게 한다.
  const kpiProfit = rk?.profit ?? salesBaseline.monthly.profit;
  const kpiPrevRevenue = rk?.prevRevenue ?? salesBaseline.monthly.prevRevenue;
  const kpiPrevProfit = rk?.prevProfit ?? salesBaseline.monthly.prevProfit;
  const revenueChange = rk?.revenueChange ?? salesBaseline.monthly.revenueChange ?? 0;
  const profitChange = rk?.profitChange ?? salesBaseline.monthly.profitChange ?? 0;
  const profitRate = rk?.profitRate ?? (salesBaseline.monthly.revenue > 0 ? (salesBaseline.monthly.profit / salesBaseline.monthly.revenue) * 100 : 0);
  const prevProfitRate = rk?.prevProfitRate ?? (salesBaseline.monthly.prevRevenue > 0 ? (salesBaseline.monthly.prevProfit / salesBaseline.monthly.prevRevenue) * 100 : 0);
  const kpiAdRate = rkAd?.adRate ?? salesBaseline.monthly.adRate;
  const kpiPrevAdRate = rkAd?.prevAdRate ?? salesBaseline.monthly.prevAdRate;
  // 윙/로켓 분리 표시 — headline(kpiRevenue)은 합산, 아래 라인에서 채널별로 분해.
  const wingRevenue = effectiveSales?.monthly?.wingRevenue ?? salesBaseline.monthly.wingRevenue ?? kpiRevenue;
  const rocketRevenue = effectiveSales?.monthly?.rocketRevenue ?? salesBaseline.monthly.rocketRevenue ?? 0;
  const adRateChange = rkAd?.adRateChange ?? (kpiPrevAdRate > 0 ? kpiAdRate - kpiPrevAdRate : 0);

  const revenueGoal = Math.max(kpiPrevRevenue * 1.15, 1000000);
  const profitGoal = Math.max(kpiPrevProfit * 1.15, 100000);
  const revenueAchieve = revenueGoal > 0 ? Math.min(Math.round((kpiRevenue / revenueGoal) * 100), 999) : 0;
  const revenuePct = revenueGoal > 0 ? Math.min((kpiRevenue / revenueGoal) * 100, 100) : 0;
  const profitAchieve = profitGoal > 0 ? Math.min(Math.round((kpiProfit / profitGoal) * 100), 999) : 0;
  const profitPct = profitGoal > 0 ? Math.min((kpiProfit / profitGoal) * 100, 100) : 0;

  // 트렌드 차트용 데이터
  const dailyTrend = trendData.map(d => ({
    date: d.date,
    revenue: d.revenue,
    profit: d.profit,
    adCost: d.adCost,
    profitRate: d.revenue > 0 ? Math.round((d.profit / d.revenue) * 1000) / 10 : 0,
    adRate: d.revenue > 0 ? Math.round((d.adCost / d.revenue) * 1000) / 10 : 0,
  }));

  // 데이터 출처 라벨 — Drive replay / Wing / 쿠팡 광고 / 주문 기준 등을 한 곳에서 결정
  const effectivePeriod = effectiveSales?.effectivePeriod ?? salesBaseline.effectivePeriod;
  const periodLabel = effectivePeriod
    ? `${effectivePeriod.year}년 ${effectivePeriod.month}월`
    : new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
  const periodShifted = effectivePeriod?.shifted ?? false;
  const latestDataDate = effectivePeriod?.latestDataDate ?? null;
  const revenueSource = effectivePeriod?.revenueSource ?? 'orders';
  const adSource = effectivePeriod?.adSource ?? adBaseline.effectivePeriod?.adSource ?? 'orders';
  const revenueSourceLabel =
    revenueSource === 'wing' ? 'Wing 매출 기준'
    : revenueSource === 'rocket' ? '로켓 발주 기준'
    : revenueSource === 'wing_rocket' ? 'Wing + 로켓'
    : revenueSource === 'mixed' && rocketRevenue > 0 && wingRevenue > 0 ? '주문 + Wing + 로켓'
    : revenueSource === 'mixed' && rocketRevenue > 0 ? '주문 + 로켓'
    : revenueSource === 'mixed' ? '주문 + Wing'
    : revenueSource === 'orders' ? '주문 기준'
    : '데이터 대기';
  const adSourceLabel =
    adSource === 'coupang_ads' ? '쿠팡 광고 기준'
    : adSource === 'mixed' ? '쿠팡 광고 + 주문'
    : adSource === 'orders' ? '주문 기준'
    : '데이터 대기';
  // 정산 데이터가 있어야 산출 가능한 지표 (순이익/이익률/매입가/수수료/배송비) 는
  // Wing/Drive 단독 데이터로는 신뢰할 수 없다. 그 카드는 "—" 로 표시한다.
  const profitMetricsAvailable = revenueSource === 'orders' || revenueSource === 'mixed';
  // 광고비/매출 비율은 두 sources 모두 실측값이 있으면 정의가 깨끗.
  const adRateAvailable = (kpiAdRate ?? 0) > 0 || profitMetricsAvailable;
  const channelLinkedProducts = inventoryData.channelLinkedProducts ?? 0;
  const channelUnlinkedProducts = inventoryData.channelUnlinkedProducts ?? Math.max(inventoryData.totalProducts - channelLinkedProducts, 0);

  return (
    <div className="space-y-4 w-full pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Kiditem Foundry</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono text-slate-400">카탈로그 전체 {formatNumber(inventoryData.totalProducts)}</span>
              <span className="text-xs font-mono text-slate-400">·</span>
              <span className="text-xs font-mono text-slate-400">채널 연결 {formatNumber(channelLinkedProducts)}</span>
              {channelUnlinkedProducts > 0 && (
                <>
                  <span className="text-xs font-mono text-slate-400">·</span>
                  <span className="text-xs font-mono text-amber-500">미연결 {formatNumber(channelUnlinkedProducts)}</span>
                </>
              )}
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowReadiness(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
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
              onClick={() => setKpiRange('custom')}
              className={cn('px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-1', kpiRange === 'custom' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400')}
            ><Calendar size={13} /> 기간</button>
          </div>
          {kpiRange === 'custom' ? (
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-200" />
              <span className="text-xs text-slate-400">~</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-200" />
              <button onClick={applyCustomRange} disabled={!dateFrom || !dateTo}
                className="px-3 py-1.5 rounded-lg text-white text-sm font-semibold bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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

      {/* KPI 카드 — 월 매출 + 월 순이익 + 이익률 + 광고비율 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ alignItems: 'stretch' }}>
        {/* 월 매출 */}
        <div className="lg:row-span-2 rounded-2xl px-5 py-3 flex flex-col justify-between bg-white border border-slate-100 shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={18} className="text-blue-600" />
              <span className="text-sm font-bold uppercase tracking-wider text-blue-600">{rangeLabel} 매출</span>
              <span className={cn('flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono', revenueChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                {revenueChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(1)}%</span>
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 mb-1.5">{revenueSourceLabel}</div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-blue-600">{formatKRW(kpiRevenue)}</span>
              <span className="text-lg font-semibold text-blue-600/60">원</span>
            </div>
            <div className="text-sm text-slate-500">이전 {formatKRW(kpiPrevRevenue)}원</div>
            {(wingRevenue > 0 || rocketRevenue > 0) && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  href="/sales-analysis?tab=wing-daily"
                  className="rounded-lg bg-blue-50/70 px-2.5 py-1.5 transition-colors hover:bg-blue-100"
                >
                  <div className="text-[11px] font-medium text-blue-500">쿠팡 윙</div>
                  <div className="text-sm font-bold tabular-nums text-blue-700">{formatKRW(wingRevenue)}원</div>
                </Link>
                <Link
                  href="/sales-analysis?tab=rocket-daily"
                  className="rounded-lg bg-purple-50 px-2.5 py-1.5 transition-colors hover:bg-purple-100"
                >
                  <div className="text-[11px] font-medium text-purple-600">
                    쿠팡 로켓 <span className="text-[9px] text-purple-400">→ 분석</span>
                  </div>
                  <div className="text-sm font-bold tabular-nums text-purple-700">{formatKRW(rocketRevenue)}원</div>
                </Link>
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-blue-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-blue-400">목표 {formatKRW(revenueGoal)}원</span>
                <span className={cn('text-[13px] font-bold tabular-nums', revenueAchieve >= 100 ? 'text-emerald-600' : 'text-blue-600')}>{revenueAchieve}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-blue-50">
                <div className="h-full rounded-full transition-all duration-500 bg-blue-600" style={{ width: `${revenuePct}%` }} />
              </div>
              {revenueAchieve >= 100
                ? <div className="text-[11px] mt-1 font-semibold text-blue-600">목표 달성!</div>
                : <div className="text-[11px] mt-1 text-blue-400">{formatKRW(revenueGoal - kpiRevenue)}원 남음</div>
              }
            </div>
          </div>
          <div className="mt-2 pt-2 space-y-1.5 border-t border-blue-100">
            {/* 광고외매출 = Wing 매출 - 쿠팡 광고전환매출 — 두 source 가 같은 정의(매출)로 측정될 때만 의미.
                Order 기반(주문기준)에서는 동일 source 내 derivation 이라 항상 표시. Wing 단독에서는 측정원이 다르니 숨김. */}
            {profitMetricsAvailable && (kpiRevenue - (rkAd?.adConvRevenue ?? 0)) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">광고외매출</span>
                <span className="font-bold tabular-nums text-slate-900">{formatKRW(kpiRevenue - (rkAd?.adConvRevenue ?? 0))}원</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">광고전환매출 <span className="text-[10px] text-slate-400">쿠팡</span></span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW(rkAd?.adConvRevenue ?? adBaseline.monthly.adRevenue)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">주문</span>
              <span className="font-bold tabular-nums text-slate-900">{formatNumber(effectiveSales?.trafficKpi?.orders ?? salesBaseline.today.orders)}건</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">판매량</span>
              <span className="font-bold tabular-nums text-slate-900">{formatNumber(effectiveSales?.trafficKpi?.salesQty ?? 0)}개</span>
            </div>
            {(effectiveSales?.trafficKpi?.visitors ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">방문자</span>
                <span className="font-bold tabular-nums text-slate-900">{formatNumber(effectiveSales?.trafficKpi?.visitors ?? 0)}명</span>
              </div>
            )}
            {(effectiveSales?.trafficKpi?.views ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">조회</span>
                <span className="font-bold tabular-nums text-slate-900">{formatNumber(effectiveSales?.trafficKpi?.views ?? 0)}회</span>
              </div>
            )}
            {salesBaseline.lastSyncAt && (
              <div className="text-[11px] text-slate-400 mt-1">
                Wing 마지막 동기화 · {formatDateTime(salesBaseline.lastSyncAt)}
                {(Date.now() - new Date(salesBaseline.lastSyncAt).getTime()) > 86400000 && (
                  <span className="text-amber-500 ml-1">⚠ 24시간 이상 미동기화</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 월 순이익 — 정합성 결여(Wing 단독)면 placeholder, 그 외엔 기존 breakdown */}
        {profitMetricsAvailable ? (
          <div
            className="lg:row-span-2 rounded-2xl px-5 py-3 flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow bg-white border border-slate-100 shadow-sm"
            onClick={() => setShowProfitDetail(true)}
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={18} className="text-emerald-600" />
                <span className="text-sm font-bold uppercase tracking-wider text-emerald-600">{rangeLabel} 순이익</span>
                <span className={cn('flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono', profitChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                  {profitChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  <span>{profitChange > 0 ? '+' : ''}{profitChange.toFixed(1)}%</span>
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 mb-1.5">주문 기준</div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-emerald-600">{formatKRW(kpiProfit)}</span>
                <span className="text-lg font-semibold text-emerald-600/60">원</span>
              </div>
              <div className="text-sm text-slate-500">이전 {formatKRW(kpiPrevProfit)}원</div>
              <div className="mt-2 pt-2 border-t border-emerald-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-emerald-400">목표 {formatKRW(profitGoal)}원</span>
                  <span className={cn('text-[13px] font-bold tabular-nums', profitAchieve >= 100 ? 'text-emerald-600' : 'text-emerald-700')}>{profitAchieve}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-emerald-50">
                  <div className="h-full rounded-full transition-all duration-500 bg-emerald-600" style={{ width: `${profitPct}%` }} />
                </div>
                {profitAchieve >= 100
                  ? <div className="text-[11px] mt-1 font-semibold text-emerald-600">목표 달성!</div>
                  : <div className="text-[11px] mt-1 text-emerald-400">{formatKRW(profitGoal - kpiProfit)}원 남음</div>
                }
              </div>
            </div>
            <div className="mt-2 pt-2 space-y-1.5 border-t border-emerald-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">집행광고비</span>
                <span className="font-bold tabular-nums text-slate-900">{formatKRW(rkAd?.adSpend ?? adBaseline.monthly.totalAdSpend)}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">수수료</span>
                <span className="font-bold tabular-nums text-slate-900">{formatKRW(salesBaseline.profitDetail?.commission ?? 0)}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">배송비</span>
                <span className="font-bold tabular-nums text-slate-900">{formatKRW(salesBaseline.profitDetail?.shippingCost ?? 0)}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">매입가</span>
                <span className="font-bold tabular-nums text-slate-900">{formatKRW(salesBaseline.profitDetail?.costOfGoods ?? 0)}원</span>
              </div>
            </div>
          </div>
        ) : (
          // Wing/Drive 단독 — 매입가/수수료/배송비 source 가 없어 순이익 산출 불가.
          // 광고비는 쿠팡 광고에서 측정값으로 표시.
          <div className="lg:row-span-2 rounded-2xl px-5 py-3 flex flex-col justify-between bg-white border border-slate-100 shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={18} className="text-emerald-600" />
                <span className="text-sm font-bold uppercase tracking-wider text-emerald-600">{rangeLabel} 순이익</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 mb-1.5">정산 데이터 없음</div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-slate-300">—</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Wing/Drive 데이터에는 매입가·수수료·배송비가 없어 순이익을 산출할 수 없습니다.
              </div>
            </div>
            <div className="mt-2 pt-2 space-y-1.5 border-t border-emerald-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">집행광고비 <span className="text-[10px] text-slate-400">쿠팡</span></span>
                <span className="font-bold tabular-nums text-slate-900">{formatKRW(rkAd?.adSpend ?? adBaseline.monthly.totalAdSpend)}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">수수료</span>
                <span className="font-mono tabular-nums text-slate-300">—</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">배송비</span>
                <span className="font-mono tabular-nums text-slate-300">—</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">매입가</span>
                <span className="font-mono tabular-nums text-slate-300">—</span>
              </div>
            </div>
          </div>
        )}

        {/* 이익률 — 순이익을 못 구하면 정의가 없으니 placeholder 로 */}
        {profitMetricsAvailable ? (
          <MetricCard
            label="이익률"
            value={profitRate.toFixed(1)}
            unit="%"
            change={profitRate - prevProfitRate}
            prevLabel={`이전 ${prevProfitRate.toFixed(1)}%`}
            accentColor="#733de5"
            icon={Target}
            goal={15}
            current={profitRate}
            goalUnit="%"
            goalLabel="목표 15%"
          />
        ) : (
          <UnavailableMetricCard
            label="이익률"
            icon={Target}
            accentColor="#733de5"
            note="정산 데이터 필요"
          />
        )}

        {/* 광고비율 */}
        <MetricCard
          label="광고비율"
          value={kpiAdRate.toFixed(1)}
          unit="%"
          change={-adRateChange}
          prevLabel={`이전 ${kpiPrevAdRate.toFixed(1)}%`}
          accentColor="#dc2626"
          icon={Megaphone}
          invertColor
          goal={10}
          current={kpiAdRate}
          goalUnit="%"
          goalLabel="목표 10% 이하"
          invertGoal
        />

        {/* 구매전환율 */}
        <MetricCard
          label="구매전환율"
          value={(effectiveSales?.trafficKpi?.conversionRate ?? 0).toFixed(1)}
          unit="%"
          change={0}
          prevLabel=""
          accentColor="#0284c7"
          icon={ShoppingCart}
          goal={5}
          current={effectiveSales?.trafficKpi?.conversionRate ?? 0}
          goalUnit="%"
          goalLabel="목표 5%"
        />

        {/* 광고수익률(ROAS) */}
        <MetricCard
          label="광고수익률"
          value={(rkAd?.adRoas ?? adBaseline.monthly.roas).toFixed(0)}
          unit="%"
          change={(rkAd?.adRoas ?? adBaseline.monthly.roas) - (rkAd?.prevAdRoas ?? adBaseline.monthly.prevRoas)}
          prevLabel={`이전 ${(rkAd?.prevAdRoas ?? adBaseline.monthly.prevRoas).toFixed(0)}%`}
          accentColor="#059669"
          icon={BarChart3}
          goal={400}
          current={rkAd?.adRoas ?? adBaseline.monthly.roas}
          goalUnit="%"
          goalLabel="목표 400%"
        />
      </div>


      {/* 차트 + 사이드패널 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 overflow-hidden" style={{ height: 620 }}>
        <div className="lg:col-span-3 h-full">
          {trendHasErr ? (
            <DashboardSectionError msg={friendlyError(trendError) ?? undefined} onRetry={refetchTrend} />
          ) : (
            <DashboardChartPanel
              dailyTrend={dailyTrend}
              aiActions={aiActions}
              industryBenchmark={adBaseline.industryBenchmark}
            />
          )}
        </div>
        {inventoryHasErr ? (
          <DashboardSectionError msg={friendlyError(inventoryError) ?? undefined} onRetry={refetchInventory} />
        ) : (
          <DashboardSidePanel
            alerts={inventoryData.alerts}
            queryClient={queryClient}
          />
        )}
      </div>

      {/* 등급 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map(g => {
          const count = inventoryData.gradeCount[g] ?? 0;
          const total = channelLinkedProducts;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barColor = g === 'C' ? 'bg-red-500' : 'bg-purple-600';
          const labelMap = { A: '핵심상품', B: '성장상품', C: '정리대상' };
          return (
            <Link key={g} href={g === 'A' ? '/product-hub?tab=core' : g === 'C' ? '/product-hub?tab=cleanup' : '/product-hub'} className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-slate-900">{g}등급</span>
                <span className="text-xs text-slate-400">{labelMap[g]}</span>
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-slate-900">{count}<span className="text-sm ml-0.5">개</span></div>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden bg-slate-100">
                <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs mt-1 text-slate-400">평가대상 중 {pct}%</div>
            </Link>
          );
        })}
      </div>

      {/* 경고 카드 */}
      {inventoryHasErr ? (
        <DashboardSectionError msg={friendlyError(inventoryError) ?? undefined} onRetry={refetchInventory} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Link href="/product-hub?tab=cleanup" className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
            <div className="text-sm font-bold mb-1 text-slate-900">적자 상품</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900">{inventoryData.warnings.minusProducts}<span className="text-sm ml-0.5">개</span></div>
            <div className="text-xs mt-1 text-slate-400">이익률 마이너스</div>
          </Link>
          <Link href="/product-hub?tab=cleanup" className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
            <div className="text-sm font-bold mb-1 text-slate-900">저이익 상품</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900">{inventoryData.warnings.lowProfitProducts}<span className="text-sm ml-0.5">개</span></div>
            <div className="text-xs mt-1 text-slate-400">이익률 3% 이하</div>
          </Link>
          <Link href="/ad-ops" className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
            <div className="text-sm font-bold mb-1 text-slate-900">광고비 초과</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900">{inventoryData.warnings.highAdProducts}<span className="text-sm ml-0.5">개</span></div>
            <div className="text-xs mt-1 text-slate-400">광고비율 15% 초과</div>
          </Link>
          <Link href="/stock-ops?tab=sellpia-zero" className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
            <div className="text-sm font-bold mb-1 text-slate-900">셀피아 재고 0</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900">
              <span data-warning-count="out-of-stock">{inventoryData.warnings.outOfStockSkus}</span>
              <span className="text-sm ml-0.5">건</span>
            </div>
            <div className="text-xs mt-1 text-slate-400">최신 셀피아 스냅샷</div>
          </Link>
          <Link href="/product-hub/matching?status=needs_review" className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
            <div className="text-sm font-bold mb-1 text-slate-900">매칭 확인 필요</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-900">
              <span data-warning-count="mapping-attention">{inventoryData.warnings.mappingAttentionSkus}</span>
              <span className="text-sm ml-0.5">건</span>
            </div>
            <div className="text-xs mt-1 text-slate-400">미매칭·검토 필요 채널 SKU</div>
          </Link>
        </div>
      )}

      {/* Top Products */}
      {salesBaselineHasErr ? (
        <DashboardSectionError msg={friendlyError(salesBaselineError) ?? undefined} onRetry={refetchSalesBaseline} />
      ) : (
        <DashboardTopProducts products={salesBaseline.topProducts} />
      )}


      {/* 순이익 상세 모달 */}
      {showProfitDetail && (
        <DashboardProfitDetailModal
          salesBaseline={salesBaseline}
          adBaseline={adBaseline}
          onClose={() => setShowProfitDetail(false)}
        />
      )}
      <ReadinessModal open={showReadiness} onClose={() => setShowReadiness(false)} />
    </div>
  );
}

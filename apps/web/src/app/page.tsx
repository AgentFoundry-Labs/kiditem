'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Minus,
  AlertTriangle, MinusCircle, Megaphone, Truck,
  Zap, Play, Loader2,
  BarChart3, Target, ShieldCheck, Wallet,
  ShoppingCart, X, Calendar,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';

const DashboardCharts = dynamic(
  () => import('./components/DashboardCharts').then(mod => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="h-[320px] flex items-center justify-center text-sm text-slate-300">차트 로딩 중...</div> },
);
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber, formatPercent, formatDateTime, getGradeColor, getProfitColor } from '@/lib/utils';
import AgentFace from '@/components/AgentFace';
import type { DashboardSummary, DashboardTrendItem } from '@kiditem/shared';
import type { ActionTask } from '@kiditem/shared';


function alertIcon(type: string) {
  if (type === 'minus_product') return <MinusCircle size={14} className="text-red-500 shrink-0" />;
  if (type === 'ad_high') return <Megaphone size={14} className="text-amber-500 shrink-0" />;
  if (type === 'stock_low') return <Truck size={14} className="text-blue-500 shrink-0" />;
  return <AlertTriangle size={14} className="text-slate-400 shrink-0" />;
}

export default function Dashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showProfitDetail, setShowProfitDetail] = useState(false);
  const [kpiRange, setKpiRange] = useState<'month' | 'week' | 'day' | 'custom'>('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading: loading } = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: () => apiClient.get<DashboardSummary>('/api/dashboard'),
    refetchInterval: 60_000,
  });

  const { data: trendData = [] } = useQuery({
    queryKey: queryKeys.dashboard.trend('30d'),
    queryFn: () => apiClient.get<DashboardTrendItem[]>('/api/dashboard/trend?range=30d'),
    refetchInterval: 60_000,
  });

  const rangeQueryKey = kpiRange === 'custom'
    ? [...queryKeys.dashboard.all, 'range', 'custom', dateFrom, dateTo]
    : [...queryKeys.dashboard.all, 'range', kpiRange];

  const { data: rangeData } = useQuery({
    queryKey: rangeQueryKey,
    queryFn: () => kpiRange === 'custom' && dateFrom && dateTo
      ? apiClient.get<DashboardSummary>(`/api/dashboard?range=custom&from=${dateFrom}&to=${dateTo}`)
      : apiClient.get<DashboardSummary>(`/api/dashboard?range=${kpiRange}`),
    enabled: kpiRange === 'custom' ? (!!dateFrom && !!dateTo) : kpiRange !== 'month',
    refetchInterval: 60_000,
  });

  const applyCustomRange = useCallback(() => {
    if (!dateFrom || !dateTo) return;
    queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboard.all, 'range', 'custom', dateFrom, dateTo] });
  }, [dateFrom, dateTo, queryClient]);

  const displayData = rangeData ?? data;

  const { data: actionTasks = [] } = useQuery({
    queryKey: queryKeys.actionTasks.list(),
    queryFn: () => apiClient.get<ActionTask[]>('/api/action-tasks'),
    refetchInterval: 60_000,
  });

  const { data: pipelineStats } = useQuery({
    queryKey: queryKeys.products.pipelineStats(),
    queryFn: () => apiClient.get<{ gradeA: number; gradeB: number; gradeC: number; total: number }>('/api/products/pipeline-stats'),
    refetchInterval: 60_000,
  });

  const aiActions = actionTasks.filter(t => t.type === 'ai');

  // 트래픽 데이터가 없으면 Wing 매출분석 페이지를 자동으로 열어 익스텐션 동기화 유도
  useEffect(() => {
    if (!data?.trafficKpi?.needsScrape) return;
    const COOLDOWN_KEY = 'kiditem_wing_scrape_triggered';
    const lastTrigger = localStorage.getItem(COOLDOWN_KEY);
    if (lastTrigger && Date.now() - Number(lastTrigger) < 30 * 60 * 1000) return; // 30분 쿨다운
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().slice(0, 10);
    const wingUrl = `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${monthStart}&end_date=${today}`;
    window.open(wingUrl, '_blank');
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    toast.info('Wing 매출분석 페이지를 열어 데이터를 수집합니다. 잠시 후 새로고침하세요.', { duration: 8000 });
  }, [data?.trafficKpi?.needsScrape]);

  if (loading) return <PageSkeleton variant="dashboard" />;

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500 text-sm">대시보드 데이터를 불러오는데 실패했습니다.</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">Retry</button>
      </div>
    );
  }

  const s = (displayData ?? data).summary;
  const rk = (displayData ?? data).rangeKpi;
  const rangeLabelMap: Record<string, string> = { month: '월', week: '주', day: '일', custom: '기간' };
  const rangeLabel = rk ? rangeLabelMap[rk.range] ?? '월' : '월';

  const trafficKpi = (displayData ?? data).trafficKpi;
  // trafficKpi(Wing traffic_stats 기반) 우선 사용 — rangeKpi(Order 기반)는 주문 확정분만
  // 포함해 Wing 매출 대비 적게 잡힘. 월/주/일 전부 동일 규칙, trafficKpi 없으면 rangeKpi 폴백.
  const useTrafficSource = !!trafficKpi && (trafficKpi.revenue ?? 0) > 0;

  // KPI: rangeKpi 서버 값 우선, 없으면 summary 폴백 (주/일은 trafficKpi 폴백)
  const kpiRevenue = useTrafficSource ? (trafficKpi?.revenue ?? 0) : (rk?.revenue ?? s.monthlyRevenue);
  const kpiProfit = useTrafficSource ? (trafficKpi?.netProfit ?? 0) : (rk?.profit ?? s.monthlyProfit);
  const kpiPrevRevenue = rk?.prevRevenue ?? s.prevMonthlyRevenue;
  const kpiPrevProfit = rk?.prevProfit ?? s.prevMonthlyProfit;
  const revenueChange = useTrafficSource ? 0 : (rk?.revenueChange ?? (kpiPrevRevenue > 0 ? ((kpiRevenue - kpiPrevRevenue) / kpiPrevRevenue) * 100 : 0));
  const profitChange = useTrafficSource ? 0 : (rk?.profitChange ?? (kpiPrevProfit > 0 ? ((kpiProfit - kpiPrevProfit) / kpiPrevProfit) * 100 : 0));
  const profitRate = useTrafficSource ? (trafficKpi?.profitRate ?? 0) : (rk?.profitRate ?? (s.monthlyRevenue > 0 ? (s.monthlyProfit / s.monthlyRevenue) * 100 : 0));
  const prevProfitRate = rk?.prevProfitRate ?? (s.prevMonthlyRevenue > 0 ? (s.prevMonthlyProfit / s.prevMonthlyRevenue) * 100 : 0);
  const kpiAdRate = rk?.adRate ?? s.adRate;
  const kpiPrevAdRate = rk?.prevAdRate ?? s.prevAdRate;
  const adRateChange = rk?.adRateChange ?? (kpiPrevAdRate > 0 ? kpiAdRate - kpiPrevAdRate : 0);

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
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs font-mono text-slate-400">{s.totalProducts} products</span>
              <span className="text-xs font-mono text-slate-400">|</span>
              <span className="text-xs font-mono text-slate-400">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={18} className="text-blue-600" />
              <span className="text-sm font-bold uppercase tracking-wider text-blue-600">{rangeLabel} 매출</span>
              <span className={cn('flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono', revenueChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                {revenueChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(1)}%</span>
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-blue-600">{formatKRW(kpiRevenue)}</span>
              <span className="text-lg font-semibold text-blue-600/60">원</span>
            </div>
            <div className="text-sm text-slate-500">이전 {formatKRW(kpiPrevRevenue)}원</div>
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
            {(kpiRevenue - (rk?.adConvRevenue ?? 0)) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">광고외매출</span>
                <span className="font-bold tabular-nums text-slate-900">{formatKRW(kpiRevenue - (rk?.adConvRevenue ?? 0))}원</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">광고전환매출</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW(rk?.adConvRevenue ?? s.adRevenue)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">주문</span>
              <span className="font-bold tabular-nums text-slate-900">{formatNumber((displayData ?? data).trafficKpi?.orders ?? s.todayOrders)}건</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">판매량</span>
              <span className="font-bold tabular-nums text-slate-900">{formatNumber((displayData ?? data).trafficKpi?.salesQty ?? 0)}개</span>
            </div>
            {data.lastSyncAt && (
              <div className="text-[11px] text-slate-400 mt-1">
                Wing 마지막 동기화 · {formatDateTime(data.lastSyncAt)}
                {(Date.now() - new Date(data.lastSyncAt).getTime()) > 86400000 && (
                  <span className="text-amber-500 ml-1">⚠ 24시간 이상 미동기화</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 월 순이익 */}
        <div
          className="lg:row-span-2 rounded-2xl px-5 py-3 flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow bg-white border border-slate-100 shadow-sm"
          onClick={() => setShowProfitDetail(true)}
        >
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={18} className="text-emerald-600" />
              <span className="text-sm font-bold uppercase tracking-wider text-emerald-600">{rangeLabel} 순이익</span>
              <span className={cn('flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono', profitChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                {profitChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{profitChange > 0 ? '+' : ''}{profitChange.toFixed(1)}%</span>
              </span>
            </div>
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
              <span className="font-bold tabular-nums text-slate-900">{formatKRW(rk?.adSpend ?? s.totalAdSpend)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">수수료</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW((displayData ?? data).profitDetail?.commission ?? 0)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">배송비</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW((displayData ?? data).profitDetail?.shippingCost ?? 0)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">매입가</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW((displayData ?? data).profitDetail?.costOfGoods ?? 0)}원</span>
            </div>
          </div>
        </div>

        {/* 이익률 */}
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
          value={((displayData ?? data).trafficKpi?.conversionRate ?? 0).toFixed(1)}
          unit="%"
          change={0}
          prevLabel=""
          accentColor="#0284c7"
          icon={ShoppingCart}
          goal={5}
          current={(displayData ?? data).trafficKpi?.conversionRate ?? 0}
          goalUnit="%"
          goalLabel="목표 5%"
        />

        {/* 광고수익률(ROAS) */}
        <MetricCard
          label="광고수익률"
          value={(rk?.adRoas ?? s.roas).toFixed(0)}
          unit="%"
          change={(rk?.adRoas ?? s.roas) - (rk?.prevAdRoas ?? s.prevRoas)}
          prevLabel={`이전 ${(rk?.prevAdRoas ?? s.prevRoas).toFixed(0)}%`}
          accentColor="#059669"
          icon={BarChart3}
          goal={400}
          current={rk?.adRoas ?? s.roas}
          goalUnit="%"
          goalLabel="목표 400%"
        />
      </div>


      {/* 차트 + 사이드패널 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 overflow-hidden" style={{ height: 620 }}>
        <div className="lg:col-span-3 h-full">
          <DashboardChart
            dailyTrend={dailyTrend}
            aiActions={aiActions}
            industryBenchmark={data.industryBenchmark}
          />
        </div>
        <SidePanel
          alerts={data.alerts}
          router={router}
          queryClient={queryClient}
        />
      </div>

      {/* 등급 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map(g => {
          const psKey = { A: 'gradeA', B: 'gradeB', C: 'gradeC' } as const;
          const count = pipelineStats?.[psKey[g]] ?? data.gradeCount[g] ?? 0;
          const total = pipelineStats?.total ?? s.totalProducts;
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
              <div className="text-xs mt-1 text-slate-400">{pct}% of {total}</div>
            </Link>
          );
        })}
      </div>

      {/* 경고 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href="/product-hub?tab=cleanup" className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
          <div className="text-sm font-bold mb-1 text-slate-900">적자 상품</div>
          <div className="text-2xl font-extrabold tabular-nums text-slate-900">{data.warnings.minusProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs mt-1 text-slate-400">이익률 마이너스</div>
        </Link>
        <Link href="/product-hub?tab=cleanup" className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
          <div className="text-sm font-bold mb-1 text-slate-900">저이익 상품</div>
          <div className="text-2xl font-extrabold tabular-nums text-slate-900">{data.warnings.lowProfitProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs mt-1 text-slate-400">이익률 3% 이하</div>
        </Link>
        <Link href="/ads-hub" className="rounded-2xl p-4 hover:shadow-md transition-all bg-white border border-slate-100 shadow-sm">
          <div className="text-sm font-bold mb-1 text-slate-900">광고비 초과</div>
          <div className="text-2xl font-extrabold tabular-nums text-slate-900">{data.warnings.highAdProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs mt-1 text-slate-400">광고비율 15% 초과</div>
        </Link>
      </div>

      {/* Top Products */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BarChart3 size={15} className="text-slate-400" />
            <h3 className="text-sm font-bold text-slate-900">Top Revenue Products</h3>
          </div>
          <Link href="/product-hub" className="text-xs font-mono text-purple-600">VIEW ALL →</Link>
        </div>
        <div className="overflow-x-auto">
          <table style={{ minWidth: 600 }}>
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pl-4 w-8 text-sm text-slate-400">#</th>
                <th className="w-8 text-sm text-slate-400">등급</th>
                <th className="text-sm text-slate-400">상품명</th>
                <th className="text-right text-sm text-slate-400">매출</th>
                <th className="text-right text-sm text-slate-400">순이익</th>
                <th className="text-right pr-4 text-sm text-slate-400">이익률</th>
              </tr>
            </thead>
            <tbody>
              {data.topProducts.map((p, i) => (
                <tr key={p.id} className="border-b border-slate-50">
                  <td className="pl-4 text-sm tabular-nums text-slate-400">{i + 1}</td>
                  <td><span className={cn('inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold', getGradeColor(p.grade))}>{p.grade}</span></td>
                  <td className="text-sm font-medium max-w-[300px] truncate text-slate-900">{p.name}</td>
                  <td className="text-right text-sm tabular-nums text-slate-900">{formatKRW(p.revenue)}<span className="text-slate-400">원</span></td>
                  <td className={cn('text-right text-sm tabular-nums', getProfitColor(p.profitRate))}>{formatKRW(p.netProfit)}<span className="text-slate-400">원</span></td>
                  <td className={cn('text-right pr-4 text-sm tabular-nums font-semibold', getProfitColor(p.profitRate))}>{formatPercent(p.profitRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {/* 순이익 상세 모달 */}
      {showProfitDetail && (() => {
        const pd = data.profitDetail;
        const revenue = pd?.revenue ?? s.monthlyRevenue;
        const items = pd ? [
          { label: '매출', value: pd.revenue, negative: false },
          { label: '집행광고비', value: -pd.adCost, negative: true },
          { label: '수수료', value: -pd.commission, negative: true },
          { label: '배송비', value: -pd.shippingCost, negative: true },
          { label: '매입원가', value: -pd.costOfGoods, negative: true },
          { label: '기타비용', value: -pd.otherCost, negative: true },
        ] : [
          { label: '매출', value: s.monthlyRevenue, negative: false },
          { label: '광고비', value: -s.totalAdSpend, negative: true },
          { label: '광고전환매출', value: s.adRevenue, negative: false },
        ];
        const netProfit = pd?.netProfit ?? s.monthlyProfit;
        const orderCount = pd?.orderCount;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProfitDetail(false)}>
            <div className="w-full max-w-md rounded-2xl p-6 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-slate-900">순이익 구조</h3>
                <button onClick={() => setShowProfitDetail(false)} className="p-1 rounded-lg hover:opacity-80 text-slate-400">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                {items.map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">{item.label}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 rounded-full overflow-hidden bg-slate-100">
                        <div
                          className={cn('h-full rounded-full', item.negative ? 'bg-red-500' : 'bg-purple-600')}
                          style={{ width: `${Math.min(Math.abs(item.value) / Math.max(revenue, 1) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={cn('text-sm font-semibold tabular-nums w-24 text-right', item.value >= 0 ? 'text-slate-900' : 'text-red-600')}>
                        {item.value >= 0 ? '' : '-'}{formatKRW(Math.abs(item.value))}원
                      </span>
                    </div>
                  </div>
                ))}
                <div className="pt-3 mt-3 flex items-center justify-between border-t border-slate-200">
                  <span className="text-sm font-bold text-slate-900">순이익</span>
                  <span className={cn('text-lg font-extrabold tabular-nums', netProfit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                    {formatKRW(netProfit)}원
                  </span>
                </div>
                <div className="text-xs text-center mt-2 text-slate-400">
                  {orderCount != null ? `주문 ${orderCount}건 기준` : `ROAS ${s.roas.toFixed(0)}% | CTR ${s.ctr.toFixed(2)}%`}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ===== 핵심 지표 카드 =====
function MetricCard({ label, value, unit, change, prevLabel, accentColor, icon: Icon, invertColor, goal, current, goalUnit, goalLabel, invertGoal, onClick }: {
  label: string; value: string; unit: string; change: number; prevLabel: string;
  accentColor: string; icon: typeof TrendingUp; invertColor?: boolean;
  goal?: number; current?: number; goalUnit?: string; goalLabel?: string; invertGoal?: boolean; onClick?: () => void;
}) {
  const isPositive = invertColor ? change < 0 : change > 0;
  const isNeutral = Math.abs(change) < 0.5;
  const ChangeIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const changeColorStyle = isNeutral ? '#94a3b8' : isPositive ? '#059669' : '#ef4444';
  const changeBgStyle = isNeutral ? 'rgba(148,163,184,0.1)' : isPositive ? 'rgba(5,150,105,0.1)' : 'rgba(239,68,68,0.1)';

  const hasGoal = goal !== undefined && current !== undefined && goal > 0;
  const isPercent = goalUnit === '%';

  let achievementRate = 0;
  let progressPct = 0;
  let goalMet = false;

  if (hasGoal) {
    if (invertGoal) {
      goalMet = current <= goal;
      const maxBad = goal * 2;
      progressPct = Math.max(0, Math.min(100, ((maxBad - current) / (maxBad - goal)) * 100));
      achievementRate = goalMet ? 100 : Math.round(progressPct);
    } else {
      achievementRate = Math.min(Math.round((current / goal) * 100), 999);
      progressPct = Math.min((current / goal) * 100, 100);
      goalMet = achievementRate >= 100;
    }
  }

  const displayGoalLabel = goalLabel || (isPercent ? `목표 ${goal}%` : `목표 ${formatKRW(goal!)}원`);
  const remaining = hasGoal && !goalMet
    ? invertGoal
      ? `${(current! - goal!).toFixed(1)}%p 초과`
      : isPercent
        ? `${(goal! - current!).toFixed(1)}%p 남음`
        : `${formatKRW(goal! - current!)}원 남음`
    : null;

  return (
    <div className={cn('rounded-2xl transition-all hover:shadow-md h-full bg-white border border-slate-100 shadow-sm', onClick && 'cursor-pointer')} onClick={onClick}>
      <div className="px-4 py-3 h-full flex flex-col">
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Icon size={16} style={{ color: accentColor }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>{label}</span>
            </div>
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-mono" style={{ background: changeBgStyle, color: changeColorStyle }}>
              <ChangeIcon size={12} />
              {!isNeutral && <span>{change > 0 ? '+' : ''}{change.toFixed(1)}%</span>}
              {isNeutral && <span>-</span>}
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg sm:text-2xl font-extrabold tabular-nums tracking-tight" style={{ color: accentColor }}>{value}</span>
            <span className="text-base font-semibold" style={{ color: accentColor, opacity: 0.6 }}>{unit}</span>
          </div>
          {prevLabel && <div className="text-xs mt-0.5 text-slate-500">{prevLabel}</div>}
        </div>
        {hasGoal && (
          <div className="mt-auto pt-2" style={{ borderTop: `1px solid ${accentColor}20` }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium" style={{ color: `${accentColor}99` }}>{displayGoalLabel}</span>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: accentColor }}>
                {invertGoal ? (goalMet ? '달성' : `${current}%`) : `${achievementRate}%`}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${accentColor}15` }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: accentColor }} />
            </div>
            {!goalMet && remaining && <div className="text-[10px] mt-0.5" style={{ color: `${accentColor}88` }}>{remaining}</div>}
            {goalMet && <div className="text-[10px] mt-0.5 font-semibold" style={{ color: accentColor }}>목표 달성!</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 사이드 패널 =====
function SidePanel({ alerts, router, queryClient }: {
  alerts: { id: string; type: string; message: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: any;
}) {
  const markAllRead = async () => {
    try {
      await apiClient.patch('/api/alerts/read-all', {});
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full bg-white border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">알림</span>
          {alerts.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{alerts.length}</span>
          )}
        </div>
        {alerts.length > 0 && (
          <button onClick={markAllRead} className="text-xs text-purple-600 font-semibold hover:underline">전체 읽음</button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {alerts.map(a => {
          const href = a.type === 'strategy_change' ? '/ad-ops' : a.type === 'stock_low' ? '/purchase-orders' : a.type === 'minus_product' ? '/cleanup' : a.type === 'ad_high' ? '/ads-hub' : undefined;
          return (
            <div key={a.id} onClick={() => href && router.push(href)} className={cn('flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-50 transition-colors', href && 'cursor-pointer')}>
              <div className="mt-0.5">{alertIcon(a.type)}</div>
              <div className="flex-1 min-w-0">
                <span className="text-sm leading-relaxed text-slate-500">{a.message}</span>
                {href && <span className="text-[10px] ml-1.5 text-purple-600">→</span>}
              </div>
            </div>
          );
        })}
        {alerts.length === 0 && (
          <div className="px-4 py-8 text-center">
            <ShieldCheck size={24} className="mx-auto mb-2 text-emerald-500" />
            <div className="text-xs text-slate-400">모든 알림을 확인했습니다</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Agent OS =====
type OrgNode = { id: string; name: string; type: string; role: string; title: string; status: string; reports?: OrgNode[] };
type AgentDisplay = { role: string; name: string; title: string; status: string; color: string; currentTask: string | null };

const ROLE_COLORS: Record<string, string> = {
  ceo: 'violet', ad_manager: 'blue', inventory: 'emerald',
  finance: 'rose', cs: 'amber',
  data_ad: 'blue', data_inv: 'emerald', data_fin: 'rose', data_cs: 'amber',
};

function flattenOrgNodes(nodes: OrgNode[]): AgentDisplay[] {
  const result: AgentDisplay[] = [];
  for (const n of nodes) {
    result.push({ role: n.role, name: n.name, title: n.title, status: n.status, color: ROLE_COLORS[n.role] ?? 'violet', currentTask: null });
    if (n.reports?.length) result.push(...flattenOrgNodes(n.reports));
  }
  return result;
}

// ===== 대시보드 차트 =====
function DashboardChart({
  dailyTrend,
  aiActions,
  industryBenchmark,
}: {
  dailyTrend: { date: string; revenue: number; profit: number; adCost: number; profitRate: number; adRate: number }[];
  aiActions: ActionTask[];
  industryBenchmark?: { avgAdRate: number; avgProfitRate: number; avgRoas: number; avgCtr: number; myAdRate?: number; myRoas?: number; myCtr?: number; avgCvr?: number };
}) {
  const [chartTab, setChartTab] = useState<'agents' | 'revenue' | 'ad' | 'benchmark'>('agents');
  const hasTrend = dailyTrend.length > 0;
  const hasBenchmark = !!industryBenchmark;

  const queryClient = useQueryClient();

  const { data: orgNodes = [] } = useQuery({
    queryKey: ['agent-registry', 'org'],
    queryFn: () => apiClient.get<OrgNode[]>('/api/agent-registry/org'),
    refetchInterval: 30_000,
    enabled: chartTab === 'agents',
  });

  const agents: AgentDisplay[] = flattenOrgNodes(orgNodes);
  const agentLogs: { taskType: string; status: string; timeAgo: string }[] = [];

  const { mutate: executeAction, variables: executingId } = useMutation({
    mutationFn: (id: string) => apiClient.post<{ ok: boolean }>(`/api/action-tasks/${id}/execute`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.list() });
      toast.success('액션을 실행했습니다.');
    },
    onError: () => toast.error('실행에 실패했습니다.'),
  });

  const tabs = [
    { key: 'agents' as const, label: 'Agent OS' },
    { key: 'revenue' as const, label: '매출 · 이익률' },
    { key: 'ad' as const, label: '광고비 · 비율' },
    ...(hasBenchmark ? [{ key: 'benchmark' as const, label: '업계 평균 대비' }] : []),
  ];

  const adChartData = dailyTrend.map(d => ({
    date: d.date,
    adCost: d.adCost,
    revenue: d.revenue,
    adRate: d.adRate,
  }));

  const DEPT_MAP = [
    { key: 'ad', label: '광고부', leadRole: 'ad_manager', memberRole: 'data_ad', color: '#3b82f6' },
    { key: 'inv', label: '재고부', leadRole: 'inventory', memberRole: 'data_inv', color: '#10b981' },
    { key: 'cs', label: 'CS부', leadRole: 'cs', memberRole: 'data_cs', color: '#f59e0b' },
    { key: 'fin', label: '분석부', leadRole: 'finance', memberRole: 'data_fin', color: '#ef4444' },
  ];

  const isAgentOs = chartTab === 'agents';
  return (
    <div className={cn('relative rounded-2xl overflow-hidden flex flex-col h-full border shadow-sm transition-all', isAgentOs ? 'border-violet-100 shadow-[0_0_40px_rgba(124,58,237,0.08)]' : 'bg-white border-slate-100')}>
      {isAgentOs && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 via-purple-500 to-blue-500 z-10" />}
      <div className={cn('flex items-center justify-between px-5 py-3 border-b shrink-0', isAgentOs ? 'border-violet-100/60 bg-white/60 backdrop-blur-sm' : 'border-slate-100')}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg p-0.5 bg-slate-100">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setChartTab(t.key)}
                className={cn('px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all', chartTab === t.key ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500')}>
                {t.label}
              </button>
            ))}
          </div>
          {isAgentOs && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-sm">
              <Zap size={9} className="fill-white" /> AI Powered
            </span>
          )}
        </div>
        <span className={cn('text-[12px] flex items-center gap-1.5', isAgentOs ? 'text-violet-600 font-semibold' : 'text-slate-400')}>
          {isAgentOs && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
          {isAgentOs ? '실시간' : '최근 30일'}
        </span>
      </div>

      {/* Agent OS — 조직도 */}
      {chartTab === 'agents' && (() => {
        const ceo = agents.find(a => a.role === 'ceo');
        const DEPT_FACE_COLORS: Record<string, string> = { ad: 'blue', inv: 'emerald', cs: 'amber', fin: 'rose' };

        // 부서별 액션 분류: role 필드 우선, 없으면 taskKey+label 키워드 매칭
        const classify = (a: ActionTask): string => {
          if (a.role === 'ad_manager') return 'ad';
          if (a.role === 'inventory') return 'inv';
          if (a.role === 'cs') return 'cs';
          if (a.role === 'finance') return 'fin';
          const key = `${a.taskKey} ${a.label}`.toLowerCase();
          if (/광고|ad_|roas|campaign|cpc|ctr|클릭|노출|bid/.test(key)) return 'ad';
          if (/재고|stock|inventory|상품|product|reorder|입고|발주|품절/.test(key)) return 'inv';
          if (/cs|고객|review|리뷰|반품|return|문의|refund|교환/.test(key)) return 'cs';
          if (/profit|수익|정산|settlement|category|마진|비용|minus/.test(key)) return 'fin';
          return 'ad'; // 미분류는 광고부
        };

        const deptActions: Record<string, ActionTask[]> = { ad: [], inv: [], cs: [], fin: [] };
        for (const a of aiActions) deptActions[classify(a)].push(a);

        return (
          <div className="flex-1 flex flex-col p-4 rounded-b-2xl relative" style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 45%, #eff6ff 100%)' }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 20% 0%, rgba(139,92,246,0.08) 0%, transparent 40%), radial-gradient(circle at 80% 100%, rgba(59,130,246,0.06) 0%, transparent 40%)' }} />
            <div className="relative flex-1 flex flex-col min-h-0">
            {/* CEO */}
            <div className="flex justify-center mb-1.5">
              <div className="rounded-full px-3 py-1.5 flex items-center gap-2 bg-purple-600" style={{ boxShadow: '0 2px 8px rgba(124,58,237,0.25)' }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.85)' }}>
                  <AgentFace color={ceo?.color || 'violet'} role="ceo" size={24} />
                </div>
                <span className="text-xs font-semibold text-white">{ceo?.name || 'CEO'}</span>
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', ceo?.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-white/40')} />
              </div>
            </div>

            {/* CEO → 연결선 */}
            <div className="flex justify-center">
              <div style={{ width: 1.5, height: 8, background: '#7c3aed', opacity: 0.3 }} />
            </div>

            {/* 부서별 에이전트 + 액션 */}
            <div className="grid grid-cols-4 gap-2 flex-1 min-h-0">
              {DEPT_MAP.map(dept => {
                const lead = agents.find(a => a.role === dept.leadRole);
                const isWorking = lead?.status === 'running';
                const faceColor = lead?.color || DEPT_FACE_COLORS[dept.key] || 'violet';
                const faceRole = lead?.role || dept.leadRole;
                const actions = deptActions[dept.key] ?? [];

                return (
                  <div key={dept.key} className="flex flex-col min-h-0">
                    {/* 에이전트 카드 */}
                    <div className="rounded-xl p-3 flex items-center gap-2.5 border border-slate-100 shrink-0" style={{ boxShadow: isWorking ? `0 3px 12px ${dept.color}20` : '0 1px 4px rgba(0,0,0,0.04)', background: '#ffffff' }}>
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full overflow-hidden" style={{ background: `${dept.color}08`, boxShadow: isWorking ? `0 0 0 2px ${dept.color}40` : 'none', transition: 'box-shadow 0.3s' }}>
                          <AgentFace color={faceColor} role={faceRole} size={48} />
                        </div>
                        {isWorking && (
                          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#059669' }}>
                            <Zap size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-bold truncate" style={{ color: lead ? '#0f172a' : dept.color }}>{lead?.name || dept.label}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', isWorking ? 'bg-green-500 animate-pulse' : 'bg-gray-300')} />
                          <span className="text-xs" style={{ color: isWorking ? '#059669' : '#94a3b8' }}>{isWorking ? '업무 중' : '대기'}</span>
                        </div>
                      </div>
                    </div>

                    {/* 연결선 */}
                    <div className="flex justify-center">
                      <div style={{ width: 1, height: 6, background: dept.color, opacity: 0.25 }} />
                    </div>

                    {/* 액션 목록 */}
                    <div className="rounded-xl border border-slate-100 flex-1 min-h-0 overflow-y-auto" style={{ background: `${dept.color}04` }}>
                      {actions.length === 0 ? (
                        <div className="flex items-center justify-center h-full py-4">
                          <span className="text-sm text-slate-300">할일 없음</span>
                        </div>
                      ) : (
                        <div className="p-2 space-y-1.5">
                          {actions.map(a => {
                            const isRunning = executingId === a.id;
                            const dot = a.priority === 'urgent' ? '#ef4444' : a.priority === 'high' ? '#f59e0b' : '#94a3b8';
                            return (
                              <div key={a.id} className="rounded-lg px-2.5 py-2 flex items-start gap-2 bg-white border border-slate-50 hover:border-slate-200 transition-colors">
                                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dot }} />
                                <span className="text-[15px] text-slate-800 flex-1 leading-snug line-clamp-2 font-medium">{a.label}</span>
                                <button
                                  onClick={() => executeAction(a.id)}
                                  disabled={isRunning}
                                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md mt-0.5 transition-all disabled:opacity-50"
                                  style={{ background: isRunning ? '#e2e8f0' : `${dept.color}15`, color: isRunning ? '#94a3b8' : dept.color }}
                                  title="실행"
                                >
                                  {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        );
      })()}

      {/* Charts - lazy loaded to reduce initial bundle */}
      <DashboardCharts
        chartTab={chartTab}
        dailyTrend={dailyTrend}
        adChartData={adChartData}
        benchmarkData={industryBenchmark ? [
          { name: '광고비율', my: industryBenchmark.myAdRate ?? 0, avg: industryBenchmark.avgAdRate, unit: '%', invertGood: true },
          { name: 'ROAS', my: industryBenchmark.myRoas ?? 0, avg: industryBenchmark.avgRoas, unit: '%', invertGood: false },
          { name: 'CTR', my: industryBenchmark.myCtr ?? 0, avg: industryBenchmark.avgCtr, unit: '%', invertGood: false },
          { name: 'CVR', my: industryBenchmark.avgCvr ?? 0, avg: 8, unit: '%', invertGood: false },
        ] : null}
        hasTrend={hasTrend}
      />
    </div>
  );
}

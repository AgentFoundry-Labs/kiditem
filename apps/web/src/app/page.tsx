'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Minus,
  AlertTriangle, MinusCircle, Megaphone, Truck,
  Zap,
  BarChart3, Target, ShieldCheck, Wallet,
  ShoppingCart, X, Calendar,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { apiClient } from '@/lib/api-client';
import PageSkeleton from '@/components/ui/PageSkeleton';

const DashboardCharts = dynamic(
  () => import('./components/DashboardCharts').then(mod => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="h-[320px] flex items-center justify-center text-sm text-slate-300">차트 로딩 중...</div> },
);
import { queryKeys } from '@/lib/query-keys';
import { formatKRW, formatPercent, getGradeColor, getProfitColor } from '@/lib/utils';
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
  const aiActions = actionTasks.filter(t => t.type === 'ai');

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

  // KPI: rangeKpi 서버 값 우선, 없으면 summary 폴백
  const kpiRevenue = rk?.revenue ?? s.monthlyRevenue;
  const kpiProfit = rk?.profit ?? s.monthlyProfit;
  const kpiPrevRevenue = rk?.prevRevenue ?? s.prevMonthlyRevenue;
  const kpiPrevProfit = rk?.prevProfit ?? s.prevMonthlyProfit;
  const revenueChange = rk?.revenueChange ?? (kpiPrevRevenue > 0 ? ((kpiRevenue - kpiPrevRevenue) / kpiPrevRevenue) * 100 : 0);
  const profitChange = rk?.profitChange ?? (kpiPrevProfit > 0 ? ((kpiProfit - kpiPrevProfit) / kpiPrevProfit) * 100 : 0);
  const profitRate = rk?.profitRate ?? (s.monthlyRevenue > 0 ? (s.monthlyProfit / s.monthlyRevenue) * 100 : 0);
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
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
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
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${kpiRange === val ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400'}`}
              >{label}</button>
            ))}
            <button
              onClick={() => setKpiRange('custom')}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-1 ${kpiRange === 'custom' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400'}`}
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
              <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono ${revenueChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
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
                <span className={`text-[13px] font-bold tabular-nums ${revenueAchieve >= 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{revenueAchieve}%</span>
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
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">광고외매출</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW(kpiRevenue - (rk?.adConvRevenue ?? 0))}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">광고전환매출</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW(rk?.adConvRevenue ?? s.adRevenue)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">주문</span>
              <span className="font-bold tabular-nums text-slate-900">{((displayData ?? data).trafficKpi?.orders ?? s.todayOrders).toLocaleString()}건</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">판매량</span>
              <span className="font-bold tabular-nums text-slate-900">{((displayData ?? data).trafficKpi?.salesQty ?? 0).toLocaleString()}개</span>
            </div>
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
              <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono ${profitChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
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
                <span className={`text-[13px] font-bold tabular-nums ${profitAchieve >= 100 ? 'text-emerald-600' : 'text-emerald-700'}`}>{profitAchieve}%</span>
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 overflow-hidden" style={{ height: 480 }}>
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
          const count = data.gradeCount[g] || 0;
          const pct = s.totalProducts > 0 ? Math.round((count / s.totalProducts) * 100) : 0;
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
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs mt-1 text-slate-400">{pct}% of {s.totalProducts}</div>
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
                  <td><span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${getGradeColor(p.grade)}`}>{p.grade}</span></td>
                  <td className="text-sm font-medium max-w-[300px] truncate text-slate-900">{p.name}</td>
                  <td className="text-right text-sm tabular-nums text-slate-900">{formatKRW(p.revenue)}<span className="text-slate-400">원</span></td>
                  <td className={`text-right text-sm tabular-nums ${getProfitColor(p.profitRate)}`}>{formatKRW(p.netProfit)}<span className="text-slate-400">원</span></td>
                  <td className={`text-right pr-4 text-sm tabular-nums font-semibold ${getProfitColor(p.profitRate)}`}>{formatPercent(p.profitRate)}</td>
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
                          className={`h-full rounded-full ${item.negative ? 'bg-red-500' : 'bg-purple-600'}`}
                          style={{ width: `${Math.min(Math.abs(item.value) / Math.max(revenue, 1) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={`text-sm font-semibold tabular-nums w-24 text-right ${item.value >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                        {item.value >= 0 ? '' : '-'}{formatKRW(Math.abs(item.value))}원
                      </span>
                    </div>
                  </div>
                ))}
                <div className="pt-3 mt-3 flex items-center justify-between border-t border-slate-200">
                  <span className="text-sm font-bold text-slate-900">순이익</span>
                  <span className={`text-lg font-extrabold tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
    <div className={`rounded-2xl transition-all hover:shadow-md h-full${onClick ? ' cursor-pointer' : ''} bg-white border border-slate-100 shadow-sm`} onClick={onClick}>
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
            <div key={a.id} onClick={() => href && router.push(href)} className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-50 transition-colors ${href ? 'cursor-pointer' : ''}`}>
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
  const [chartTab, setChartTab] = useState<'actions' | 'revenue' | 'ad' | 'benchmark'>('actions');
  const hasTrend = dailyTrend.length > 0;
  const hasBenchmark = !!industryBenchmark;

  const tabs = [
    { key: 'actions' as const, label: '액션 요약' },
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

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full bg-white border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
        <div className="flex gap-1 rounded-lg p-0.5 bg-slate-100">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setChartTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all ${chartTab === t.key ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-slate-400">{chartTab === 'actions' ? '요약' : '최근 30일'}</span>
      </div>

      {/* 액션 요약 */}
      {chartTab === 'actions' && (
        <div className="flex-1 flex flex-col p-5 gap-4">
          <div className="flex gap-6">
            {[
              { label: '긴급', color: 'text-red-600 bg-red-50 border-red-200', count: aiActions.filter(a => a.priority === 'urgent').length },
              { label: '높음', color: 'text-amber-600 bg-amber-50 border-amber-200', count: aiActions.filter(a => a.priority === 'high').length },
              { label: '보통', color: 'text-purple-600 bg-purple-50 border-purple-200', count: aiActions.filter(a => a.priority === 'medium').length },
            ].map(g => (
              <div key={g.label} className={`flex-1 rounded-xl border p-3 text-center ${g.color}`}>
                <div className="text-2xl font-bold">{g.count}</div>
                <div className="text-xs font-medium mt-0.5">{g.label}</div>
              </div>
            ))}
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto">
            {aiActions.map(a => (
              <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 ${a.priority === 'urgent' ? 'bg-red-500' : a.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                <span className="text-[13px] text-slate-700 truncate flex-1">{a.label}</span>
                <span className="text-[11px] text-slate-400 shrink-0">{a.detail?.slice(0, 15)}</span>
              </div>
            ))}
          </div>
          <Link href="/action-board" className="shrink-0 text-center px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors">
            액션 보드에서 보기 →
          </Link>
        </div>
      )}

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

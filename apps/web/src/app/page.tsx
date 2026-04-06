'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Minus,
  AlertTriangle, MinusCircle, Megaphone, Truck,
  Zap,
  BarChart3, Target, ShieldCheck, Wallet,
  Check, Sparkles, Play, ClipboardList,
  ShoppingCart, X, Calendar,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatKRW, formatPercent, getGradeColor, getProfitColor } from '@/lib/utils';
import type { DashboardSummary, DashboardTrendItem } from '@kiditem/shared';

interface HumanTask {
  id: string;
  label: string;
  detail: string;
  where: string;
  priority: 'urgent' | 'high' | 'medium';
  href?: string;
}

interface AiAction {
  id: string;
  label: string;
  desc: string;
  priority: 'urgent' | 'high' | 'medium';
  apiCall?: { url: string; method: string; body?: Record<string, string> };
  href?: string;
}

function generateTasksAndActions(data: DashboardSummary): { tasks: HumanTask[]; actions: AiAction[] } {
  const tasks: HumanTask[] = [];
  const actions: AiAction[] = [];
  const w = data.warnings;
  const s = data.summary;

  if (w.highAdProducts > 0) {
    tasks.push({
      id: 'h-ad-bid', label: `광고비 초과 ${w.highAdProducts}개 — 입찰가 하향 조정`,
      detail: '쿠팡 광고센터에서 해당 상품 입찰가를 낮추거나 일예산 축소',
      where: '쿠팡 광고센터', priority: 'urgent', href: '/ads-hub',
    });
  }
  if (w.minusProducts > 0) {
    tasks.push({
      id: 'h-minus-ad-stop', label: `적자 상품 ${w.minusProducts}개 — 광고 중단 처리`,
      detail: '쿠팡 광고센터에서 적자 상품 캠페인 OFF 처리',
      where: '쿠팡 광고센터', priority: 'urgent', href: '/cleanup',
    });
    tasks.push({
      id: 'h-minus-price', label: `적자 상품 ${w.minusProducts}개 — 판매가 인상 검토`,
      detail: '경쟁사 가격 확인 후 마진 확보 가능한 상품 가격 조정',
      where: '쿠팡 윙', priority: 'high', href: '/cleanup',
    });
  }
  if (w.needReorder > 0) {
    tasks.push({
      id: 'h-reorder', label: `${w.needReorder}개 상품 — 매입처에 발주`,
      detail: '안전재고 이하 상품을 매입처에 발주서 전송',
      where: '매입처/1688', priority: 'high', href: '/purchase-orders',
    });
  }
  if (s.adRate > 12) {
    tasks.push({
      id: 'h-ad-rate', label: `전체 광고비율 ${s.adRate}% — 비효율 캠페인 정리`,
      detail: 'ROAS 200% 미만 캠페인을 쿠팡 광고센터에서 OFF 또는 입찰가 50% 하향',
      where: '쿠팡 광고센터', priority: 'high',
    });
  }
  if (w.lowProfitProducts > 0) {
    tasks.push({
      id: 'h-low-profit', label: `저이익 ${w.lowProfitProducts}개 — 소싱처/수수료 재검토`,
      detail: '원가 절감 가능한 소싱처 확인, 카테고리 수수료율 점검',
      where: '소싱처/쿠팡 윙', priority: 'medium', href: '/cleanup',
    });
  }
  tasks.push({
    id: 'h-ad-csv', label: '쿠팡 광고센터 리포트 다운로드 & 업로드',
    detail: '광고센터 → 리포트 다운로드(CSV) → 여기에 업로드해서 데이터 갱신',
    where: '쿠팡 광고센터 → 업로드', priority: 'medium',
  });

  actions.push({
    id: 'recalc-grade', label: 'ABC 등급 재계산', desc: '14일 매출 기반 등급 재산정 + 변동 리포트',
    priority: 'high',
    apiCall: { url: '/api/products/calculate-grades', method: 'POST', body: {} },
  });
  if (w.minusProducts > 0) {
    actions.push({
      id: 'analyze-deficit', label: `적자 상품 ${w.minusProducts}개 분석`, desc: '적자 원인 분석: 광고비 과다 / 원가 문제 / 가격 오류',
      priority: 'urgent',
      apiCall: { url: '/api/products?status=active&sortBy=profitRate&sortDir=asc&period=14', method: 'GET' },
    });
  }
  actions.push({
    id: 'analyze-ad-rules', label: '광고 자동규칙 전략 분석', desc: 'A/B/C 등급별 광고 규칙 평가 → 수정 요청 생성',
    priority: 'urgent',
    apiCall: { url: '/api/ad-rules', method: 'GET' },
  });
  if (w.highAdProducts > 0) {
    actions.push({
      id: 'analyze-ad', label: `광고비 초과 ${w.highAdProducts}개 분석`, desc: 'ROAS/CTR 분석 → 중단/축소/유지 판단',
      priority: 'high',
      apiCall: { url: '/api/products?sortBy=revenue&sortDir=desc&period=14', method: 'GET' },
    });
  }
  if (w.needReorder > 0) {
    actions.push({
      id: 'analyze-stock', label: `재고 부족 ${w.needReorder}개 분석`, desc: '판매속도 대비 재고일수 계산 → 발주 추천량',
      priority: 'high',
      apiCall: { url: '/api/inventory', method: 'GET' },
    });
  }
  actions.push({
    id: 'analyze-category', label: '카테고리별 성과 분석', desc: '카테고리별 매출/이익률/ROAS 비교',
    priority: 'medium',
    apiCall: { url: '/api/coupang/category', method: 'GET' },
  });

  return { tasks, actions };
}

function alertIcon(type: string) {
  if (type === 'minus_product') return <MinusCircle size={14} className="text-red-500 shrink-0" />;
  if (type === 'ad_high') return <Megaphone size={14} className="text-amber-500 shrink-0" />;
  if (type === 'stock_low') return <Truck size={14} className="text-blue-500 shrink-0" />;
  return <AlertTriangle size={14} className="text-slate-400 shrink-0" />;
}

export default function Dashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [actionModal, setActionModal] = useState<{ title: string; results: any[] } | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = JSON.parse(localStorage.getItem('dashboard-completed-actions') || '{}');
      if (saved.date === new Date().toDateString()) return new Set(saved.ids || []);
      return new Set();
    } catch { return new Set(); }
  });
  const [showProfitDetail, setShowProfitDetail] = useState(false);
  const [kpiRange, setKpiRange] = useState<'month' | 'week' | 'day' | 'custom'>('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = JSON.parse(localStorage.getItem('dashboard-checked-tasks') || '{}');
      if (saved.date === new Date().toDateString()) return new Set(saved.ids || []);
      return new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard-completed-actions', JSON.stringify({ date: new Date().toDateString(), ids: Array.from(completedActions) }));
      localStorage.setItem('dashboard-checked-tasks', JSON.stringify({ date: new Date().toDateString(), ids: Array.from(checkedTasks) }));
    }
  }, [checkedTasks, completedActions]);

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
    enabled: kpiRange !== 'custom' || (!!dateFrom && !!dateTo),
    refetchInterval: 60_000,
  });

  const applyCustomRange = useCallback(() => {
    if (!dateFrom || !dateTo) return;
    queryClient.invalidateQueries({ queryKey: [...queryKeys.dashboard.all, 'range', 'custom', dateFrom, dateTo] });
  }, [dateFrom, dateTo, queryClient]);

  const displayData = rangeData ?? data;

  const { tasks: humanTasks, actions: aiActions } = data
    ? generateTasksAndActions(data)
    : { tasks: [] as HumanTask[], actions: [] as AiAction[] };

  const toggleTask = (id: string) => {
    setCheckedTasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const executeAction = useCallback(async (action: AiAction) => {
    if (!action.apiCall) return;
    setProcessingAction(action.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any;
      if (action.apiCall.method === 'GET') {
        json = await apiClient.get(action.apiCall.url);
      } else {
        json = await apiClient.post(action.apiCall.url, action.apiCall.body || {});
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = [];

      if (action.id === 'recalc-grade') {
        results.push({ label: '총 상품', value: json.totalProducts });
        results.push({ label: '등급 변경', value: `${json.updatedCount}개`, highlight: json.updatedCount > 0 });
        results.push({ label: 'A등급', value: `${json.gradeCounts?.A || 0}개` });
        results.push({ label: 'B등급', value: `${json.gradeCounts?.B || 0}개` });
        results.push({ label: 'C등급', value: `${json.gradeCounts?.C || 0}개` });
        results.push({ label: '총 매출', value: formatKRW(json.totalRevenue || 0) + '원' });
        if (json.updatedProducts?.length > 0) {
          results.push({ label: '변경 내역', value: '', list: json.updatedProducts.slice(0, 10).map((p: { oldGrade: string; newGrade: string; score: number }) => `${p.oldGrade}→${p.newGrade} (${p.score}점)`) });
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      } else if (action.id === 'analyze-deficit') {
        const prods = (json.data || []).filter((p: { profitRate: number }) => p.profitRate < 0).slice(0, 15);
        results.push({ label: '적자 상품 수', value: `${prods.length}개`, highlight: true });
        for (const p of prods) {
          const reason = p.adRate > 15 ? '광고비 과다' : p.costPrice >= p.sellPrice ? '원가 > 판매가' : '수수료/배송비';
          results.push({ label: p.name?.substring(0, 25), value: `이익률 ${formatPercent(p.profitRate)} | 원인: ${reason}` });
        }
      } else if (action.id === 'analyze-ad') {
        const prods = (json.data || []).filter((p: { adTier: string | null }) => p.adTier).slice(0, 15);
        const stop = prods.filter((p: { roas: number }) => p.roas < 1);
        const reduce = prods.filter((p: { roas: number }) => p.roas >= 1 && p.roas < 3);
        const keep = prods.filter((p: { roas: number }) => p.roas >= 3);
        results.push({ label: '광고 중단 권장', value: `${stop.length}개 (ROAS < 1)`, highlight: stop.length > 0 });
        results.push({ label: '광고 축소 검토', value: `${reduce.length}개 (ROAS 1~3)` });
        results.push({ label: '광고 유지/확대', value: `${keep.length}개 (ROAS 3+)` });
      } else if (action.id === 'analyze-stock') {
        const items = (json.inventories || json.data || []).filter((i: { currentStock: number; reorderPoint: number }) => i.currentStock <= i.reorderPoint && i.reorderPoint > 0).slice(0, 15);
        results.push({ label: '발주 필요', value: `${items.length}개`, highlight: true });
        for (const i of items) {
          const days = i.avgDailySales > 0 ? Math.round(i.currentStock / i.avgDailySales) : 0;
          results.push({ label: i.productName || i.product?.name || '상품', value: `재고 ${i.currentStock}개 (${days}일분)` });
        }
      } else if (action.id === 'analyze-ad-rules') {
        const s = json.summary || {};
        const recs = json.recommendations || [];
        results.push({ label: '분석 상품 수', value: `${s.total}개` });
        results.push({ label: '긴급 조치 필요', value: `${s.urgent}개`, highlight: s.urgent > 0 });
        results.push({ label: '높은 우선순위', value: `${s.high}개` });
        results.push({ label: '전략 수정 알림', value: `${s.newAlerts}건 생성` });
        for (const r of recs.slice(0, 15)) {
          const icon = r.priority === 'urgent' ? '🔴' : r.priority === 'high' ? '🟡' : '🟢';
          results.push({ label: `${icon} [${r.rule}] ${r.name?.substring(0, 18)}`, value: r.action });
        }
      } else if (action.id === 'analyze-category') {
        const cats = (json.categories || []).slice(0, 10);
        results.push({ label: '카테고리 수', value: `${cats.length}개` });
        for (const c of cats) {
          results.push({ label: c.category?.substring(0, 20) || '-', value: `매출 ${formatKRW(c.totalRevenue)}원 | 이익률 ${c.avgProfitRate}% | 상품 ${c.productCount}개` });
        }
      } else {
        results.push({ label: '결과', value: JSON.stringify(json).substring(0, 200) });
      }

      setCompletedActions(prev => new Set(Array.from(prev).concat(action.id)));
      setActionModal({ title: action.label, results });
    } catch (e) {
      const msg = isApiError(e) ? e.detail : e instanceof Error ? e.message : '실행 실패';
      setActionModal({ title: action.label, results: [{ label: '오류', value: msg, highlight: true }] });
    } finally {
      setProcessingAction(null);
    }
  }, [queryClient]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm font-mono text-slate-400">
        INITIALIZING FOUNDRY...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500 text-sm">대시보드 데이터를 불러오는데 실패했습니다.</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Retry</button>
      </div>
    );
  }

  const s = (displayData ?? data).summary;

  // KPI 계산
  const prevRevenue = s.prevMonthlyRevenue;
  const prevProfit = s.prevMonthlyProfit;
  const revenueChange = prevRevenue > 0 ? ((s.monthlyRevenue - prevRevenue) / prevRevenue) * 100 : 0;
  const profitChange = prevProfit > 0 ? ((s.monthlyProfit - prevProfit) / prevProfit) * 100 : 0;
  const adRateChange = s.prevAdRate > 0 ? s.adRate - s.prevAdRate : 0;
  const profitRate = s.monthlyRevenue > 0 ? (s.monthlyProfit / s.monthlyRevenue) * 100 : 0;
  const prevProfitRate = s.prevMonthlyRevenue > 0 ? (s.prevMonthlyProfit / s.prevMonthlyRevenue) * 100 : 0;

  const revenueGoal = Math.max(prevRevenue * 1.15, 1000000);
  const profitGoal = Math.max(prevProfit * 1.15, 100000);
  const revenueAchieve = revenueGoal > 0 ? Math.min(Math.round((s.monthlyRevenue / revenueGoal) * 100), 999) : 0;
  const revenuePct = revenueGoal > 0 ? Math.min((s.monthlyRevenue / revenueGoal) * 100, 100) : 0;
  const profitAchieve = profitGoal > 0 ? Math.min(Math.round((s.monthlyProfit / profitGoal) * 100), 999) : 0;
  const profitPct = profitGoal > 0 ? Math.min((s.monthlyProfit / profitGoal) * 100, 100) : 0;

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
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${kpiRange === val ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}
              >{label}</button>
            ))}
            <button
              onClick={() => setKpiRange('custom')}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-1 ${kpiRange === 'custom' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}
            ><Calendar size={13} /> 기간</button>
          </div>
          {kpiRange === 'custom' ? (
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <span className="text-xs text-slate-400">~</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200" />
              <button onClick={applyCustomRange} disabled={!dateFrom || !dateTo}
                className="px-3 py-1.5 rounded-lg text-white text-sm font-semibold bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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
              <span className="text-sm font-bold uppercase tracking-wider text-blue-600">월 매출</span>
              <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono ${revenueChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {revenueChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{revenueChange > 0 ? '+' : ''}{revenueChange.toFixed(1)}%</span>
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-blue-600">{formatKRW(s.monthlyRevenue)}</span>
              <span className="text-lg font-semibold text-blue-600/60">원</span>
            </div>
            <div className="text-sm text-slate-500">이전 {formatKRW(prevRevenue)}원</div>
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
                : <div className="text-[11px] mt-1 text-blue-400">{formatKRW(revenueGoal - s.monthlyRevenue)}원 남음</div>
              }
            </div>
          </div>
          <div className="mt-2 pt-2 space-y-1.5 border-t border-blue-100">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">오늘 매출</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW(s.todayRevenue)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">오늘 주문</span>
              <span className="font-bold tabular-nums text-slate-900">{s.todayOrders.toLocaleString()}건</span>
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
              <span className="text-sm font-bold uppercase tracking-wider text-emerald-600">월 순이익</span>
              <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-sm font-mono ${profitChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {profitChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{profitChange > 0 ? '+' : ''}{profitChange.toFixed(1)}%</span>
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-emerald-600">{formatKRW(s.monthlyProfit)}</span>
              <span className="text-lg font-semibold text-emerald-600/60">원</span>
            </div>
            <div className="text-sm text-slate-500">이전 {formatKRW(prevProfit)}원</div>
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
                : <div className="text-[11px] mt-1 text-emerald-400">{formatKRW(profitGoal - s.monthlyProfit)}원 남음</div>
              }
            </div>
          </div>
          <div className="mt-2 pt-2 space-y-1.5 border-t border-emerald-100">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">광고비</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW(s.totalAdSpend)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">광고전환매출</span>
              <span className="font-bold tabular-nums text-slate-900">{formatKRW(s.adRevenue)}원</span>
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
          value={s.adRate.toFixed(1)}
          unit="%"
          change={-adRateChange}
          prevLabel={`이전 ${s.prevAdRate.toFixed(1)}%`}
          accentColor="#dc2626"
          icon={Megaphone}
          invertColor
          goal={10}
          current={s.adRate}
          goalUnit="%"
          goalLabel="목표 10% 이하"
          invertGoal
        />

        {/* ROAS */}
        <MetricCard
          label="ROAS"
          value={s.roas.toFixed(0)}
          unit="%"
          change={s.roas - s.prevRoas}
          prevLabel={`이전 ${s.prevRoas.toFixed(0)}%`}
          accentColor="#0284c7"
          icon={BarChart3}
          goal={400}
          current={s.roas}
          goalUnit="%"
          goalLabel="목표 400%"
        />

        {/* CTR */}
        <MetricCard
          label="클릭률(CTR)"
          value={s.ctr.toFixed(2)}
          unit="%"
          change={s.ctr - s.prevCtr}
          prevLabel={`이전 ${s.prevCtr.toFixed(2)}%`}
          accentColor="#059669"
          icon={ShoppingCart}
          goal={1.5}
          current={s.ctr}
          goalUnit="%"
          goalLabel="목표 1.5%"
        />
      </div>

      {/* 차트 + 사이드패널 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3" style={{ minHeight: 400 }}>
        <div className="lg:col-span-3 h-full">
          <DashboardChart
            dailyTrend={dailyTrend}
            aiActions={aiActions}
            completedActions={completedActions}
            executeAction={executeAction}
            processingAction={processingAction}
          />
        </div>
        <SidePanel
          humanTasks={humanTasks}
          checkedTasks={checkedTasks}
          toggleTask={toggleTask}
          alerts={data.alerts}
          router={router}
        />
      </div>

      {/* 등급 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map(g => {
          const count = data.gradeCount[g] || 0;
          const pct = s.totalProducts > 0 ? Math.round((count / s.totalProducts) * 100) : 0;
          const barColor = g === 'C' ? 'bg-red-500' : 'bg-blue-600';
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
          <Link href="/product-hub" className="text-xs font-mono text-blue-600">VIEW ALL →</Link>
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

      {/* 분석 결과 모달 */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setActionModal(null)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden bg-white" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-violet-500" />
                <h2 className="text-lg font-bold text-slate-900">{actionModal.title}</h2>
              </div>
              <button onClick={() => setActionModal(null)} className="p-1 text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-2 overflow-y-auto max-h-[60vh]">
              {actionModal.results.map((r, i) => (
                <div key={i} className={`flex items-start justify-between py-2 ${i < actionModal.results.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <span className={`text-sm ${r.highlight ? 'text-red-600 font-bold' : 'text-slate-500'}`}>{r.label}</span>
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${r.highlight ? 'text-red-600' : 'text-slate-900'}`}>{r.value}</span>
                    {r.list && (
                      <div className="mt-1 space-y-0.5">
                        {r.list.map((item: string, j: number) => (
                          <div key={j} className="text-xs text-slate-500">{item}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 flex justify-end border-t border-slate-200 bg-slate-50">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 text-white rounded-lg text-sm font-medium bg-slate-900">확인</button>
            </div>
          </div>
        </div>
      )}

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
                          className={`h-full rounded-full ${item.negative ? 'bg-red-500' : 'bg-blue-600'}`}
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
function SidePanel({ humanTasks, checkedTasks, toggleTask, alerts, router }: {
  humanTasks: HumanTask[];
  checkedTasks: Set<string>;
  toggleTask: (id: string) => void;
  alerts: { id: string; type: string; message: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: any;
}) {
  const [tab, setTab] = useState<'tasks' | 'alerts'>('tasks');
  const taskCount = humanTasks.filter(t => !checkedTasks.has(t.id)).length;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full bg-white border border-slate-100 shadow-sm">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100">
        <button
          onClick={() => setTab('tasks')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'tasks' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
        >
          <ClipboardList size={13} />
          할 일 {taskCount > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${tab === 'tasks' ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>{taskCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab('alerts')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === 'alerts' ? 'bg-red-600 text-white' : 'text-slate-400'}`}
        >
          <AlertTriangle size={13} />
          알림 {alerts.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] text-white ${tab === 'alerts' ? 'bg-red-400' : 'bg-red-600'}`}>{alerts.length}</span>
          )}
        </button>
      </div>

      {tab === 'tasks' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {humanTasks.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-300">처리할 업무가 없습니다</div>
          )}
          {humanTasks.map(task => {
            const done = checkedTasks.has(task.id);
            return (
              <div key={task.id} className={`flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 transition-colors ${done ? 'opacity-40' : ''}`}>
                <button
                  onClick={() => toggleTask(task.id)}
                  className="shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                  style={done ? { background: '#059669', borderColor: '#059669' } : { borderColor: '#cbd5e1' }}
                >
                  {done && <Check size={12} className="text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium" style={{ color: done ? '#94a3b8' : '#0f172a', textDecoration: done ? 'line-through' : 'none' }}>{task.label}</span>
                  <div className="text-xs mt-0.5 text-slate-400">{task.where}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {alerts.map(a => {
            const href = a.type === 'strategy_change' ? '/ad-ops' : a.type === 'stock_low' ? '/purchase-orders' : a.type === 'minus_product' ? '/cleanup' : a.type === 'ad_high' ? '/ads-hub' : undefined;
            return (
              <div key={a.id} onClick={() => href && router.push(href)} className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-50 transition-colors ${href ? 'cursor-pointer' : ''}`}>
                <div className="mt-0.5">{alertIcon(a.type)}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm leading-relaxed text-slate-500">{a.message}</span>
                  {href && <span className="text-[10px] ml-1.5 text-blue-600">→</span>}
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
      )}
    </div>
  );
}

// ===== 대시보드 차트 =====
function DashboardChart({
  dailyTrend,
  aiActions,
  completedActions,
  executeAction,
  processingAction,
}: {
  dailyTrend: { date: string; revenue: number; profit: number; adCost: number; profitRate: number; adRate: number }[];
  aiActions: AiAction[];
  completedActions: Set<string>;
  executeAction: (action: AiAction) => void;
  processingAction: string | null;
}) {
  const [chartTab, setChartTab] = useState<'actions' | 'revenue' | 'ad'>('actions');
  const hasTrend = dailyTrend.length > 0;

  const tabs = [
    { key: 'actions' as const, label: 'AI 액션' },
    { key: 'revenue' as const, label: '매출 · 이익률' },
    { key: 'ad' as const, label: '광고비 · 비율' },
  ];

  const adChartData = dailyTrend.map(d => ({
    date: d.date,
    adCost: d.adCost,
    revenue: d.revenue,
    adRate: d.adRate,
  }));

  return (
    <div className="rounded-2xl overflow-hidden h-full flex flex-col bg-white border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div className="flex gap-1 rounded-lg p-0.5 bg-slate-100">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setChartTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all ${chartTab === t.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-slate-400">{chartTab === 'actions' ? 'AI 자동 실행' : '최근 30일'}</span>
      </div>

      {/* AI 액션 */}
      {chartTab === 'actions' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {aiActions.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-300">실행할 AI 액션이 없습니다</div>
          )}
          {aiActions.map(action => {
            const done = completedActions.has(action.id);
            const running = processingAction === action.id;
            const priorityColor = action.priority === 'urgent' ? 'text-red-500' : action.priority === 'high' ? 'text-amber-500' : 'text-slate-400';
            return (
              <div key={action.id} className={`flex items-center gap-3 p-3 rounded-xl border border-slate-100 transition-all ${done ? 'opacity-50' : 'hover:border-blue-200'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase ${priorityColor}`}>{action.priority}</span>
                    <span className="text-sm font-semibold text-slate-900 truncate">{action.label}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{action.desc}</div>
                </div>
                {done
                  ? <Check size={16} className="text-emerald-500 shrink-0" />
                  : (
                    <button
                      onClick={() => executeAction(action)}
                      disabled={running}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      {running ? <span className="animate-pulse">...</span> : <><Play size={11} /> 실행</>}
                    </button>
                  )
                }
              </div>
            );
          })}
        </div>
      )}

      {/* 매출 · 이익률 차트 */}
      {chartTab === 'revenue' && hasTrend && (
        <div className="p-5" style={{ minHeight: 350 }}>
          <div className="flex items-center gap-5 mb-3 text-[12px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />매출</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />이익률</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 opacity-70" />광고비율</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyTrend}>
              <defs>
                <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="gAdRate" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.08} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} interval={4} />
              <YAxis yAxisId="pct" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 'auto']} />
              <YAxis yAxisId="rev" orientation="right" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} domain={[0, 'auto']} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => {
                if (name === 'revenue') return [`₩${formatKRW(Number(v))}`, '매출'];
                return [`${Number(v).toFixed(1)}%`, name === 'profitRate' ? '이익률' : '광고비율'];
              }} />
              <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#gRevenue)" name="revenue" dot={false} />
              <Area yAxisId="pct" type="monotone" dataKey="profitRate" stroke="#10b981" strokeWidth={2} fill="url(#gProfit)" name="profitRate" dot={false} />
              <Area yAxisId="pct" type="monotone" dataKey="adRate" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gAdRate)" name="adRate" dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartTab === 'revenue' && !hasTrend && (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-300">트렌드 데이터가 없습니다</div>
      )}

      {/* 광고비 · 비율 차트 */}
      {chartTab === 'ad' && hasTrend && (
        <div className="p-5" style={{ minHeight: 350 }}>
          <div className="flex items-center gap-5 mb-3 text-[12px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />광고비</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />매출</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-500 inline-block" /> 광고비율</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={adChartData}>
              <defs>
                <linearGradient id="gAdCost" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.12} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                <linearGradient id="gAdRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} interval={4} />
              <YAxis yAxisId="won" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} domain={[0, 'auto']} />
              <YAxis yAxisId="pct" orientation="right" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} tickFormatter={(v: number) => `${v}%`} domain={[0, 'auto']} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }} formatter={(v: any, name: any) => {
                if (name === 'adRate') return [`${Number(v).toFixed(1)}%`, '광고비율'];
                return [`₩${formatKRW(Number(v))}`, name === 'adCost' ? '광고비' : '매출'];
              }} />
              <Area yAxisId="won" type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill="url(#gAdRev)" name="revenue" dot={false} />
              <Area yAxisId="won" type="monotone" dataKey="adCost" stroke="#f43f5e" strokeWidth={2} fill="url(#gAdCost)" name="adCost" dot={false} />
              <Area yAxisId="pct" type="monotone" dataKey="adRate" stroke="#6366f1" strokeWidth={1.5} fill="none" name="adRate" dot={false} strokeDasharray="5 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartTab === 'ad' && !hasTrend && (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-300">트렌드 데이터가 없습니다</div>
      )}
    </div>
  );
}

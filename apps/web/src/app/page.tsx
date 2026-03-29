'use client'

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  RefreshCcw,
  Bell,
  Zap,
  ClipboardList,
  Sparkles,
  Play,
  Check,
  ArrowUpRight,
  Wallet,
  Target,
  Megaphone,
  BarChart3,
  MinusCircle,
  Truck,
  ImageIcon,
  PackageX,
  Activity,
} from 'lucide-react';
import { formatKRW, formatPercent, getGradeColor, getProfitColor, cn, timeAgo } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

interface DashboardData {
  summary: {
    todayRevenue: number;
    todayOrders: number;
    monthlyRevenue: number;
    monthlyProfit: number;
    adRate: number;
    totalProducts: number;
    roas: number;
    ctr: number;
    adRevenue: number;
    totalAdSpend: number;
    prevMonthlyRevenue: number;
    prevMonthlyProfit: number;
    prevRoas: number;
    prevCtr: number;
    prevAdRevenue: number;
    prevTotalAdSpend: number;
    prevAdRate: number;
  };
  gradeCount: { A: number; B: number; C: number };
  alerts: Array<{ id: string; type: string; severity: string; title: string; message: string; createdAt: string }>;
  warnings: {
    minusProducts: number;
    lowProfitProducts: number;
    highAdProducts: number;
    needReorder: number;
  };
  topProducts: Array<{
    id: string;
    name: string;
    company: string;
    grade: string;
    revenue: number;
    netProfit: number;
    profitRate: number;
  }>;
  monthlyTrend: Array<{
    period: string;
    revenue: number;
    profit: number;
    adCost: number;
  }>;
}

interface TrendPoint {
  date: string;
  revenue: number;
  profit: number;
  adCost: number;
}

type TrendRange = '7d' | '30d' | '90d';

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

interface HealthSummary {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  notEvaluated: number;
  lastEvaluatedAt: string | null;
  topCritical: Array<{
    id: string;
    name: string;
    healthScore: number | null;
    abcGrade: string | null;
  }>;
}

function generateTasksAndActions(d: DashboardData): { tasks: HumanTask[]; actions: AiAction[] } {
  const tasks: HumanTask[] = [];
  const actions: AiAction[] = [];
  const w = d.warnings;

  if (w.highAdProducts > 0) {
    tasks.push({
      id: 'h-ad-bid', label: `광고비 초과 ${w.highAdProducts}개 — 입찰가 하향 조정`,
      detail: '쿠팡 광고센터에서 해당 상품 입찰가를 낮추거나 일예산 축소',
      where: '쿠팡 광고센터', priority: 'urgent',
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
      where: '매입처/1688', priority: 'high',
    });
  }
  if (d.summary.adRate > 12) {
    tasks.push({
      id: 'h-ad-rate', label: `전체 광고비율 ${d.summary.adRate}% — 비효율 캠페인 정리`,
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

  actions.push({
    id: 'recalc-grade', label: 'ABC 등급 재계산', desc: '최신 매출/마진/판매속도 기반 등급 재산정',
    priority: 'medium',
    apiCall: { url: `${API_BASE}/api/products/calculate-grades`, method: 'POST' },
  });
  if (w.minusProducts > 0 || w.lowProfitProducts > 0) {
    actions.push({
      id: 'view-cleanup', label: '정리대상 상품 분석 보기', desc: `적자 ${w.minusProducts}개 + 저이익 ${w.lowProfitProducts}개 원인 분석`,
      priority: 'high', href: '/cleanup',
    });
  }
  if (w.highAdProducts > 0) {
    actions.push({
      id: 'view-ad-strategy', label: '광고 전략 리포트 확인', desc: 'AI 추천 입찰가/일예산/액션 플랜 확인',
      priority: 'high', href: '/profit-loss',
    });
  }
  actions.push({
    id: 'view-profit', label: '손익 분석 리포트', desc: '상품별 손익 현황 상세 확인',
    priority: 'medium', href: '/profit-loss',
  });

  return { tasks, actions };
}

const alertIcon = (type: string) => {
  const m: Record<string, React.ReactNode> = {
    minus_product: <MinusCircle size={13} className="text-red-500 shrink-0" />,
    profit_low: <AlertTriangle size={13} className="text-orange-500 shrink-0" />,
    ad_high: <Megaphone size={13} className="text-amber-500 shrink-0" />,
    ad_overspend: <DollarSign size={13} className="text-red-500 shrink-0" />,
    stock_low: <Truck size={13} className="text-blue-500 shrink-0" />,
    thumbnail_drop: <ImageIcon size={13} className="text-purple-500 shrink-0" />,
    grade_change: <TrendingDown size={13} className="text-orange-500 shrink-0" />,
    defect_found: <PackageX size={13} className="text-red-500 shrink-0" />,
  };
  return m[type] || <AlertTriangle size={13} className="text-gray-400 shrink-0" />;
};

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [humanTasks, setHumanTasks] = useState<HumanTask[]>([]);
  const [aiActions, setAiActions] = useState<AiAction[]>([]);
  const [trendRange, setTrendRange] = useState<TrendRange>('30d');
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = JSON.parse(localStorage.getItem('dashboard-checked-tasks') || '{}');
      if (saved.date === new Date().toDateString()) {
        const map: Record<string, boolean> = {};
        ((saved.ids || []) as string[]).forEach(id => { map[id] = true; });
        return map;
      }
      return {};
    } catch { return {}; }
  });
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ids = Object.keys(checkedTasks).filter(k => checkedTasks[k]);
      localStorage.setItem('dashboard-checked-tasks', JSON.stringify({ date: new Date().toDateString(), ids }));
    }
  }, [checkedTasks]);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dashboard`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        const { tasks, actions } = generateTasksAndActions(json);
        setHumanTasks(tasks);
        setAiActions(actions);
      }
    } catch (err) {
      console.error('Error fetching dashboard', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrend = useCallback(async (range: TrendRange) => {
    setTrendLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/trend?range=${range}`);
      if (res.ok) {
        const json: TrendPoint[] = await res.json();
        setTrendData(json);
      }
    } catch (err) {
      console.error('Error fetching trend', err);
    } finally {
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    fetchTrend(trendRange);
  }, [trendRange, fetchTrend]);

  const fetchHealthSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rules/summary`);
      if (res.ok) {
        const json = await res.json();
        setHealthSummary(json);
      }
    } catch (err) {
      console.error('Error fetching health summary', err);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthSummary();
  }, [fetchHealthSummary]);

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      await fetch(`${API_BASE}/api/rules/evaluate`, { method: 'POST' });
      await fetchHealthSummary();
    } catch (err) {
      console.error('Error evaluating', err);
    } finally {
      setEvaluating(false);
    }
  };

  const toggleTask = (id: string) => {
    setCheckedTasks(prev => {
      const next = { ...prev };
      next[id] = !prev[id];
      return next;
    });
  };

  const markActionCompleted = (id: string) => {
    setCompletedActions(prev => ({ ...prev, [id]: true }));
  };

  const executeAction = async (action: AiAction) => {
    if (action.href && !action.apiCall) {
      markActionCompleted(action.id);
      return;
    }
    if (action.apiCall) {
      if (action.apiCall.url.includes('calculate-grades')) {
        if (!confirm('전체 상품의 ABC 등급을 재계산합니다. 계속하시겠습니까?')) return;
      }
      setProcessingAction(action.id);
      try {
        const res = await fetch(action.apiCall.url, {
          method: action.apiCall.method,
          headers: { 'Content-Type': 'application/json' },
          body: action.apiCall.body ? JSON.stringify(action.apiCall.body) : undefined,
        });
        const json = await res.json();
        if (json.success || json.updatedCount !== undefined) {
          markActionCompleted(action.id);
          fetchDashboard();
        } else if (json.error) {
          alert(`실행 실패: ${json.error}`);
        }
      } catch (e) {
        alert(`네트워크 오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      } finally {
        setProcessingAction(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">대시보드 데이터를 불러오는데 실패했습니다.</div>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">운영 대시보드</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-gray-400">{s.totalProducts}개 상품</span>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-400">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="월 매출" value={formatKRW(s.monthlyRevenue)} unit="원"
          icon={Wallet} bgColor="bg-blue-50 border-blue-200" accentColor="#2563eb"
          prevLabel={`${formatKRW(s.prevMonthlyRevenue)}원`}
        />
        <KpiCard
          label="월 순이익" value={formatKRW(s.monthlyProfit)} unit="원"
          icon={TrendingUp} bgColor="bg-emerald-50 border-emerald-200" accentColor="#059669"
          prevLabel={`${formatKRW(s.prevMonthlyProfit)}원`}
        />
        <KpiCard
          label="오늘 매출" value={formatKRW(s.todayRevenue)} unit="원"
          icon={DollarSign} bgColor="bg-amber-50 border-amber-200" accentColor="#d97706"
          subValue={`주문 ${formatKRW(s.todayOrders)}건`}
        />
        <KpiCard
          label="광고비율" value={String(s.adRate)} unit="%"
          icon={Megaphone}
          bgColor={s.adRate > 15 ? 'bg-red-50 border-red-200' : 'bg-violet-50 border-violet-200'}
          accentColor={s.adRate > 15 ? '#dc2626' : '#7c3aed'}
          prevLabel={`${s.prevAdRate}%`}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="ROAS" value={String(s.roas)} unit="%"
          icon={Target} bgColor="bg-purple-50 border-purple-200" accentColor="#9333ea"
          prevLabel={`${s.prevRoas}%`}
        />
        <KpiCard
          label="클릭률 (CTR)" value={String(s.ctr)} unit="%"
          icon={BarChart3} bgColor="bg-blue-50 border-blue-200" accentColor="#2563eb"
          prevLabel={`${s.prevCtr}%`}
        />
        <KpiCard
          label="광고 전환매출" value={formatKRW(s.adRevenue)} unit="원"
          icon={ShoppingCart} bgColor="bg-emerald-50 border-emerald-200" accentColor="#059669"
          prevLabel={`${formatKRW(s.prevAdRevenue)}원`}
        />
        <KpiCard
          label="광고비" value={formatKRW(s.totalAdSpend)} unit="원"
          icon={Megaphone} bgColor="bg-orange-50 border-orange-200" accentColor="#ea580c"
          prevLabel={`${formatKRW(s.prevTotalAdSpend)}원`}
        />
      </div>

      {healthLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-3/4" />
          </div>
        </div>
      ) : healthSummary ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-gray-500" />
              <h3 className="text-sm font-bold text-gray-900">상품 진단 현황</h3>
            </div>
            <div className="flex items-center gap-3">
              {healthSummary.lastEvaluatedAt && (
                <span className="text-xs text-gray-400">{timeAgo(healthSummary.lastEvaluatedAt)} 평가</span>
              )}
              <button
                onClick={handleEvaluate}
                disabled={evaluating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                <RefreshCcw size={12} className={evaluating ? 'animate-spin' : ''} />
                {evaluating ? '평가 중...' : '전체 평가'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-sm text-gray-700">정상 <strong className="text-green-700">{healthSummary.healthy}</strong>개</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-sm text-gray-700">주의 <strong className="text-amber-700">{healthSummary.warning}</strong>개</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-sm text-gray-700">위험 <strong className="text-red-700">{healthSummary.critical}</strong>개</span>
            </div>
          </div>
          {healthSummary.total > 0 && (
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex mb-4">
              <div className="bg-green-500 h-full" style={{ width: `${(healthSummary.healthy / healthSummary.total) * 100}%` }} />
              <div className="bg-amber-500 h-full" style={{ width: `${(healthSummary.warning / healthSummary.total) * 100}%` }} />
              <div className="bg-red-500 h-full" style={{ width: `${(healthSummary.critical / healthSummary.total) * 100}%` }} />
            </div>
          )}
          {healthSummary.topCritical && healthSummary.topCritical.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-400 mb-2">위험 상품 TOP {healthSummary.topCritical.length}</p>
              <div className="space-y-2">
                {healthSummary.topCritical.slice(0, 5).map((item) => (
                   <div key={item.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('shrink-0 px-2 py-0.5 rounded text-xs font-medium',
                        (item.healthScore ?? 0) < 40 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      )}>{item.healthScore ?? 0}</span>
                      <span className="text-sm text-gray-700 truncate">{item.name}</span>
                      {item.abcGrade && (
                        <span className="text-xs text-gray-400">{item.abcGrade}등급</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/products/${item.id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                        상세
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-center py-4">
            <p className="text-sm text-gray-400 mb-3">평가 데이터 없음</p>
            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {evaluating ? '평가 중...' : '지금 평가하기'}
            </button>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      {(() => {
        const rawData = trendData.length > 0
          ? trendData.map((d) => ({
              period: d.date.slice(5),
              revenue: d.revenue,
              profit: d.profit,
              adCost: d.adCost,
            }))
          : (data.monthlyTrend ?? []);
        if (rawData.length === 0) return null;

        const chartData = rawData.map(d => ({
          ...d,
          profitRate: d.revenue > 0 ? Math.round((d.profit / d.revenue) * 1000) / 10 : 0,
          adRate: d.revenue > 0 ? Math.round((d.adCost / d.revenue) * 1000) / 10 : 0,
        }));

        const rangeOptions: { value: TrendRange; label: string }[] = [
          { value: '7d', label: '7일' },
          { value: '30d', label: '30일' },
          { value: '90d', label: '90일' },
        ];

        return (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">매출 / 광고비 추이</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center rounded-lg border border-gray-200 p-0.5">
                  {rangeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTrendRange(opt.value)}
                      className={cn(
                        'px-3 py-1 text-xs font-semibold rounded-md transition-colors',
                        trendRange === opt.value
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-500 hover:text-gray-700'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" />매출</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />이익률</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" />광고비율</span>
                </div>
              </div>
            </div>
            <div className="px-4 py-4 relative">
              {trendLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              )}
              <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="adCostGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f3" vertical={false} />
                  <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={false} stroke="#9ca3af" />
                  <YAxis
                    yAxisId="left"
                    fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af"
                    tickFormatter={(v: number) => `${v}%`}
                    domain={[0, 'auto']}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af"
                    tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: unknown, name: unknown) => {
                      const n = String(name);
                      if (n === 'revenue') return [`₩${formatKRW(Number(value))}`, '매출'];
                      const labels: Record<string, string> = { profitRate: '이익률', adRate: '광고비율' };
                      return [`${Number(value).toFixed(1)}%`, labels[n] || n];
                    }}
                  />
                  <Area type="monotone" dataKey="revenue" yAxisId="right" stroke="#3b82f6" strokeWidth={2} fill="url(#revenueGrad)" name="revenue" dot={false} />
                  <Area type="monotone" dataKey="profitRate" yAxisId="left" stroke="#10b981" strokeWidth={2} fill="url(#profitGrad)" name="profitRate" dot={false} />
                  <Area type="monotone" dataKey="adRate" yAxisId="left" stroke="#f59e0b" strokeWidth={1.5} fill="url(#adCostGrad)" name="adRate" dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* 3-Column: 오늘 할 일 / AI 자동 실행 / 알림 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 오늘 할 일 */}
        <div className="rounded-xl border-2 border-orange-200 bg-orange-50/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-orange-100/60 border-b border-orange-200">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
                <ClipboardList size={15} className="text-white" />
              </div>
              <h3 className="text-sm font-bold text-orange-900">오늘 할 일</h3>
              <span className="text-xs font-semibold text-orange-600 bg-orange-200 px-2 py-0.5 rounded-full">
                {humanTasks.filter(t => !checkedTasks[t.id]).length}건 남음
              </span>
            </div>
          </div>
          <div className="divide-y divide-orange-100/50 max-h-[400px] overflow-y-auto">
            {humanTasks.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">처리할 업무가 없습니다</div>
            )}
            {humanTasks.map(task => {
              const done = !!checkedTasks[task.id];
              const pStyle = task.priority === 'urgent' ? 'bg-red-100 text-red-700' : task.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
              const pLabel = task.priority === 'urgent' ? '긴급' : task.priority === 'high' ? '높음' : '보통';
              return (
                <div key={task.id} className={cn('flex items-start gap-3 px-4 py-3 hover:bg-white/50 transition-colors', done && 'opacity-40')}>
                  <button onClick={() => toggleTask(task.id)} className={cn('shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors', done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-orange-400')}>
                    {done && <Check size={12} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('shrink-0 px-2 py-0.5 rounded text-xs font-semibold', pStyle)}>{pLabel}</span>
                      <span className={cn('text-sm font-semibold', done ? 'line-through text-gray-400' : 'text-gray-900')}>{task.label}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 leading-relaxed">{task.detail}</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{task.where}</span>
                      {task.href && (
                        <Link href={task.href} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-medium hover:bg-blue-100 transition-colors">
                          상세 확인 →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI 자동 실행 */}
        <div className="rounded-xl border-2 border-violet-200 bg-violet-50/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-violet-100/60 border-b border-violet-200">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-500 flex items-center justify-center">
                <Sparkles size={15} className="text-white" />
              </div>
              <h3 className="text-sm font-bold text-violet-900">AI 자동 실행</h3>
              <span className="text-xs font-semibold text-violet-600 bg-violet-200 px-2 py-0.5 rounded-full">
                {aiActions.filter(a => !completedActions[a.id]).length}건
              </span>
            </div>
          </div>
          <div className="divide-y divide-violet-100/50 max-h-[400px] overflow-y-auto">
            {aiActions.filter(a => !completedActions[a.id]).length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">모든 자동 액션 완료</div>
            )}
            {aiActions.filter(a => !completedActions[a.id]).map(action => {
              const isProcessing = processingAction === action.id;
              const pStyle = action.priority === 'urgent' ? 'bg-red-100 text-red-700' : action.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';
              const pLabel = action.priority === 'urgent' ? '긴급' : action.priority === 'high' ? '높음' : '보통';
              return (
                <div key={action.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/50 transition-colors">
                  <span className={cn('shrink-0 px-2 py-0.5 rounded text-xs font-semibold', pStyle)}>{pLabel}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{action.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{action.desc}</div>
                  </div>
                  {action.href && !action.apiCall ? (
                    <Link
                      href={action.href}
                      onClick={() => markActionCompleted(action.id)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                    >
                      <ArrowUpRight size={13} /> 확인
                    </Link>
                  ) : (
                    <button
                      onClick={() => executeAction(action)}
                      disabled={isProcessing}
                      className={cn(
                        'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                        isProcessing ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                      )}
                    >
                      {isProcessing ? (
                        <><span className="animate-spin inline-block w-3 h-3 border-2 border-gray-300 border-t-violet-500 rounded-full" /> 처리중</>
                      ) : (
                        <><Play size={13} /> 실행</>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 알림 */}
        <div className="rounded-xl border-2 border-red-200 bg-red-50/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-red-100/60 border-b border-red-200">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
                <Bell size={15} className="text-white" />
              </div>
              <h3 className="text-sm font-bold text-red-900">알림</h3>
              <span className="text-xs font-semibold text-white bg-red-500 px-2 py-0.5 rounded-full">{data.alerts.length}</span>
            </div>
          </div>
          <div className="divide-y divide-red-100/50 max-h-[400px] overflow-y-auto">
            {data.alerts.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-white/50 transition-colors">
                <div className="mt-0.5">{alertIcon(a.type)}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700 leading-relaxed">{a.title || a.message}</span>
                  {a.title && a.message && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.message}</p>
                  )}
                </div>
                {a.createdAt && (
                  <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{timeAgo(a.createdAt)}</span>
                )}
              </div>
            ))}
            {data.alerts.length === 0 && <div className="px-4 py-8 text-center text-xs text-gray-400">알림 없음</div>}
          </div>
        </div>
      </div>

      {/* ABC Grade Cards */}
      <div className="grid grid-cols-3 gap-3">
        {(['A', 'B', 'C'] as const).map(g => {
          const count = data.gradeCount[g] || 0;
          const pct = s.totalProducts > 0 ? Math.round((count / s.totalProducts) * 100) : 0;
          const config = {
            A: { left: 'border-l-green-500', color: 'text-green-600', bar: 'bg-green-500', label: '핵심상품', href: '/core-products' },
            B: { left: 'border-l-yellow-500', color: 'text-yellow-600', bar: 'bg-yellow-500', label: '성장상품', href: '/products?grade=B' },
            C: { left: 'border-l-red-500', color: 'text-red-600', bar: 'bg-red-500', label: '정리대상', href: '/cleanup' },
          }[g];
          return (
            <Link key={g} href={config.href} className={cn('bg-white rounded-xl border border-gray-200 border-l-4 p-4 hover:shadow-md transition-all', config.left)}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-sm font-bold', config.color)}>{g}등급</span>
                <span className="text-xs text-gray-400">{config.label}</span>
              </div>
              <div className={cn('text-2xl font-extrabold tabular-nums', config.color)}>{count}<span className="text-sm ml-0.5">개</span></div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', config.bar)} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-gray-400 mt-1">{pct}% of {s.totalProducts}</div>
            </Link>
          );
        })}
      </div>

      {/* Warning Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/cleanup" className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-red-500 p-4 hover:shadow-md transition-all">
          <div className="text-sm font-bold text-red-600 mb-1">적자 상품</div>
          <div className="text-2xl font-extrabold tabular-nums text-red-600">{data.warnings.minusProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs text-gray-400 mt-1">이익률 마이너스</div>
        </Link>
        <Link href="/cleanup" className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-orange-500 p-4 hover:shadow-md transition-all">
          <div className="text-sm font-bold text-orange-600 mb-1">저이익 상품</div>
          <div className="text-2xl font-extrabold tabular-nums text-orange-600">{data.warnings.lowProfitProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs text-gray-400 mt-1">이익률 3% 이하</div>
        </Link>
        <Link href="/profit-loss" className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-amber-500 p-4 hover:shadow-md transition-all">
          <div className="text-sm font-bold text-amber-600 mb-1">광고비 초과</div>
          <div className="text-2xl font-extrabold tabular-nums text-amber-600">{data.warnings.highAdProducts}<span className="text-sm ml-0.5">개</span></div>
          <div className="text-xs text-gray-400 mt-1">광고비율 15% 초과</div>
        </Link>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <BarChart3 size={15} className="text-gray-400" />
            <h3 className="text-sm font-bold text-gray-900">Top Revenue Products</h3>
          </div>
          <Link href="/products" className="text-xs text-blue-600 font-medium hover:text-blue-700">
            전체 보기 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium w-8">#</th>
                <th className="px-4 py-3 font-medium w-8">등급</th>
                <th className="px-4 py-3 font-medium">상품명</th>
                <th className="px-4 py-3 font-medium text-right">매출</th>
                <th className="px-4 py-3 font-medium text-right">순이익</th>
                <th className="px-4 py-3 font-medium text-right">이익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.topProducts.map((product, i) => (
                <tr key={product.id} className="bg-white hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold', getGradeColor(product.grade))}>
                      {product.grade}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 line-clamp-1 max-w-[300px]">{product.name}</p>
                    {product.company && <p className="text-xs text-gray-500">{product.company}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-gray-900 tabular-nums">
                    ₩{formatKRW(product.revenue)}
                  </td>
                  <td className={cn('px-4 py-3 whitespace-nowrap text-right font-medium tabular-nums', getProfitColor(product.profitRate))}>
                    ₩{formatKRW(product.netProfit)}
                  </td>
                  <td className={cn('px-4 py-3 whitespace-nowrap text-right font-semibold tabular-nums', getProfitColor(product.profitRate))}>
                    {formatPercent(product.profitRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* KPI Card with colored background */
function KpiCard({ label, value, unit, icon: Icon, bgColor, accentColor, subValue, prevLabel }: {
  label: string; value: string; unit: string; icon: typeof TrendingUp; bgColor: string; accentColor: string; subValue?: string; prevLabel?: string;
}) {
  return (
    <div className={cn('rounded-xl border transition-all hover:shadow-md', bgColor)}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon size={16} style={{ color: accentColor }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentColor }}>{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tabular-nums tracking-tight" style={{ color: accentColor }}>{value}</span>
          <span className="text-sm font-semibold" style={{ color: accentColor, opacity: 0.6 }}>{unit}</span>
        </div>
        {subValue && <div className="text-xs text-gray-500 mt-1.5">{subValue}</div>}
        {prevLabel && <div className="text-xs text-gray-400 mt-1">이전 {prevLabel}</div>}
      </div>
    </div>
  );
}

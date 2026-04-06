'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  RefreshCw, Megaphone, Sparkles, GripVertical, XCircle, Brain,
  TrendingUp, TrendingDown, AlertTriangle, ChevronDown, ShoppingCart,
  Zap, ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown,
  Minus, BarChart3, LayoutGrid, ListOrdered, Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatKRW, formatPercent, getGradeColor } from '@/lib/utils';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import { apiClient } from '@/lib/api-client';

// ===== Types =====
interface CampaignData {
  campaignName: string; adSpend: number; adRevenue: number; totalRevenue: number;
  impressions: number; clicks: number; ctr: number; conversions: number;
  orders: number; roas: number; conversionRate: number; budget: number; todaySpend: number;
}
interface ProductData {
  productName: string; vendorItemId: string | null; imageUrl?: string;
  onOff: string | null; status: string | null; keyword: string | null;
  adSpend: number; adRevenue: number; impressions: number; clicks: number;
  ctr: number; adConversions: number; conversionRate: number; roas: number;
}
interface AdRuleRec {
  name: string; grade: string; rule: string; action: string; priority: string; roas: number; spend: number;
}
interface StrategyAction {
  productId: string; productName: string; grade: string; tier: string | null;
  currentRoas: number; currentCtr: number;
  recommendedAction: string; actionPriority: 'urgent' | 'high' | 'medium' | 'low';
  actionCategory: string; reason: string;
}
interface AdProduct {
  id: string; name: string; sku: string; company: string; grade: string;
  adTier: string; spend: number; impressions: number; clicks: number;
  conversions: number; adRevenue: number; ctr: number; convRate: number;
  roas: number; acos: number; adRate: number; revenue: number;
  netProfit: number; profitRate: number;
}
interface AdSummary {
  totalSpend: number; totalAdRevenue: number; totalRevenue: number;
  overallAdRate: number; overallRoas: number; highAdCount: number;
  gradeSpend: Record<string, number>;
  tierSpend: Record<string, number>;
  gradeSpendPercent: Record<string, number>;
}
interface StrategyData {
  actions: StrategyAction[];
  budgetAllocation: { grade: string; currentPercent: number; targetPercent: number; gap: number }[];
  keyMetrics: { totalAdSpend: number; totalAdRevenue: number; overallRoas: number };
  adIssues: { zeroConversion: number; lowRoas: number; cGradeHighTier: number; aGradeNoAd: number };
}

type TabKey = 'overview' | 'strategy' | 'campaigns' | 'products';

const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'overview', label: '개요', icon: LayoutGrid },
  { key: 'strategy', label: 'AI 전략', icon: Sparkles },
  { key: 'campaigns', label: '캠페인', icon: Megaphone },
  { key: 'products', label: '상품 현황', icon: Package },
];

// 벤치마크 상태 스타일
const BENCH_STATUS: Record<string, { bg: string; text: string; label: string; dot: string; cardBg: string; cardBorder: string }> = {
  excellent: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: '최우수', dot: 'bg-emerald-500', cardBg: 'bg-emerald-50/60', cardBorder: 'border-emerald-300' },
  good: { bg: 'bg-blue-50', text: 'text-blue-700', label: '우수', dot: 'bg-blue-500', cardBg: 'bg-blue-50/60', cardBorder: 'border-blue-300' },
  average: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: '평균', dot: 'bg-yellow-500', cardBg: 'bg-amber-50/40', cardBorder: 'border-amber-300' },
  below: { bg: 'bg-orange-50', text: 'text-orange-700', label: '미달', dot: 'bg-orange-500', cardBg: 'bg-orange-50/60', cardBorder: 'border-orange-300' },
  poor: { bg: 'bg-red-50', text: 'text-red-700', label: '위험', dot: 'bg-red-500', cardBg: 'bg-red-50/60', cardBorder: 'border-red-300' },
};

export default function AdOpsPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [period, setPeriod] = useState('14d');
  const [totalKpi, setTotalKpi] = useState<Record<string, number>>({});
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [campaignOrder, setCampaignOrder] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [rules, setRules] = useState<AdRuleRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [wingKpis, setWingKpis] = useState<Record<string, string>>({});
  const [prodPage, setProdPage] = useState(1);
  const [prodPageSize] = useState(20);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<StrategyData | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [strategyCards, setStrategyCards] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [trends, setTrends] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [benchmark, setBenchmark] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wingAdData, setWingAdData] = useState<any>(null);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [adProducts, setAdProducts] = useState<AdProduct[]>([]);
  const [adSummary, setAdSummary] = useState<AdSummary | null>(null);
  const [adFilter, setAdFilter] = useState('all');
  const [adProductPage, setAdProductPage] = useState(1);
  const [adProductPageSize] = useState(20);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const days = period === 'month' ? 30 : period === '14d' ? 14 : 7;
    const campPeriod = period === 'month' ? '30d' : '7d';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [campRes, rulesRes, extRes, stratRes, adsRes, dashRes] = await Promise.all([
        apiClient.get<any>(`/api/ads/campaigns?period=${campPeriod}`),
        apiClient.get<any>(`/api/ads/strategy/rules?days=${days}`),
        apiClient.get<any>('/api/ads/extension/status'),
        apiClient.get<any>(`/api/ads/strategy/plan?days=${days}`).catch(() => null),
        apiClient.get<any>(`/api/ads?days=${days}`).catch(() => null),
        apiClient.get<any>('/api/dashboard?range=month').catch(() => null),
      ]);
      // Wing 실데이터 우선, 없으면 캠페인 데이터 폴백
      const wingAd = dashRes?.trafficKpi?.adSummary;
      if (wingAd) setWingAdData(wingAd);
      setTotalKpi(campRes.totalKpi || {});
      const sorted = (campRes.campaigns || []).sort((a: CampaignData, b: CampaignData) => {
        if (b.adRevenue !== a.adRevenue) return b.adRevenue - a.adRevenue;
        if (b.roas !== a.roas) return b.roas - a.roas;
        return b.clicks - a.clicks;
      });
      setCampaigns(sorted);
      setCampaignOrder(sorted.map((c: CampaignData) => c.campaignName));
      setRules(rulesRes.recommendations || []);
      setWingKpis(extRes.wing?.kpis || {});
      if (stratRes?.success) setStrategy(stratRes);
      if (adsRes?.products) { setAdProducts(adsRes.products); setAdSummary(adsRes.summary); }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [recRes, trendRes, benchRes] = await Promise.all([
          apiClient.get<any>(`/api/ads/strategy/recommend?days=${days}`),
          apiClient.get<any>(`/api/ads/campaigns/trends?days=${days}`),
          apiClient.get<any>(`/api/ads/benchmark?days=${days}`),
        ]);
        setStrategyCards(recRes.cards || []);
        if (trendRes.daily) setTrends(trendRes);
        if (benchRes.success) setBenchmark(benchRes);
      } catch { /* */ }
    } catch (err) {
      toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
      console.error(err);
    }
    setLoading(false);
  }, [period]);

  const fetchCampaignProducts = async (name: string) => {
    setSelectedCampaign(name);
    setProdPage(1);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await apiClient.get<any>(`/api/ads/campaigns?campaign=${encodeURIComponent(name)}&period=${period}`);
      setProducts(json.products || []);
    } catch { setProducts([]); }
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const newOrder = [...campaignOrder];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(idx, 0, moved);
    setCampaignOrder(newOrder);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const orderedCampaigns = campaignOrder
    .map(name => campaigns.find(c => c.campaignName === name))
    .filter(Boolean) as CampaignData[];

  const roas = totalKpi.roas || 0;
  const urgentCount = rules.filter(r => r.priority === 'urgent').length;

  const camp = campaigns.find(c => c.campaignName === selectedCampaign);
  const totalPages = Math.ceil(products.length / prodPageSize);
  const pagedProducts = products.slice((prodPage - 1) * prodPageSize, prodPage * prodPageSize);

  // Ad products filtering
  const filteredAd = useMemo(() => adProducts.filter(p => {
    if (adFilter === 'high') return p.adRate > 15;
    if (adFilter === 'A' || adFilter === 'B' || adFilter === 'C') return p.grade === adFilter;
    if (adFilter === '1차' || adFilter === '2차' || adFilter === '3차') return p.adTier === adFilter;
    return true;
  }), [adProducts, adFilter]);
  const totalAdPages = Math.ceil(filteredAd.length / adProductPageSize);
  const pagedAd = filteredAd.slice((adProductPage - 1) * adProductPageSize, adProductPage * adProductPageSize);

  if (loading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="space-y-5">
      {/* ════════ 헤더 ════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Brain size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">광고 전략 AI</h1>
            <p className="text-[13px] text-slate-400">실시간 데이터 기반 ABC 등급 분석 · 자동 전략 제안</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {urgentCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse bg-red-50 text-red-600 border border-red-600">
              <AlertTriangle size={13} /> 긴급 {urgentCount}건
            </span>
          )}
          <div className="flex rounded-lg p-0.5 bg-slate-100">
            {[{ key: '7d', label: '7일' }, { key: '14d', label: '14일' }, { key: 'month', label: '이번달' }].map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${period === p.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={fetchData} className="p-2.5 rounded-lg transition-colors text-slate-400" title="새로고침">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ════════ KPI + 목표치 ════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(() => {
          // Wing 실데이터 파싱 (K/M 단위 변환)
          const parseWing = (v: string | null | undefined) => {
            if (!v) return 0;
            const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
            if (String(v).includes('M')) return n * 1000000;
            if (String(v).includes('K')) return n * 1000;
            return n;
          };
          const adSpend = wingAdData?.adSpend ? parseWing(wingAdData.adSpend) : (totalKpi.adSpend || 0);
          const adRevenue = wingAdData?.adGmv ? parseWing(wingAdData.adGmv) : (totalKpi.adRevenue || 0);
          const wingRoas = wingAdData?.roas ? parseFloat(wingAdData.roas) : roas;
          const clicks = totalKpi.clicks || 0;
          const conversions = totalKpi.conversions || 0;
          const cvr = clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0;
          const cpc = clicks > 0 ? Math.round(adSpend / clicks) : 0;
          const adRate = adRevenue > 0 ? Math.round((adSpend / adRevenue) * 10000) / 100 : 0;

          const kpis = [
            { label: '전환 매출', value: formatKRW(adRevenue), unit: '원', current: adRevenue, goal: 2000000, goalLabel: '목표 200만원', invertGoal: false, accentColor: '#2563eb', icon: TrendingUp, avg: null },
            { label: '집행 광고비', value: formatKRW(adSpend), unit: '원', current: adSpend, goal: 500000, goalLabel: '목표 50만원 이하', invertGoal: true, accentColor: '#059669', icon: Megaphone, avg: null },
            { label: 'ROAS', value: String(wingRoas), unit: '%', current: wingRoas, goal: 400, goalLabel: '목표 400%', invertGoal: false, accentColor: '#733de5', icon: BarChart3, avg: 350 },
            { label: 'CTR', value: String(totalKpi.ctr || 0), unit: '%', current: totalKpi.ctr || 0, goal: 0.3, goalLabel: '목표 0.3%', invertGoal: false, accentColor: '#dc2626', icon: Zap, avg: 0.3 },
          ];
          const renderKpiCard = (kpi: typeof kpis[0]) => {
            const pct = kpi.invertGoal
              ? (kpi.goal > 0 ? Math.max(0, Math.min(100, ((kpi.goal * 2 - kpi.current) / kpi.goal) * 100)) : 0)
              : (kpi.goal > 0 ? Math.min((kpi.current / kpi.goal) * 100, 100) : 0);
            const achieved = kpi.invertGoal ? kpi.current <= kpi.goal : kpi.current >= kpi.goal;
            const Icon = kpi.icon;
            const avgDiff = kpi.avg !== null ? kpi.current - kpi.avg : null;
            const avgBetter = kpi.avg !== null ? (kpi.invertGoal ? kpi.current <= kpi.avg : kpi.current >= kpi.avg) : null;
            return (
              <div key={kpi.label} className="rounded-2xl p-4 transition-all hover:shadow-lg bg-white shadow-md border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} style={{ color: kpi.accentColor }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: kpi.accentColor }}>{kpi.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold tabular-nums" style={{ color: kpi.accentColor }}>{kpi.value}</span>
                  <span className="text-base font-semibold" style={{ color: kpi.accentColor, opacity: 0.6 }}>{kpi.unit}</span>
                </div>
                {kpi.avg !== null && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-slate-400">업계 평균 {kpi.avg}{kpi.unit}</span>
                    {avgDiff !== null && avgDiff !== 0 && (
                      <span className="text-[11px] font-bold" style={{ color: avgBetter ? '#059669' : '#dc2626' }}>
                        {avgBetter ? '▲' : '▼'} {Math.abs(Math.round(avgDiff * 100) / 100)}{kpi.unit === '원' ? '원' : '%p'}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${kpi.accentColor}20` }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px]" style={{ color: `${kpi.accentColor}99` }}>{kpi.goalLabel}</span>
                    <span className="text-[12px] font-bold" style={{ color: kpi.accentColor }}>{achieved ? '달성' : `${Math.round(pct)}%`}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${kpi.accentColor}15` }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: kpi.accentColor }} />
                  </div>
                </div>
              </div>
            );
          };
          return <>{kpis.map(renderKpiCard)}</>;
        })()}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(() => {
          const parseWing2 = (v: string | null | undefined) => { if (!v) return 0; const n = parseFloat(String(v).replace(/[^\d.]/g, '')); if (String(v).includes('M')) return n * 1000000; if (String(v).includes('K')) return n * 1000; return n; };
          const adSpend2 = wingAdData?.adSpend ? parseWing2(wingAdData.adSpend) : (totalKpi.adSpend || 0);
          const adRevenue2 = wingAdData?.adGmv ? parseWing2(wingAdData.adGmv) : (totalKpi.adRevenue || 0);
          const clicks2 = totalKpi.clicks || 0;
          const conversions2 = totalKpi.conversions || 0;
          const cvr2 = clicks2 > 0 ? Math.round((conversions2 / clicks2) * 10000) / 100 : 0;
          const cpc2 = clicks2 > 0 ? Math.round(adSpend2 / clicks2) : 0;
          const adRate2 = adRevenue2 > 0 ? Math.round((adSpend2 / adRevenue2) * 10000) / 100 : 0;
          const kpis2 = [
            { label: '전환수', value: String(conversions2), unit: '건', current: conversions2, goal: 100, goalLabel: '목표 100건', invertGoal: false, accentColor: '#2563eb', icon: ShoppingCart, avg: null },
            { label: 'CVR', value: String(cvr2), unit: '%', current: cvr2, goal: 8, goalLabel: '목표 8%', invertGoal: false, accentColor: '#059669', icon: TrendingUp, avg: 8 },
            { label: 'CPC', value: formatKRW(cpc2), unit: '원', current: cpc2, goal: 300, goalLabel: '목표 300원 이하', invertGoal: true, accentColor: '#733de5', icon: Zap, avg: 500 },
            { label: '광고비율', value: String(adRate2), unit: '%', current: adRate2, goal: 10, goalLabel: '목표 10% 이하', invertGoal: true, accentColor: '#dc2626', icon: Megaphone, avg: 10 },
          ];
          return kpis2.map(kpi => {
            const pct = kpi.invertGoal
              ? (kpi.goal > 0 ? Math.max(0, Math.min(100, ((kpi.goal * 2 - kpi.current) / kpi.goal) * 100)) : 0)
              : (kpi.goal > 0 ? Math.min((kpi.current / kpi.goal) * 100, 100) : 0);
            const achieved = kpi.invertGoal ? kpi.current <= kpi.goal : kpi.current >= kpi.goal;
            const Icon = kpi.icon;
            const avgDiff = kpi.avg !== null ? kpi.current - kpi.avg : null;
            const avgBetter = kpi.avg !== null ? (kpi.invertGoal ? kpi.current <= kpi.avg : kpi.current >= kpi.avg) : null;
            return (
              <div key={kpi.label} className="rounded-2xl p-4 transition-all hover:shadow-lg bg-white shadow-md border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} style={{ color: kpi.accentColor }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: kpi.accentColor }}>{kpi.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold tabular-nums" style={{ color: kpi.accentColor }}>{kpi.value}</span>
                  <span className="text-base font-semibold" style={{ color: kpi.accentColor, opacity: 0.6 }}>{kpi.unit}</span>
                </div>
                {kpi.avg !== null && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-slate-400">업계 평균 {kpi.avg}{kpi.unit}</span>
                    {avgDiff !== null && avgDiff !== 0 && (
                      <span className="text-[11px] font-bold" style={{ color: avgBetter ? '#059669' : '#dc2626' }}>
                        {avgBetter ? '▲' : '▼'} {Math.abs(Math.round(avgDiff * 100) / 100)}{kpi.unit === '원' ? '원' : '%p'}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${kpi.accentColor}20` }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px]" style={{ color: `${kpi.accentColor}99` }}>{kpi.goalLabel}</span>
                    <span className="text-[12px] font-bold" style={{ color: kpi.accentColor }}>{achieved ? '달성' : `${Math.round(pct)}%`}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${kpi.accentColor}15` }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: kpi.accentColor }} />
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* ════════ 탭 네비게이션 ════════ */}
      <div className="flex gap-2">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg border transition-all ${isActive ? 'text-white border-blue-600 bg-blue-600' : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-500'}`}>
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* TAB: 개요 */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-5">

          {/* 차트 + AI 패널 (나란히, 4등분 중 3:1) */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

            {/* 왼쪽 3칸: 통합 차트 */}
            {trends?.daily?.length > 0 ? (
              <div className="lg:col-span-3 rounded-xl border border-slate-100 p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[16px] font-bold text-slate-900">광고비 · 전환매출 · ROAS 추이</h3>
                  <div className="flex items-center gap-5 text-[12px] text-slate-400">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300" />광고비</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300" />전환매출</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-600 inline-block rounded" />ROAS</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block rounded" style={{ borderTop: '1px dashed' }} />손익분기</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={440}>
                  <ComposedChart data={trends.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="won" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 10000 ? `${Math.round(v / 10000)}만` : v >= 1000 ? `${Math.round(v / 1000)}천` : String(v)} />
                    <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(value: any, name: any) => {
                      if (name === 'roas') return [`${value}%`, 'ROAS'];
                      if (name === 'breakeven') return [`300%`, '손익분기'];
                      return [`${formatKRW(Number(value))}원`, name === 'spend' ? '광고비' : '전환매출'];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    }} labelFormatter={(label: any) => `${label}일`} />
                    <Bar yAxisId="won" dataKey="spend" fill="#93c5fd" radius={[3, 3, 0, 0]} name="spend" barSize={12} />
                    <Bar yAxisId="won" dataKey="revenue" fill="#6ee7b7" radius={[3, 3, 0, 0]} name="revenue" barSize={12} />
                    <Line yAxisId="pct" type="monotone" dataKey="roas" stroke="#7c3aed" strokeWidth={2.5} dot={{ fill: '#7c3aed', r: 3, strokeWidth: 0 }} name="roas" />
                    <Line yAxisId="pct" type="monotone" dataKey={() => 300} stroke="#ef4444" strokeWidth={1} strokeDasharray="6 4" dot={false} name="breakeven" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="lg:col-span-3 rounded-xl border border-slate-100 p-6 flex items-center justify-center bg-white" style={{ minHeight: 200 }}>
                <span className="text-[14px] text-slate-400">차트 데이터 수집 중...</span>
              </div>
            )}

            {/* 오른쪽 1칸: 광고 AI 액션 / 해야할 일 탭 */}
            <AdActionPanel rules={rules} strategy={strategy} />
          </div>

          {/* 아이템위너 · 노출 현황 (차트 아래) */}
          {Object.keys(wingKpis).length > 0 && (
            <div className="rounded-xl border border-slate-100 p-5 bg-white">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={16} className="text-amber-500" />
                <h2 className="text-[16px] font-bold text-slate-900">아이템위너 · 노출 현황</h2>
                <span className="text-[13px] text-slate-400">아이템위너 미보유 시 광고 전환율 급감</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {Object.entries(wingKpis).map(([label, value]) => {
                  const isWarning = label.includes('노출제한') || label.includes('아이템위너 아닌') || label.includes('미보유');
                  const hasIssue = isWarning && parseInt(String(value)) > 0;
                  return (
                    <div key={label} className={`rounded-lg border p-4 text-center ${hasIssue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className={`text-2xl font-extrabold tabular-nums ${hasIssue ? 'text-red-600' : 'text-slate-900'}`}>{value}</div>
                      <div className={`text-[13px] mt-1 font-medium ${hasIssue ? 'text-red-500' : 'text-slate-500'}`}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ABC 예산 배분 */}
          {trends?.daily?.length > 0 && trends.budgetAllocation && (
            <div className="rounded-xl border border-slate-100 p-5 w-full lg:w-1/2 bg-white">
              <h3 className="text-[15px] font-bold text-slate-900 mb-4">ABC 등급별 예산 배분</h3>
              <div className="space-y-4">
                {trends.budgetAllocation.map((b: { grade: string; spend: number; pct: number; target: number; roas: number }) => {
                  const gap = b.pct - b.target;
                  return (
                    <div key={b.grade}>
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className={`w-7 h-7 rounded-md flex items-center justify-center text-sm font-black text-white ${b.grade === 'A' ? 'bg-emerald-500' : b.grade === 'B' ? 'bg-amber-500' : 'bg-red-500'}`}>{b.grade}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[13px]">
                            <span className="font-semibold text-slate-800">{b.pct}%<span className="text-slate-400 font-normal ml-1">/ {b.target}%</span></span>
                            <span className={`text-[12px] font-bold ${gap > 5 ? 'text-red-500' : gap < -5 ? 'text-amber-600' : 'text-emerald-600'}`}>{gap > 5 ? `+${gap}%p` : gap < -5 ? `${gap}%p` : '적정'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${b.grade === 'A' ? 'bg-emerald-500' : b.grade === 'B' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
                      </div>
                      <div className="flex justify-between mt-1 text-[11px] text-slate-400">
                        <span>{formatKRW(b.spend)}원</span><span>ROAS {b.roas}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: AI 전략 */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'strategy' && (
        <div className="space-y-5">
          {/* ABC 등급별 전략 카드 */}
          {(() => {
            const gradeConfigs = [
              { grade: 'A', title: '핵심 상품', subtitle: '공격 확장', desc: '예산 증액, 키워드 확장, 입찰가 인상', pills: ['일예산 20%↑', '1차 키워드 승격', '입찰가 인상'], border: 'border-emerald-300', bg: 'bg-gradient-to-br from-emerald-50 to-green-50/50', pillBg: 'bg-emerald-100 text-emerald-700', moreColor: 'text-emerald-600', target: 60, ring: 'ring-emerald-400', headerGrad: 'from-emerald-600 to-green-600' },
              { grade: 'B', title: '성장 후보', subtitle: '최적화 집중', desc: '키워드 정리, 입찰 조정, 썸네일 테스트', pills: ['전환0 키워드 OFF', '입찰가 15%↓', '롱테일 확장'], border: 'border-amber-300', bg: 'bg-gradient-to-br from-amber-50 to-yellow-50/50', pillBg: 'bg-amber-100 text-amber-700', moreColor: 'text-amber-600', target: 30, ring: 'ring-amber-400', headerGrad: 'from-amber-500 to-yellow-500' },
              { grade: 'C', title: '정리 대상', subtitle: '손절 · 재구성', desc: '예산 축소, 캠페인 OFF, 가격 재검토', pills: ['일예산 축소', '캠페인 OFF', '가격 재검토'], border: 'border-red-300', bg: 'bg-gradient-to-br from-red-50 to-pink-50/50', pillBg: 'bg-red-100 text-red-700', moreColor: 'text-red-600', target: 10, ring: 'ring-red-400', headerGrad: 'from-red-500 to-pink-500' },
            ];
            const totalSpend = rules.reduce((s, r) => s + (r.spend || 0), 0);
            const gradeData = gradeConfigs.map(cfg => {
              const gradeRules = cfg.grade === 'A' ? rules.filter(r => r.grade === 'A' || (r.roas >= 480 && r.spend > 0)) : cfg.grade === 'B' ? rules.filter(r => r.grade === 'B' || (r.roas >= 100 && r.roas < 480 && r.spend > 0)) : rules.filter(r => (r.grade === 'C' || r.roas < 100) && r.spend > 0);
              const gradeSpend = gradeRules.reduce((s, r) => s + (r.spend || 0), 0);
              const pct = totalSpend > 0 ? Math.round((gradeSpend / totalSpend) * 100) : 0;
              const strategyActions = (strategy?.actions || []).filter(a => a.grade === cfg.grade);
              return { ...cfg, rules: gradeRules, pct, strategyActions };
            });

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {gradeData.map(g => {
                    const isSelected = selectedGrade === g.grade;
                    const totalCount = g.rules.length + g.strategyActions.length;
                    const urgents = g.rules.filter(r => r.priority === 'urgent').length;
                    return (
                      <button key={g.grade} onClick={() => setSelectedGrade(isSelected ? null : g.grade)}
                        className={`text-left rounded-2xl border-2 ${g.border} ${g.bg} overflow-hidden transition-all duration-200 ${isSelected ? `ring-2 ${g.ring} shadow-xl scale-[1.01]` : 'hover:shadow-lg hover:scale-[1.005]'}`}>
                        <div className={`bg-gradient-to-r ${g.headerGrad} px-4 py-2.5 flex items-center justify-between`}>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-white">{g.grade}</span>
                            <div>
                              <div className="text-[13px] font-bold text-white leading-tight">{g.title}</div>
                              <div className="text-[10px] text-white/80">{g.subtitle}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-black text-white">{totalCount}</div>
                            <div className="text-[9px] text-white/80">제안</div>
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="mb-3">
                            <div className="flex justify-between text-[11px] mb-1"><span className="text-slate-600">예산 비중</span><span className="font-bold text-slate-800">{g.pct}% <span className="font-normal text-slate-400">/ {g.target}%</span></span></div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${g.headerGrad}`} style={{ width: `${Math.min(g.pct, 100)}%` }} /></div>
                          </div>
                          <p className="text-[12px] text-slate-600 mb-2">{g.desc}</p>
                          <div className="flex flex-wrap gap-1 mb-3">
                            {g.pills.map(pill => <span key={pill} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${g.pillBg}`}>{pill}</span>)}
                          </div>
                          {g.rules.slice(0, 2).map((r, i) => (
                            <div key={`r-${i}`} className="flex items-start justify-between gap-2 bg-transparent/80 rounded-lg px-2.5 py-1.5 mb-1.5">
                              <div className="min-w-0"><div className="text-[12px] font-bold text-slate-800 truncate">{r.name?.substring(0, 25)}</div><div className="text-[11px] text-slate-500 truncate">{r.action?.substring(0, 40)}</div></div>
                              {(r.priority === 'urgent' || r.priority === 'high') && <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${r.priority === 'urgent' ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-700'}`}>{r.priority === 'urgent' ? '긴급' : '높음'}</span>}
                            </div>
                          ))}
                          {totalCount > 0 && <div className={`flex items-center justify-center gap-1 mt-2 text-[11px] font-semibold ${g.moreColor}`}>{isSelected ? '접기' : `전체 ${totalCount}건 보기`}<ChevronDown size={13} className={`transition-transform ${isSelected ? 'rotate-180' : ''}`} /></div>}
                          {urgents > 0 && <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600"><AlertTriangle size={11} /> 긴급 {urgents}건</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 선택 등급 상세 */}
                {selectedGrade && (() => {
                  const g = gradeData.find(d => d.grade === selectedGrade);
                  if (!g) return null;
                  const allItems = [
                    ...g.rules.map(r => ({ type: 'rule' as const, name: r.name, action: r.action, priority: r.priority, roas: r.roas })),
                    ...g.strategyActions.map(a => ({ type: 'strategy' as const, name: a.productName, action: a.recommendedAction, priority: a.actionPriority, roas: a.currentRoas, reason: a.reason, tier: a.tier })),
                  ];
                  const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
                  allItems.sort((a, b) => (priOrder[a.priority as keyof typeof priOrder] || 3) - (priOrder[b.priority as keyof typeof priOrder] || 3));
                  return (
                    <div className="bg-transparent rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                      <div className={`flex items-center justify-between px-5 py-3 bg-gradient-to-r ${g.headerGrad}`}>
                        <h3 className="text-[14px] font-bold text-white">{selectedGrade}등급 전체 제안 — {allItems.length}건</h3>
                        <button onClick={() => setSelectedGrade(null)} className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white"><XCircle size={16} /></button>
                      </div>
                      {allItems.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">제안 없음</div> : (
                        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                          {allItems.map((item, i) => (
                            <div key={i} className="px-5 py-3 hover:bg-slate-50/80">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${item.priority === 'urgent' ? 'bg-red-100 text-red-700' : item.priority === 'high' ? 'bg-orange-100 text-orange-700' : item.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{item.priority === 'urgent' ? '긴급' : item.priority === 'high' ? '높음' : item.priority === 'medium' ? '보통' : '낮음'}</span>
                                    <span className="text-[13px] font-bold text-slate-900 truncate">{item.name}</span>
                                    {item.type === 'strategy' && 'tier' in item && item.tier && <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{item.tier}</span>}
                                  </div>
                                  <div className="text-[12px] text-slate-700">{item.action}</div>
                                  {item.type === 'strategy' && 'reason' in item && item.reason && <div className="text-[11px] text-slate-500 mt-0.5">{item.reason}</div>}
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className={`text-[16px] font-extrabold tabular-nums ${item.roas >= 300 ? 'text-emerald-600' : item.roas >= 100 ? 'text-amber-600' : item.roas > 0 ? 'text-red-500' : 'text-slate-300'}`}>{item.roas > 0 ? `${item.roas}%` : '-'}</div>
                                  <div className="text-[10px] text-slate-400">ROAS</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* AI 분석 리포트 카드 */}
          {strategyCards.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><Brain size={16} className="text-violet-500" /><h2 className="text-[15px] font-bold text-slate-900">AI 분석 리포트</h2></div>
                <button onClick={async () => {
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const res = await apiClient.get<any>('/api/ads/strategy/recommend');
                    setStrategyCards(res.cards || []);
                  } catch {
                    toast.error('새로고침 중 오류가 발생했습니다.');
                  }
                }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-violet-600 hover:bg-violet-50 font-semibold"><RefreshCw size={12} /> 새로고침</button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {strategyCards.map((card: any, ci: number) => (
                  <div key={ci} className={`shrink-0 w-[300px] bg-gradient-to-br ${card.color} rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow`}>
                    <div className="flex items-center gap-2 mb-3"><span className="text-xl">{card.icon}</span><span className="text-[14px] font-bold text-slate-800">{card.title}</span></div>
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {card.items.map((item: any, ii: number) => (
                        <div key={ii} className="bg-white/80 rounded-lg p-2.5">
                          {item.productName && <div className="text-[12px] font-bold text-slate-800 truncate">{item.productName}</div>}
                          <div className="text-[12px] text-slate-600 leading-relaxed">{item.text}</div>
                          {item.value && <div className={`text-[11px] font-semibold mt-0.5 ${item.priority === 'urgent' ? 'text-red-600' : item.priority === 'high' ? 'text-emerald-600' : 'text-slate-500'}`}>→ {item.value}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: 캠페인 */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'campaigns' && (
        <div className="space-y-4">
          {orderedCampaigns.length === 0 ? (
            <div className="bg-transparent rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
              <Megaphone size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-[14px] font-semibold text-slate-500">캠페인 데이터가 없습니다</p>
              <p className="text-[12px] text-slate-400 mt-1">익스텐션으로 동기화하면 캠페인이 표시됩니다</p>
            </div>
          ) : (
            <div className="bg-transparent rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="grid grid-cols-[32px_1fr_110px_110px_80px_80px_70px] px-4 py-2.5 bg-slate-100 border-b text-[11px] text-slate-500 font-semibold uppercase tracking-wide">
                <div /><div>캠페인명</div><div className="text-right">광고비</div><div className="text-right">전환매출</div><div className="text-right">ROAS</div><div className="text-right">클릭</div><div className="text-right">CTR</div>
              </div>
              {orderedCampaigns.map((c, idx) => (
                <div key={c.campaignName} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDragEnd={handleDragEnd} onClick={() => fetchCampaignProducts(c.campaignName)}
                  className={`grid grid-cols-[32px_1fr_110px_110px_80px_80px_70px] px-4 py-3 items-center cursor-pointer transition-colors border-b border-slate-100 last:border-0 ${selectedCampaign === c.campaignName ? 'bg-violet-50/80 border-l-4 border-l-violet-500' : 'hover:bg-slate-100/80'} ${dragIdx === idx ? 'opacity-50' : ''}`}>
                  <GripVertical size={14} className="text-slate-300 cursor-grab" />
                  <div className="flex items-center gap-2"><Megaphone size={13} className="text-violet-400 shrink-0" /><span className="text-[13px] font-semibold text-slate-900 truncate">{c.campaignName}</span></div>
                  <div className="text-right text-[13px] font-medium tabular-nums text-slate-700">{formatKRW(c.adSpend)}원</div>
                  <div className="text-right text-[13px] font-semibold tabular-nums text-emerald-600">{formatKRW(c.adRevenue)}원</div>
                  <div className={`text-right text-[13px] font-bold tabular-nums ${c.roas >= 300 ? 'text-emerald-600' : c.roas >= 100 ? 'text-amber-600' : 'text-red-500'}`}>{Math.round(c.roas)}%</div>
                  <div className="text-right text-[13px] tabular-nums text-slate-600">{c.clicks.toLocaleString()}</div>
                  <div className="text-right text-[13px] tabular-nums text-slate-600">{c.ctr}%</div>
                </div>
              ))}
            </div>
          )}

          {/* 캠페인 상세 */}
          {selectedCampaign && camp && (
            <div className="space-y-4">
              <div className="text-[12px] text-slate-400">전체 캠페인 &gt; <span className="text-violet-600 font-semibold">{selectedCampaign}</span></div>
              <div className="bg-transparent rounded-xl border p-5">
                <div className="grid grid-cols-6 gap-3 mb-3">
                  {[{ label: '광고비', value: formatKRW(camp.adSpend) + '원' }, { label: '전환매출', value: formatKRW(camp.adRevenue) + '원' }, { label: '노출', value: camp.impressions.toLocaleString() }, { label: '클릭', value: camp.clicks.toLocaleString() }, { label: 'ROAS', value: Math.round(camp.roas) + '%' }, { label: '전환율', value: camp.conversionRate + '%' }].map(k => (
                    <div key={k.label} className="bg-slate-100 rounded-lg p-3"><div className="text-[10px] text-slate-500 mb-0.5">{k.label}</div><div className="text-lg font-bold text-slate-900 tabular-nums">{k.value}</div></div>
                  ))}
                </div>
              </div>
              {products.length > 0 && (
                <div className="bg-transparent rounded-xl border overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1400px] w-full table-fixed">
                      <thead><tr className="bg-slate-100 text-[11px] text-slate-500 font-semibold uppercase">
                        <th className="text-left px-4 py-2.5 w-[80px]">상태</th><th className="text-left px-4 py-2.5 w-[340px]">상품명</th><th className="text-right px-3 py-2.5 w-[100px]">광고비</th><th className="text-right px-3 py-2.5 w-[120px]">전환매출</th><th className="text-right px-3 py-2.5 w-[80px]">클릭</th><th className="text-right px-3 py-2.5 w-[80px]">CTR</th><th className="text-right px-3 py-2.5 w-[80px]">전환수</th><th className="text-right px-3 py-2.5 w-[80px]">ROAS</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100 text-[13px]">
                        {pagedProducts.map((p, i) => {
                          const cleanName = p.productName.replace(/\s*ID\s*:\s*\d+/, '').trim();
                          return (
                            <tr key={i} className="hover:bg-slate-100/80">
                              <td className="px-4 py-2.5"><span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${p.onOff === 'ON' ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}`}>{p.onOff || 'OFF'}</span></td>
                              <td className="px-4 py-2.5 font-medium text-slate-900 truncate">{cleanName}</td>
                              <td className="text-right px-3 py-2.5 tabular-nums">{formatKRW(p.adSpend)}원</td>
                              <td className={`text-right px-3 py-2.5 tabular-nums ${p.adRevenue > 0 ? 'text-emerald-600 font-medium' : 'text-slate-300'}`}>{p.adRevenue > 0 ? formatKRW(p.adRevenue) + '원' : '0원'}</td>
                              <td className="text-right px-3 py-2.5 tabular-nums">{p.clicks.toLocaleString()}</td>
                              <td className="text-right px-3 py-2.5 tabular-nums">{p.ctr > 0 ? p.ctr + '%' : '-'}</td>
                              <td className="text-right px-3 py-2.5 tabular-nums">{p.adConversions}건</td>
                              <td className={`text-right px-3 py-2.5 tabular-nums font-bold ${p.roas >= 300 ? 'text-emerald-600' : p.roas >= 100 ? 'text-amber-600' : 'text-slate-400'}`}>{p.roas}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {products.length > prodPageSize && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t bg-slate-100 text-[12px]">
                      <span className="text-slate-500">{products.length}개 중 {(prodPage-1)*prodPageSize+1}~{Math.min(prodPage*prodPageSize, products.length)}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setProdPage(p => Math.max(1, p-1))} disabled={prodPage<=1} className="px-2.5 py-1 border rounded-lg disabled:opacity-30 hover:bg-slate-100">◀</button>
                        <span>{prodPage}/{totalPages}</span>
                        <button onClick={() => setProdPage(p => Math.min(totalPages, p+1))} disabled={prodPage>=totalPages} className="px-2.5 py-1 border rounded-lg disabled:opacity-30 hover:bg-slate-100">▶</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: 상품 현황 */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'products' && adSummary && (
        <div className="space-y-4">
          {/* 배분 차트 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-transparent rounded-xl border border-slate-200 p-4">
              <h3 className="text-[13px] font-bold text-slate-800 mb-3">ABC 등급별 광고비 배분</h3>
              <div className="space-y-2.5">
                {[{ grade: 'A', target: 80, color: 'bg-emerald-500', label: '핵심' }, { grade: 'B', target: 15, color: 'bg-amber-500', label: '성장' }, { grade: 'C', target: 5, color: 'bg-red-500', label: '정리' }].map(g => {
                  const pct = adSummary.gradeSpendPercent[g.grade] || 0;
                  const gap = pct - g.target;
                  return (
                    <div key={g.grade} className="flex items-center gap-2.5">
                      <span className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-black text-white ${g.color}`}>{g.grade}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-[11px] mb-0.5"><span className="text-slate-600">{g.label}</span><span className="tabular-nums"><span className="font-bold">{pct}%</span> <span className="text-slate-400">/ {g.target}%</span>{gap !== 0 && <span className={`ml-1 font-bold ${gap > 5 ? 'text-red-500' : gap < -5 ? 'text-amber-500' : 'text-emerald-500'}`}>{gap > 0 ? `+${gap}` : gap}%p</span>}</span></div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${g.color}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-transparent rounded-xl border border-slate-200 p-4">
              <h3 className="text-[13px] font-bold text-slate-800 mb-3">티어별 배분</h3>
              <div className="space-y-2.5">
                {[{ tier: '1차', label: '핵심', color: 'bg-violet-500' }, { tier: '2차', label: '성장', color: 'bg-blue-500' }, { tier: '3차', label: '테스트', color: 'bg-slate-400' }].map(t => {
                  const spend = adSummary.tierSpend[t.tier] || 0;
                  const pct = adSummary.totalSpend > 0 ? Math.round((spend / adSummary.totalSpend) * 100) : 0;
                  return (
                    <div key={t.tier} className="flex items-center gap-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${t.color}`}>{t.tier}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-[11px] mb-0.5"><span className="text-slate-600">{t.label}</span><span className="tabular-nums font-bold">{pct}% <span className="font-normal text-slate-400">({formatKRW(spend)}원)</span></span></div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${t.color}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 필터 */}
          <div className="flex gap-1.5 flex-wrap">
            {[{ key: 'all', label: '전체' }, { key: 'high', label: `15%초과 (${adProducts.filter(p => p.adRate > 15).length})` }, { key: 'A', label: `A (${adProducts.filter(p => p.grade === 'A').length})` }, { key: 'B', label: `B (${adProducts.filter(p => p.grade === 'B').length})` }, { key: 'C', label: `C (${adProducts.filter(p => p.grade === 'C').length})` }, { key: '1차', label: '1차' }, { key: '2차', label: '2차' }, { key: '3차', label: '3차' }].map(f => (
              <button key={f.key} onClick={() => { setAdFilter(f.key); setAdProductPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${adFilter === f.key ? 'bg-violet-600 text-white' : 'bg-transparent border border-slate-200 text-slate-500 hover:bg-slate-100'}`}>{f.label}</button>
            ))}
          </div>

          {/* 테이블 */}
          <div className="bg-transparent rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="bg-slate-100 text-[10px] text-slate-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-3 py-2.5">등급</th><th className="text-left px-2 py-2.5">티어</th><th className="text-left px-3 py-2.5">상품명</th><th className="text-right px-2 py-2.5">광고비</th><th className="text-right px-2 py-2.5">광고매출</th><th className="text-right px-2 py-2.5">ROAS</th><th className="text-right px-2 py-2.5">CTR</th><th className="text-right px-2 py-2.5">전환율</th><th className="text-right px-2 py-2.5">광고비율</th><th className="text-right px-2 py-2.5">순이익률</th><th className="text-center px-2 py-2.5">상태</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 text-[12px]">
                  {pagedAd.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-slate-500">데이터 없음</td></tr>}
                  {pagedAd.map(p => (
                    <tr key={p.id} className={`hover:bg-slate-100/80 ${p.adRate > 15 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(p.grade)}`}>{p.grade}</span></td>
                      <td className="px-2 py-2.5"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700">{p.adTier}</span></td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 max-w-[220px] truncate">{p.name}</td>
                      <td className="text-right px-2 py-2.5 tabular-nums">{formatKRW(p.spend)}원</td>
                      <td className={`text-right px-2 py-2.5 tabular-nums ${p.adRevenue > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{formatKRW(p.adRevenue)}원</td>
                      <td className={`text-right px-2 py-2.5 tabular-nums font-bold ${p.roas >= 300 ? 'text-emerald-600' : p.roas >= 200 ? 'text-amber-600' : p.roas > 0 ? 'text-red-500' : 'text-slate-300'}`}>{p.roas > 0 ? `${p.roas}%` : '-'}</td>
                      <td className="text-right px-2 py-2.5 tabular-nums">{p.ctr}%</td>
                      <td className="text-right px-2 py-2.5 tabular-nums">{p.convRate}%</td>
                      <td className={`text-right px-2 py-2.5 tabular-nums font-semibold ${p.adRate > 15 ? 'text-red-600' : 'text-slate-600'}`}>{formatPercent(p.adRate)}</td>
                      <td className={`text-right px-2 py-2.5 tabular-nums ${p.profitRate < 0 ? 'text-red-600' : p.profitRate <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatPercent(p.profitRate)}</td>
                      <td className="text-center px-2 py-2.5">
                        {p.adRate > 15 ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">점검</span>
                        : p.roas > 0 && p.roas < 200 ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700">효율↓</span>
                        : p.roas === 0 && p.spend > 0 ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">전환0</span>
                        : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">정상</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredAd.length > adProductPageSize && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t bg-slate-100 text-[12px]">
                <span className="text-slate-500">{filteredAd.length}개 중 {(adProductPage-1)*adProductPageSize+1}~{Math.min(adProductPage*adProductPageSize, filteredAd.length)}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAdProductPage(p => Math.max(1, p-1))} disabled={adProductPage<=1} className="px-2.5 py-1 border rounded-lg disabled:opacity-30 hover:bg-slate-100">◀</button>
                  <span>{adProductPage}/{totalAdPages}</span>
                  <button onClick={() => setAdProductPage(p => Math.min(totalAdPages, p+1))} disabled={adProductPage>=totalAdPages} className="px-2.5 py-1 border rounded-lg disabled:opacity-30 hover:bg-slate-100">▶</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 광고 AI 액션 / 해야할 일 탭 패널 =====
function AdActionPanel({ rules, strategy }: { rules: AdRuleRec[]; strategy: StrategyData | null }) {
  const [panelTab, setPanelTab] = useState<'actions' | 'todos'>('actions');
  const urgentCount = rules.filter(r => r.priority === 'urgent').length;
  const todoCount = strategy?.actions?.filter(a => a.actionPriority === 'urgent' || a.actionPriority === 'high').length || 0;

  // 해야할 일: 전략 액션 중 urgent/high를 사람이 해야 할 일로 분류
  const todos = useMemo(() => {
    const items: { label: string; detail: string; priority: string }[] = [];
    if (strategy?.adIssues) {
      const iss = strategy.adIssues;
      if (iss.zeroConversion > 0) items.push({ label: `전환 0 상품 ${iss.zeroConversion}개 — 키워드 OFF`, detail: '클릭만 발생, 전환 없는 광고 중단', priority: 'urgent' });
      if (iss.cGradeHighTier > 0) items.push({ label: `C등급 고광고 ${iss.cGradeHighTier}개 — 광고 축소`, detail: 'C등급에 1차 광고 배정 중', priority: 'high' });
      if (iss.aGradeNoAd > 0) items.push({ label: `A등급 미광고 ${iss.aGradeNoAd}개 — 광고 시작`, detail: '핵심 상품에 광고 미배정', priority: 'high' });
      if (iss.lowRoas > 0) items.push({ label: `저ROAS ${iss.lowRoas}개 — 입찰가 하향`, detail: 'ROAS 200% 미만 캠페인', priority: 'medium' });
    }
    strategy?.actions?.forEach(a => {
      if (a.actionPriority === 'urgent' || a.actionPriority === 'high') {
        items.push({ label: `${a.productName?.substring(0, 18)}`, detail: a.recommendedAction, priority: a.actionPriority });
      }
    });
    return items.slice(0, 10);
  }, [strategy]);

  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden flex flex-col h-full bg-white">
      {/* 탭 헤더 */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100">
        <button onClick={() => setPanelTab('actions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${panelTab === 'actions' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
          <Sparkles size={12} />
          AI 액션 {urgentCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${panelTab === 'actions' ? 'bg-white text-blue-600' : 'bg-red-600 text-white'}`}>{urgentCount}</span>}
        </button>
        <button onClick={() => setPanelTab('todos')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${panelTab === 'todos' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>
          <AlertTriangle size={12} />
          해야할 일 {todoCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] text-white bg-red-600">{todoCount}</span>}
        </button>
      </div>

      {/* AI 액션 탭 */}
      {panelTab === 'actions' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {rules.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-slate-400">처리할 광고 액션이 없습니다</div>
          ) : rules.slice(0, 10).map((r, i) => {
            const prioColor = r.priority === 'urgent' ? '#dc2626' : r.priority === 'high' ? '#f59e0b' : '#6b7280';
            return (
              <div key={i} className="px-4 py-2.5 flex items-start gap-2.5 border-b border-slate-100">
                <div className="shrink-0 mt-1 w-2 h-2 rounded-full" style={{ background: prioColor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-slate-900">{r.name}</div>
                  <div className="text-[11px] mt-0.5 text-slate-400">{r.action}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 해야할 일 탭 */}
      {panelTab === 'todos' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {todos.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-slate-400">처리할 업무가 없습니다</div>
          ) : todos.map((t, i) => {
            const prioColor = t.priority === 'urgent' ? '#dc2626' : t.priority === 'high' ? '#f59e0b' : '#6b7280';
            return (
              <div key={i} className="px-4 py-2.5 flex items-start gap-2.5 border-b border-slate-100">
                <div className="shrink-0 mt-1 w-2 h-2 rounded-full" style={{ background: prioColor }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-slate-900">{t.label}</div>
                  <div className="text-[11px] mt-0.5 text-slate-400">{t.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

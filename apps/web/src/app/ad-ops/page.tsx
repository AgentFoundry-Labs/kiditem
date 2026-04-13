"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  RefreshCw, Megaphone, Sparkles, GripVertical, XCircle, Brain,
  TrendingUp, TrendingDown, AlertTriangle, ChevronDown, ShoppingCart,
  Zap, ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown,
  Minus, BarChart3, LayoutGrid, ListOrdered, Package,
  DollarSign, Target, Search, Tag, Wallet, Settings2, Download, FileSpreadsheet,
  Eye,
} from "lucide-react";
import ExposureAnalysis from "./components/ExposureAnalysis";
import type { ExposureAnalysisData } from "@kiditem/shared";
import { formatKRW, formatPercent, getGradeColor } from "@/lib/utils";
import { parseKoreanNumber } from "@/lib/parse-korean-number";
import PageSkeleton from "@/components/ui/PageSkeleton";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";
import ScrapeCollector from "@/app/ads/collect/components/ScrapeCollector";
import { apiClient } from "@/lib/api-client";

// ===== API 매핑 헬퍼 =====
// coupang_seller의 Next.js API routes → kiditem NestJS 엔드포인트
async function adGet<T = unknown>(path: string): Promise<T | null> {
  try { return await apiClient.get<T>(path); } catch { return null; }
}

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
interface SuggestedKeywords {
  main: string[];
  sub: string[];
  longtail: string[];
  negative: string[];
}
interface StrategyAction {
  productId: string; productName: string; grade: string; tier: string | null;
  isExisting: boolean;
  action: string;
  currentRoas: number; currentCtr: number;
  currentCvr: number; currentAcos: number; currentAdRate: number;
  recommendedAction: string; actionPriority: "urgent" | "high" | "medium" | "low";
  actionCategory: string; reason: string;
  maxBidPrice: number; recommendedDailyBudget: number; targetRoas: number;
  keywords: string[];
  suggestedKeywords: SuggestedKeywords;
  campaignStrategy: string;
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

type TabKey = "status" | "strategy" | "exposure";

const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "status", label: "분석", icon: LayoutGrid },
  { key: "strategy", label: "전략", icon: Sparkles },
  { key: "exposure", label: "상위노출", icon: Eye },
];

export default function AdOpsPage() {
  const [tab, setTab] = useState<TabKey>("status");
  const [period, setPeriod] = useState("14d");
  const [totalKpi, setTotalKpi] = useState<Record<string, number>>({});
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [campaignOrder, setCampaignOrder] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [rules, setRules] = useState<AdRuleRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [wingKpis, setWingKpis] = useState<Record<string, string | { value: string; change?: string; numValue?: number }>>({});
  const [prodPage, setProdPage] = useState(1);
  const [prodPageSize] = useState(20);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<StrategyData | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<Record<string, "all" | "existing" | "new" | "recommended">>({ A: "all", B: "all", C: "all" });
  const [gradeSearch, setGradeSearch] = useState<Record<string, string>>({ A: "", B: "", C: "" });
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
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
  const [totalBudget, setTotalBudget] = useState<number>(300000);
  const [budgetInput, setBudgetInput] = useState("300,000");
  const [exposureData, setExposureData] = useState<ExposureAnalysisData | null>(null);

  // ── 광고 등록 모달 ──
  interface RegisterPayload {
    grade: string; color: string;
    campaignName: string; adGroupName: string;
    dailyBudget: number; operationMode: string;
    smartTargetingBid: number; nonSearchBid: number; targetRoas: number;
    keywords: { keyword: string; bidPrice: number }[];
    products: { productId: string; productName: string }[];
  }
  const [registerModal, setRegisterModal] = useState<RegisterPayload | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const days = period === "month" ? 30 : period === "14d" ? 14 : 7;
    const campPeriod = period === "month" ? "30d" : "7d";
    try {
      const [campRes, rulesRes, extRes, stratRes, adsRes, dashRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adGet<any>(`/api/ads/campaigns?period=${campPeriod}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adGet<any>(`/api/ads/strategy/rules?days=${days}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adGet<any>(`/api/ads/extension/status`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adGet<any>(`/api/ads/strategy/plan?days=${days}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adGet<any>(`/api/ads?days=${days}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adGet<any>(`/api/dashboard`),
      ]);
      // Wing 실데이터 우선, 없으면 캠페인 데이터 폴백
      const wingAd = dashRes?.trafficKpi?.adSummary;
      if (wingAd) setWingAdData(wingAd);
      setTotalKpi(campRes?.totalKpi || {});
      const sorted = (campRes?.campaigns || []).sort((a: CampaignData, b: CampaignData) => {
        if (b.adRevenue !== a.adRevenue) return b.adRevenue - a.adRevenue;
        if (b.roas !== a.roas) return b.roas - a.roas;
        return b.clicks - a.clicks;
      });
      setCampaigns(sorted);
      setCampaignOrder(sorted.map((c: CampaignData) => c.campaignName));
      setRules(rulesRes?.recommendations || []);
      setWingKpis(extRes?.wing?.kpis || {});
      if (stratRes?.success) setStrategy(stratRes);
      if (adsRes?.products) { setAdProducts(adsRes.products); setAdSummary(adsRes.summary); }
      try {
        const [recRes, trendRes, benchRes] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          adGet<any>(`/api/ads/strategy/recommend?days=${days}`),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          adGet<any>(`/api/ads/campaigns/trends?days=${days}`),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          adGet<any>(`/api/ads/benchmark?days=${days}`),
        ]);
        setStrategyCards(recRes?.cards || []);
        if (trendRes?.daily) setTrends(trendRes);
        if (benchRes?.success) setBenchmark(benchRes);
      } catch { /* */ }
    } catch { /* */ }
    setLoading(false);
  }, [period]);

  const fetchCampaignProducts = async (name: string) => {
    setSelectedCampaign(name);
    setProdPage(1);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await adGet<any>(`/api/ads/campaigns?campaign=${encodeURIComponent(name)}&period=${period}`);
      setProducts(json?.products || []);
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
  const roasStatus = roas >= 400 ? "excellent" : roas >= 200 ? "good" : roas > 0 ? "warning" : "neutral";
  const urgentCount = rules.filter(r => r.priority === "urgent").length;

  const camp = campaigns.find(c => c.campaignName === selectedCampaign);
  const totalPages = Math.ceil(products.length / prodPageSize);
  const pagedProducts = products.slice((prodPage - 1) * prodPageSize, prodPage * prodPageSize);


  // ═══ XLSX 내보내기 ═══
  const exportCampaignXlsx = (grade: string, actions: StrategyAction[], budget: number) => {
    import("xlsx").then((XLSX) => {
      const gradeMap: Record<string, { campaignType: string; targetRoas: string; bidMain: string; bidSub: string; bidLongtail: string }> = {
        A: { campaignType: "매출최적화 + 수동 병행", targetRoas: "300~500%", bidMain: "800~1,000", bidSub: "500~700", bidLongtail: "200~400" },
        B: { campaignType: "수동 성과형", targetRoas: "300~480%", bidMain: "500~700", bidSub: "300~500", bidLongtail: "100~300" },
        C: { campaignType: "최소 테스트 or OFF", targetRoas: "500%+", bidMain: "OFF", bidSub: "200~300", bidLongtail: "100~200" },
      };

      const grades = grade === "all" ? ["A", "B", "C"] : [grade];
      const wb = XLSX.utils.book_new();

      for (const g of grades) {
        const cfg = gradeMap[g] || gradeMap.A;
        const gradeActions = grade === "all" ? actions.filter(a => a.grade === g) : actions;
        const gradeBudget = grade === "all" ? Math.round(budget * (g === "A" ? 0.65 : g === "B" ? 0.25 : 0.1)) : budget;

        const rows = gradeActions.map((a, i) => {
          const productBudget = gradeActions.length > 0 ? Math.round(gradeBudget / gradeActions.length) : 0;
          const recBudget = a.recommendedDailyBudget > 0 ? a.recommendedDailyBudget : productBudget;
          const campType = g === "A" ? (a.tier ? "매출최적화+수동" : "매출최적화") : g === "B" ? "수동 성과형" : (a.currentRoas < 100 ? "OFF" : "최소 테스트");
          return {
            "No": i + 1,
            "캠페인명": `${g}등급_캠페인`,
            "상품명": a.productName,
            "상품ID": a.productId,
            "등급": g,
            "현재 ROAS(%)": a.currentRoas || 0,
            "추천 일예산(원)": recBudget,
            "목표 ROAS(%)": a.targetRoas || cfg.targetRoas,
            "최대 입찰가(원)": a.maxBidPrice || 0,
            "캠페인 유형": campType,
            "메인 키워드 입찰가": cfg.bidMain + "원",
            "서브 키워드 입찰가": cfg.bidSub + "원",
            "롱테일 키워드 입찰가": cfg.bidLongtail + "원",
            "현재 CTR(%)": a.currentCtr || 0,
            "현재 CVR(%)": a.currentCvr || 0,
            "현재 ACoS(%)": a.currentAcos || 0,
            "키워드": (a.keywords || []).join(", "),
            "추천 액션": a.recommendedAction,
            "우선순위": a.actionPriority === "urgent" ? "긴급" : a.actionPriority === "high" ? "높음" : a.actionPriority === "medium" ? "보통" : "낮음",
            "사유": a.reason || "",
          };
        });

        if (rows.length === 0) {
          rows.push({
            "No": 1, "캠페인명": `${g}등급_캠페인`, "상품명": "(해당 상품 없음)", "상품ID": "",
            "등급": g, "현재 ROAS(%)": 0, "추천 일예산(원)": 0, "목표 ROAS(%)": cfg.targetRoas,
            "최대 입찰가(원)": 0, "캠페인 유형": cfg.campaignType,
            "메인 키워드 입찰가": cfg.bidMain + "원", "서브 키워드 입찰가": cfg.bidSub + "원",
            "롱테일 키워드 입찰가": cfg.bidLongtail + "원",
            "현재 CTR(%)": 0, "현재 CVR(%)": 0, "현재 ACoS(%)": 0,
            "키워드": "",
            "추천 액션": "", "우선순위": "", "사유": "",
          });
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        // 컬럼 너비 설정
        ws["!cols"] = [
          { wch: 4 }, { wch: 16 }, { wch: 35 }, { wch: 12 }, { wch: 5 },
          { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
          { wch: 16 }, { wch: 16 }, { wch: 18 },
          { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 40 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, `${g}등급 캠페인`);
      }

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = grade === "all" ? `광고캠페인_ABC_${dateStr}.xlsx` : `광고캠페인_${grade}등급_${dateStr}.xlsx`;
      XLSX.writeFile(wb, filename);
    });
  };

  if (loading) return <PageSkeleton variant="dashboard" />;

  return (
    <>
    <div className="space-y-5">
      {/* ════════ 헤더 ════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--primary)" }}>
            <Brain size={20} className="text-white" />
          </div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>광고 전략 AI</h1>
            <span className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-tertiary)" }}>14일 기준</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ScrapeCollector onComplete={fetchData} />
          {urgentCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse" style={{ background: "var(--danger-subtle)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
              <AlertTriangle size={13} /> 긴급 {urgentCount}건
            </span>
          )}
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--surface-sunken)" }}>
            {[{ key: "7d", label: "7일" }, { key: "14d", label: "14일" }, { key: "month", label: "이번달" }].map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className="px-4 py-1.5 text-sm font-semibold rounded-md transition-all"
                style={period === p.key ? { background: "var(--primary)", color: "#ffffff", boxShadow: "var(--shadow-sm)" } : { color: "var(--text-tertiary)" }}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={fetchData} className="p-2.5 rounded-lg transition-colors" style={{ color: "var(--text-tertiary)" }} title="새로고침">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ════════ KPI 통합 — 홈 대시보드 패턴 (Hero 2 + Small 4) ════════ */}
      {(() => {
        const parseWing = parseKoreanNumber;
        const adSpend = wingAdData?.adSpend ? parseWing(wingAdData.adSpend) : (totalKpi.adSpend || 0);
        const adRevenue = wingAdData?.adGmv ? parseWing(wingAdData.adGmv) : (totalKpi.adRevenue || 0);
        const wingRoas = wingAdData?.roas ? parseFloat(wingAdData.roas) : roas;
        const impressions = totalKpi.impressions || 0;
        const clicks = totalKpi.clicks || 0;
        const conversions = totalKpi.conversions || 0;
        const ctr = totalKpi.ctr || 0;
        const cvr = clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0;
        const cpc = clicks > 0 ? Math.round(adSpend / clicks) : 0;
        const adRate = adRevenue > 0 ? Math.round((adSpend / adRevenue) * 10000) / 100 : 0;

        // 매출 목표 200만원, 광고비 목표 50만원
        const revenueGoal = 2000000;
        const spendGoal = 500000;
        const revenuePct = Math.min((adRevenue / revenueGoal) * 100, 100);
        const revenueAchieve = Math.round((adRevenue / revenueGoal) * 100);
        const spendPct = Math.min((adSpend / spendGoal) * 100, 100);
        const spendOver = adSpend > spendGoal;

        const renderSmallCard = (kpi: { label: string; value: string; unit: string; current: number; goal: number; goalLabel: string; invertGoal: boolean; accentColor: string; icon: typeof Megaphone; avg: number | null }) => {
          const pct = kpi.invertGoal
            ? (kpi.goal > 0 ? Math.max(0, Math.min(100, ((kpi.goal * 2 - kpi.current) / kpi.goal) * 100)) : 0)
            : (kpi.goal > 0 ? Math.min((kpi.current / kpi.goal) * 100, 100) : 0);
          const achieved = kpi.invertGoal ? kpi.current <= kpi.goal : kpi.current >= kpi.goal;
          const Icon = kpi.icon;
          const avgDiff = kpi.avg !== null ? kpi.current - kpi.avg : null;
          const avgBetter = kpi.avg !== null ? (kpi.invertGoal ? kpi.current <= kpi.avg : kpi.current >= kpi.avg) : null;
          return (
            <div key={kpi.label} className="rounded-2xl p-3.5 flex flex-col justify-between transition-all hover:shadow-lg" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={14} style={{ color: kpi.accentColor }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: kpi.accentColor }}>{kpi.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-extrabold tabular-nums" style={{ color: kpi.accentColor }}>{kpi.value}</span>
                  <span className="text-xs font-semibold" style={{ color: kpi.accentColor, opacity: 0.6 }}>{kpi.unit}</span>
                </div>
                {kpi.avg !== null && avgDiff !== null && avgDiff !== 0 && (
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    업계 {kpi.avg}{kpi.unit} <span className="font-bold" style={{ color: avgBetter ? "#059669" : "#dc2626" }}>{avgBetter ? "▲" : "▼"}{Math.abs(Math.round(avgDiff * 100) / 100)}</span>
                  </div>
                )}
              </div>
              <div className="mt-2 pt-1.5" style={{ borderTop: `1px solid ${kpi.accentColor}20` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px]" style={{ color: `${kpi.accentColor}99` }}>{kpi.goalLabel}</span>
                  <span className="text-[11px] font-bold" style={{ color: kpi.accentColor }}>{achieved ? "달성" : `${Math.round(pct)}%`}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${kpi.accentColor}15` }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: kpi.accentColor }} />
                </div>
              </div>
            </div>
          );
        };

        const smallKpis = [
          { label: "ROAS", value: String(wingRoas), unit: "%", current: wingRoas, goal: 400, goalLabel: "목표 400%", invertGoal: false, accentColor: "#733de5", icon: BarChart3, avg: 350 },
          { label: "광고비율", value: String(adRate), unit: "%", current: adRate, goal: 10, goalLabel: "목표 10% 이하", invertGoal: true, accentColor: "#dc2626", icon: Megaphone, avg: 10 },
          { label: "CTR", value: String(ctr), unit: "%", current: ctr, goal: 0.3, goalLabel: "목표 0.3%", invertGoal: false, accentColor: "#0891b2", icon: Zap, avg: 0.3 },
          { label: "CVR", value: String(cvr), unit: "%", current: cvr, goal: 8, goalLabel: "목표 8%", invertGoal: false, accentColor: "#059669", icon: TrendingUp, avg: 8 },
        ];

        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ alignItems: "stretch" }}>
            {/* ─── HERO 1: 전환 매출 (2-row) ─── */}
            <div className="lg:row-span-2 rounded-2xl px-5 py-4 flex flex-col justify-between" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={18} style={{ color: "#2563eb" }} />
                  <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "#2563eb" }}>광고 전환 매출</span>
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-3xl font-extrabold tabular-nums tracking-tight" style={{ color: "#2563eb" }}>{formatKRW(adRevenue)}</span>
                  <span className="text-base font-semibold" style={{ color: "#2563eb", opacity: 0.6 }}>원</span>
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{period === "month" ? "30일" : period === "14d" ? "14일" : "7일"} 누적</div>
                {/* 목표 달성률 */}
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(37,99,235,0.15)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px]" style={{ color: "rgba(37,99,235,0.6)" }}>목표 {formatKRW(revenueGoal)}원</span>
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: revenueAchieve >= 100 ? "#00c471" : "#2563eb" }}>{revenueAchieve}%</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 14, background: "rgba(37,99,235,0.08)" }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${revenuePct}%`, background: "linear-gradient(90deg, rgba(37,99,235,0.4), #2563eb)" }} />
                  </div>
                </div>
              </div>
              {/* Sub metrics */}
              <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: "1px solid rgba(37,99,235,0.15)" }}>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: "var(--text-secondary)" }}>노출수</span>
                  <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{impressions.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: "var(--text-secondary)" }}>클릭수</span>
                  <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{clicks.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: "var(--text-secondary)" }}>전환수</span>
                  <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{conversions.toLocaleString()}건</span>
                </div>
              </div>
            </div>

            {/* ─── HERO 2: 집행 광고비 (2-row) ─── */}
            <div className="lg:row-span-2 rounded-2xl px-5 py-4 flex flex-col justify-between" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Megaphone size={18} style={{ color: "#059669" }} />
                  <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "#059669" }}>집행 광고비</span>
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-3xl font-extrabold tabular-nums tracking-tight" style={{ color: "#059669" }}>{formatKRW(adSpend)}</span>
                  <span className="text-base font-semibold" style={{ color: "#059669", opacity: 0.6 }}>원</span>
                </div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{period === "month" ? "30일" : period === "14d" ? "14일" : "7일"} 누적</div>
                {/* 목표 달성률 */}
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(5,150,105,0.15)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px]" style={{ color: "rgba(5,150,105,0.6)" }}>예산 {formatKRW(spendGoal)}원 이하</span>
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: spendOver ? "#dc2626" : "#059669" }}>{spendOver ? "초과" : `${Math.round(spendPct)}%`}</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 14, background: "rgba(5,150,105,0.08)" }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${spendPct}%`, background: spendOver ? "linear-gradient(90deg, #fca5a5, #dc2626)" : "linear-gradient(90deg, rgba(5,150,105,0.4), #059669)" }} />
                  </div>
                </div>
              </div>
              {/* Sub metrics */}
              <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: "1px solid rgba(5,150,105,0.15)" }}>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: "var(--text-secondary)" }}>CPC</span>
                  <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatKRW(cpc)}원</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: "var(--text-secondary)" }}>일평균 광고비</span>
                  <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatKRW(Math.round(adSpend / (period === "month" ? 30 : period === "14d" ? 14 : 7)))}원</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span style={{ color: "var(--text-secondary)" }}>건당 광고비</span>
                  <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{conversions > 0 ? formatKRW(Math.round(adSpend / conversions)) : 0}원</span>
                </div>
              </div>
            </div>

            {/* ─── 우측 상단: ROAS · 광고비율 ─── */}
            {smallKpis.slice(0, 2).map(renderSmallCard)}
            {/* ─── 우측 하단: CTR · CVR ─── */}
            {smallKpis.slice(2, 4).map(renderSmallCard)}
          </div>
        );
      })()}

      {/* ════════ 탭 네비게이션 ════════ */}
      <div className="rounded-2xl px-3 py-3 flex items-center gap-1.5" style={{ background: "var(--primary)" }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button key={t.key} onClick={() => {
                setTab(t.key);
                if (t.key === "exposure" && !exposureData) {
                  adGet<ExposureAnalysisData>("/api/ads/exposure-analysis").then(d => { if (d) setExposureData(d); });
                }
              }}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-all"
              style={isActive ? { background: "#ffffff", color: "var(--primary)", boxShadow: "var(--shadow-sm)" } : { color: "rgba(255,255,255,0.7)" }}>
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ════════ 탭 콘텐츠 (최소 높이 고정) ════════ */}
      <div style={{ minHeight: 600 }}>
      {tab === "status" && (
        <div className="space-y-5">

          {/* 차트 + 할일/알림 */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3" style={{ height: 520 }}>

            {/* 왼쪽 3칸: 광고비 · 전환매출 · ROAS 통합 차트 */}
            <div className="lg:col-span-3 rounded-2xl flex flex-col overflow-hidden h-full" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between px-5 pt-4 pb-0">
                <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>광고비 · 전환매출 · ROAS</h3>
                <div className="flex items-center gap-5 text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-[10px] rounded-[3px]" style={{ background: "#d1d6db" }} />광고비</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-[10px] rounded-[3px]" style={{ background: "#3182f6" }} />전환매출</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ border: "2px solid #00c471" }} />ROAS</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-[1.5px] inline-block rounded-full" style={{ background: "#f04452", opacity: 0.5 }} />손익분기</span>
                </div>
              </div>
              <div className="flex-1 p-4" style={{ minHeight: 280 }}>
                {trends?.daily?.length > 0 ? (() => {
                  const maxRoas = Math.max(...trends.daily.map((d: { roas: number }) => d.roas || 0), 1);
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const chartData = trends.daily.map((d: any) => ({ ...d }));

                  return (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="35%">
                      <defs>
                        <linearGradient id="barSpendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#d1d6db" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#e8ebed" stopOpacity={0.5} />
                        </linearGradient>
                        <linearGradient id="barRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3182f6" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="#3182f6" stopOpacity={0.45} />
                        </linearGradient>
                        <filter id="barShadow" x="-10%" y="-10%" width="120%" height="130%">
                          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#3182f6" floodOpacity="0.15" />
                        </filter>
                      </defs>
                      <CartesianGrid strokeDasharray="0" stroke="var(--border-subtle)" strokeOpacity={0.3} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-quaternary)", fontWeight: 500 }} tickLine={false} axisLine={false} dy={8} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--text-quaternary)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => v >= 10000 ? `${Math.round(v / 10000)}만` : v >= 1000 ? `${Math.round(v / 1000)}천` : String(v)} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--text-quaternary)" }} tickLine={false} axisLine={false} width={42} domain={[0, Math.ceil(maxRoas / 100) * 100 + 100]} tickFormatter={(v: number) => `${v}%`} />
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip cursor={{ fill: "var(--primary-subtle)", radius: 8 }} content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const roasEntry = payload.find((p: any) => p.dataKey === "roas");
                        const roasVal = roasEntry ? Math.round(roasEntry.value) : 0;
                        const isLow = roasVal < 300;
                        return (
                          <div style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(16px)", color: "var(--text-primary)", borderRadius: 16, padding: "14px 18px", fontSize: 12, fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)" }}>
                            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 10, fontWeight: 500 }}>{label}일</div>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {payload.map((p: any) => {
                              if (p.dataKey === "breakeven") return null;
                              const isRoas = p.dataKey === "roas";
                              const nameMap: Record<string, string> = { spend: "광고비", revenue: "전환매출", roas: "ROAS" };
                              const colorMap: Record<string, string> = { spend: "#b0b8c1", revenue: "#3182f6", roas: isLow ? "#f04452" : "#00c471" };
                              return (
                                <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: isRoas ? "50%" : 2, background: colorMap[p.dataKey] || p.color, flexShrink: 0 }} />
                                  <span style={{ color: "var(--text-tertiary)", minWidth: 52, fontWeight: 500 }}>{nameMap[p.dataKey] || p.dataKey}</span>
                                  <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: isRoas && isLow ? "#f04452" : "var(--text-primary)" }}>{isRoas ? `${p.value}%` : `${formatKRW(Number(p.value))}원`}</span>
                                </div>
                              );
                            })}
                            {isLow && <div style={{ fontSize: 10, color: "#f04452", marginTop: 6, fontWeight: 500 }}>손익분기(300%) 미달</div>}
                          </div>
                        );
                      }} />
                      <Bar yAxisId="left" dataKey="spend" fill="url(#barSpendGrad)" radius={[6, 6, 6, 6]} maxBarSize={18} />
                      <Bar yAxisId="left" dataKey="revenue" fill="url(#barRevenueGrad)" radius={[6, 6, 6, 6]} maxBarSize={18} filter="url(#barShadow)" />
                      <Line yAxisId="right" type="monotone" dataKey="roas" stroke="#00c471" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#00c471", strokeWidth: 2 }} activeDot={{ r: 5.5, fill: "#00c471", stroke: "#fff", strokeWidth: 3 }} />
                      <Line yAxisId="right" type="monotone" dataKey={() => 300} stroke="#f04452" strokeWidth={1} strokeDasharray="6 4" strokeOpacity={0.4} dot={false} name="breakeven" />
                    </ComposedChart>
                  </ResponsiveContainer>
                  );
                })() : (
                  <div className="h-full flex items-center justify-center">
                    <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>차트 데이터 수집 중...</span>
                  </div>
                )}
              </div>
            </div>

            {/* 오른쪽 1칸: 할일 + 알림 */}
            <AdSidePanel rules={rules} strategy={strategy} />
          </div>

          {/* 아이템위너 · 노출 현황 */}
          {Object.keys(wingKpis).length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={16} style={{ color: "var(--warning)" }} />
                <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>아이템위너 · 노출 현황</h2>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>아이템위너 미보유 시 광고 전환율 급감</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {Object.entries(wingKpis).map(([label, raw]) => {
                  // Wing sales-analysis: {value, change, numValue} 객체 / itemwinner fallback: 문자열
                  const isObj = raw && typeof raw === "object";
                  const display = isObj ? String((raw as any).value ?? (raw as any).numValue ?? "") : String(raw);
                  const numeric = isObj ? Number((raw as any).numValue ?? 0) : parseInt(String(raw)) || 0;
                  const isWarning = label.includes("노출제한") || label.includes("아이템위너 아닌") || label.includes("미보유");
                  const hasIssue = isWarning && numeric > 0;
                  return (
                    <div key={label} className="rounded-xl p-4 text-center" style={{ background: hasIssue ? "var(--danger-subtle)" : "var(--surface-sunken)", border: hasIssue ? "1px solid var(--danger)" : "1px solid var(--border-subtle)" }}>
                      <div className="text-2xl font-extrabold tabular-nums" style={{ color: hasIssue ? "var(--danger)" : "var(--text-primary)" }}>{display}</div>
                      <div className="text-xs mt-1 font-medium" style={{ color: hasIssue ? "var(--danger)" : "var(--text-secondary)" }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 캠페인 리스트 */}
          {orderedCampaigns.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-2">
                  <Megaphone size={15} style={{ color: "var(--primary)" }} />
                  <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>캠페인</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--primary-subtle)", color: "var(--primary)" }}>{orderedCampaigns.length}개</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
                      <th className="text-left px-5 py-2.5">캠페인명</th>
                      <th className="text-right px-4 py-2.5">광고비</th>
                      <th className="text-right px-4 py-2.5">전환매출</th>
                      <th className="text-right px-4 py-2.5">ROAS</th>
                      <th className="text-right px-4 py-2.5">클릭</th>
                      <th className="text-right px-4 py-2.5">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedCampaigns.map((c) => {
                      const roasVal = Math.max(0, c.roas);
                      const isEmpty = c.adSpend === 0 && c.adRevenue === 0;
                      return (
                      <tr key={c.campaignName} onClick={() => fetchCampaignProducts(c.campaignName)}
                        className="cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--border-subtle)", opacity: isEmpty ? 0.45 : 1 }}>
                        <td className="px-5 py-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.campaignName}</td>
                        <td className="text-right px-4 py-3 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{formatKRW(c.adSpend)}원</td>
                        <td className="text-right px-4 py-3 text-sm font-semibold tabular-nums" style={{ color: c.adRevenue > 0 ? "#059669" : "var(--text-quaternary)" }}>{formatKRW(c.adRevenue)}원</td>
                        <td className="text-right px-4 py-3 text-sm font-bold tabular-nums" style={{ color: roasVal >= 300 ? "#059669" : roasVal >= 100 ? "#f59e0b" : roasVal > 0 ? "#dc2626" : "var(--text-quaternary)" }}>{roasVal > 0 ? `${Math.round(roasVal)}%` : "-"}</td>
                        <td className="text-right px-4 py-3 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{c.clicks.toLocaleString()}</td>
                        <td className="text-right px-4 py-3 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{c.ctr > 0 ? `${c.ctr}%` : "-"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 캠페인 상세 — 상품 리스트 */}
          {selectedCampaign && camp && (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>캠페인</span>
                  <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{selectedCampaign}</span>
                </div>
                <button onClick={() => setSelectedCampaign(null)} className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--text-tertiary)" }}>닫기</button>
              </div>
              <div className="grid grid-cols-6 gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {[
                  { label: "광고비", value: formatKRW(camp.adSpend) + "원" },
                  { label: "전환매출", value: formatKRW(camp.adRevenue) + "원" },
                  { label: "노출", value: camp.impressions.toLocaleString() },
                  { label: "클릭", value: camp.clicks.toLocaleString() },
                  { label: "ROAS", value: Math.round(camp.roas) + "%" },
                  { label: "전환율", value: camp.conversionRate + "%" },
                ].map(k => (
                  <div key={k.label} className="rounded-lg p-2" style={{ background: "var(--surface-sunken)" }}>
                    <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{k.label}</div>
                    <div className="text-base font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{k.value}</div>
                  </div>
                ))}
              </div>
              {products.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[11px] font-semibold uppercase" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
                        <th className="text-left px-4 py-2.5 w-[60px]">상태</th>
                        <th className="text-left px-4 py-2.5">상품명</th>
                        <th className="text-right px-3 py-2.5">광고비</th>
                        <th className="text-right px-3 py-2.5">전환매출</th>
                        <th className="text-right px-3 py-2.5">클릭</th>
                        <th className="text-right px-3 py-2.5">CTR</th>
                        <th className="text-right px-3 py-2.5">전환수</th>
                        <th className="text-right px-3 py-2.5">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedProducts.map((p, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td className="px-4 py-2.5"><span className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: p.onOff === "ON" ? "#059669" : "var(--text-quaternary)", color: "#fff" }}>{p.onOff || "OFF"}</span></td>
                          <td className="px-4 py-2.5 text-sm font-medium truncate max-w-[300px]" style={{ color: "var(--text-primary)" }}>{p.productName.replace(/\s*ID\s*:\s*\d+/, "").trim()}</td>
                          <td className="text-right px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{formatKRW(p.adSpend)}원</td>
                          <td className="text-right px-3 py-2.5 text-sm tabular-nums font-medium" style={{ color: p.adRevenue > 0 ? "#059669" : "var(--text-quaternary)" }}>{p.adRevenue > 0 ? formatKRW(p.adRevenue) + "원" : "0원"}</td>
                          <td className="text-right px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{p.clicks.toLocaleString()}</td>
                          <td className="text-right px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{p.ctr > 0 ? p.ctr + "%" : "-"}</td>
                          <td className="text-right px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>{p.adConversions}건</td>
                          <td className="text-right px-3 py-2.5 text-sm font-bold tabular-nums" style={{ color: p.roas >= 300 ? "#059669" : p.roas >= 100 ? "#f59e0b" : "var(--text-tertiary)" }}>{p.roas}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {products.length > prodPageSize && (
                <div className="flex items-center justify-between px-5 py-2.5 text-xs" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--surface-sunken)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{products.length}개 중 {(prodPage-1)*prodPageSize+1}~{Math.min(prodPage*prodPageSize, products.length)}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setProdPage(p => Math.max(1, p-1))} disabled={prodPage<=1} className="px-2.5 py-1 rounded-lg disabled:opacity-30" style={{ border: "1px solid var(--border-subtle)" }}>◀</button>
                    <span>{prodPage}/{totalPages}</span>
                    <button onClick={() => setProdPage(p => Math.min(totalPages, p+1))} disabled={prodPage>=totalPages} className="px-2.5 py-1 rounded-lg disabled:opacity-30" style={{ border: "1px solid var(--border-subtle)" }}>▶</button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: AI 전략 */}
      {/* ════════════════════════════════════════════ */}
      {tab === "strategy" && (
        <div className="space-y-4">

          {/* ═══ 예산 + 배분 — 한 줄 컴팩트 ═══ */}
          <div className="rounded-2xl px-5 py-3 flex items-center gap-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2.5 shrink-0">
              <Wallet size={16} style={{ color: "var(--primary)" }} />
              <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>일예산</span>
              <div className="relative">
                <input
                  type="text" value={budgetInput}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    const num = parseInt(raw) || 0;
                    setBudgetInput(num.toLocaleString());
                    setTotalBudget(num);
                  }}
                  className="w-32 text-right pr-8 pl-3 py-1.5 rounded-lg text-[15px] font-black tabular-nums"
                  style={{ background: "var(--surface-sunken)", border: "1.5px solid var(--primary)", color: "var(--text-primary)" }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold pointer-events-none" style={{ color: "var(--text-tertiary)" }}>원</span>
              </div>
            </div>
            <div className="flex-1 flex h-3 rounded-full overflow-hidden">
              <div style={{ width: "65%", background: "linear-gradient(90deg, #059669, #10b981)" }} />
              <div style={{ width: "25%", background: "linear-gradient(90deg, #f59e0b, #fbbf24)" }} />
              <div style={{ width: "10%", background: "linear-gradient(90deg, #ef4444, #f87171)" }} />
            </div>
            <div className="flex gap-3 text-[10px] font-semibold shrink-0" style={{ color: "var(--text-secondary)" }}>
              <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />A {Math.round(totalBudget * 0.65).toLocaleString()}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />B {Math.round(totalBudget * 0.25).toLocaleString()}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />C {Math.round(totalBudget * 0.1).toLocaleString()}</span>
            </div>
            <button
              onClick={() => exportCampaignXlsx("all", strategy?.actions || [], totalBudget)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white shrink-0"
              style={{ background: "var(--primary)" }}
            >
              <Download size={12} /> XLSX
            </button>
          </div>

          {/* ═══ 2. ABC 캠페인 카드 (세로 full-width 배치) ═══ */}
          {(() => {
            const gradeConfigs = [
              { grade: "A", title: "핵심 상품 캠페인", subtitle: "공격적 확장 — 매출 상위 70%", budgetPct: 65, color: "#059669", headerGrad: "from-emerald-600 to-green-600", border: "border-emerald-300", ring: "ring-emerald-400", campaignType: "매출최적화 + 수동 병행", targetRoasLabel: "300~500%", bidGuide: { main: "800~1,000", sub: "500~700", longtail: "200~400" } },
              { grade: "B", title: "성장 후보 캠페인", subtitle: "최적화 집중 — 매출 70~90%", budgetPct: 25, color: "#f59e0b", headerGrad: "from-amber-500 to-yellow-500", border: "border-amber-300", ring: "ring-amber-400", campaignType: "수동 성과형 위주", targetRoasLabel: "300~480%", bidGuide: { main: "500~700", sub: "300~500", longtail: "100~300" } },
              { grade: "C", title: "정리/테스트 캠페인", subtitle: "손절 · 재구성 — 나머지", budgetPct: 10, color: "#ef4444", headerGrad: "from-red-500 to-pink-500", border: "border-red-300", ring: "ring-red-400", campaignType: "최소 테스트 or OFF", targetRoasLabel: "500%+", bidGuide: { main: "OFF", sub: "200~300", longtail: "100~200" } },
            ];
            const stratActions = strategy?.actions || [];

            return (
              <div className="grid grid-cols-3 gap-3">
                {gradeConfigs.map(cfg => {
                  const isSelected = selectedGrade === cfg.grade;
                  const allGradeActions = stratActions.filter(a => a.grade === cfg.grade);
                  const existingActions = allGradeActions.filter(a => a.isExisting);
                  const newActions = allGradeActions.filter(a => !a.isExisting);
                  const gradeBudget = Math.round(totalBudget * cfg.budgetPct / 100);
                  const urgentCount = allGradeActions.filter(a => a.actionPriority === "urgent").length;

                  // C등급 추천 상품: 광고 이력 있거나, 긴급/높음 우선순위
                  const recommendedActions = cfg.grade === "C"
                    ? allGradeActions.filter(a => a.isExisting || a.actionPriority === "urgent" || a.actionPriority === "high" || a.currentRoas > 0)
                    : [];

                  // 필터 & 검색
                  const filter = gradeFilter[cfg.grade] || "all";
                  const search = (gradeSearch[cfg.grade] || "").toLowerCase();
                  let filteredActions = filter === "existing" ? existingActions
                    : filter === "new" ? newActions
                    : filter === "recommended" ? recommendedActions
                    : allGradeActions;
                  if (search) filteredActions = filteredActions.filter(a => a.productName.toLowerCase().includes(search));
                  // C등급은 최대 50개만 (너무 많으므로)
                  const maxShow = cfg.grade === "C" ? 50 : 200;
                  const hasMore = filteredActions.length > maxShow;
                  const displayActions = filteredActions.slice(0, maxShow);

                  return (
                    <div key={cfg.grade} className={`rounded-2xl overflow-hidden border-2 ${cfg.border} transition-all flex flex-col ${isSelected ? `ring-2 ${cfg.ring} shadow-xl` : "hover:shadow-lg"}`}>
                      {/* 캠페인 헤더 — 컴팩트 */}
                      <button onClick={() => setSelectedGrade(isSelected ? null : cfg.grade)} className={`w-full text-left bg-gradient-to-r ${cfg.headerGrad} px-4 py-3`}>
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg font-black text-white">{cfg.grade}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-bold text-white leading-tight truncate">{cfg.title}</div>
                            <div className="text-[12px] text-white/60 truncate">{cfg.subtitle}</div>
                          </div>
                          <ChevronDown size={15} className={`text-white/60 transition-transform shrink-0 ${isSelected ? "rotate-180" : ""}`} />
                        </div>
                        <div className="text-xl font-black text-white tabular-nums mb-1.5">{gradeBudget.toLocaleString()}<span className="text-[13px] font-semibold text-white/50 ml-1">원/일</span></div>
                        <div className="flex flex-wrap items-center gap-1">
                          {urgentCount > 0 && <span className="px-1.5 py-0.5 bg-red-500/80 rounded text-[11px] font-bold text-white">긴급 {urgentCount}</span>}
                          <span className="px-1.5 py-0.5 bg-white/20 rounded text-[11px] font-bold text-white">기존 {existingActions.length}</span>
                          <span className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] font-bold text-white/70">신규 {newActions.length}</span>
                        </div>
                      </button>

                      {/* 캠페인 설정 요약 — 세로 스택 */}
                      <div className="px-4 py-3 space-y-2" style={{ background: "var(--card-bg)", borderBottom: isSelected ? "1px solid var(--border-subtle)" : "none" }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>캠페인 유형</div>
                            <div className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>{cfg.campaignType}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>목표 ROAS</div>
                            <div className="text-[17px] font-black" style={{ color: cfg.color }}>{cfg.targetRoasLabel}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: `${cfg.color}15`, color: cfg.color }}>메인 {cfg.bidGuide.main}원</span>
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>서브 {cfg.bidGuide.sub}원</span>
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>롱테일 {cfg.bidGuide.longtail}원</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); exportCampaignXlsx(cfg.grade, allGradeActions, gradeBudget); }}
                          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-bold transition-all hover:shadow-md"
                          style={{ background: `${cfg.color}12`, color: cfg.color, border: `1px solid ${cfg.color}25` }}
                        >
                          <FileSpreadsheet size={13} /> XLSX 내보내기
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // 실제 maxBidPrice 평균 (없으면 등급 기본값)
                            const validBids = allGradeActions.filter(a => a.maxBidPrice > 0).map(a => a.maxBidPrice);
                            const smartBid = validBids.length > 0
                              ? Math.round(validBids.reduce((s, b) => s + b, 0) / validBids.length)
                              : (cfg.grade === "A" ? 800 : cfg.grade === "B" ? 500 : 300);
                            // targetRoas: API 데이터 우선, 없으면 라벨 파싱 폴백
                            const targetRoas = allGradeActions[0]?.targetRoas
                              || parseInt(cfg.targetRoasLabel.match(/\d+/)?.[0] || "350");
                            // operationMode: A등급 + 평균 ROAS >= 300% → 자동운영
                            const avgRoas = allGradeActions.reduce((s, a) => s + a.currentRoas, 0) / (allGradeActions.length || 1);
                            const opMode = avgRoas >= 300 && cfg.grade === "A" ? "자동운영_매출최적화" : "직접입력";
                            // stop 제외, urgent/high 우선 정렬
                            const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
                            const productsForCampaign = allGradeActions
                              .filter(a => a.action !== "stop")
                              .sort((a, b) => (priorityOrder[a.actionPriority] ?? 2) - (priorityOrder[b.actionPriority] ?? 2))
                              .slice(0, 20);
                            // suggestedKeywords.main 우선 (API에서 실데이터)
                            const allKws = allGradeActions
                              .flatMap(a => [...(a.suggestedKeywords?.main || []), ...(a.keywords || [])])
                              .filter((k, i, arr) => k && arr.indexOf(k) === i)
                              .slice(0, 10)
                              .map(kw => ({ keyword: kw, bidPrice: smartBid || 100 }));
                            setRegisterError(null);
                            setRegisterModal({
                              grade: cfg.grade,
                              color: cfg.color,
                              campaignName: `${cfg.grade}등급_캠페인`,
                              adGroupName: `${cfg.grade}등급_그룹`,
                              dailyBudget: gradeBudget,
                              operationMode: opMode,
                              smartTargetingBid: smartBid,
                              nonSearchBid: 100,
                              targetRoas,
                              keywords: allKws,
                              products: productsForCampaign.map(a => ({ productId: a.productId, productName: a.productName })),
                            });
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-bold transition-all hover:shadow-md"
                          style={{ background: cfg.color, color: "#fff" }}
                        >
                          <Megaphone size={13} /> 광고 등록
                        </button>
                      </div>

                      {/* 기존/신규 필터 + 검색 + 상품 목록 — 펼쳤을 때 */}
                      {isSelected && (
                        <>
                          <div className="px-3 py-2 flex flex-col gap-2" style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--border-subtle)" }}>
                            <div className="flex rounded-md p-0.5" style={{ background: "var(--surface-sunken)" }}>
                              {([
                                { key: "all" as const, label: `전체 ${allGradeActions.length}` },
                                { key: "existing" as const, label: `기존 ${existingActions.length}` },
                                { key: "new" as const, label: `신규 ${newActions.length}` },
                                ...(cfg.grade === "C" ? [{ key: "recommended" as const, label: `추천 ${recommendedActions.length}` }] : []),
                              ]).map(f => (
                                <button key={f.key}
                                  onClick={(e) => { e.stopPropagation(); setGradeFilter(prev => ({ ...prev, [cfg.grade]: f.key })); }}
                                  className="flex-1 px-1 py-1 text-[10px] font-semibold rounded transition-all text-center"
                                  style={filter === f.key ? { background: cfg.color, color: "#fff" } : { color: "var(--text-tertiary)" }}>
                                  {f.label}
                                </button>
                              ))}
                            </div>
                            <div className="relative">
                              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-quaternary)" }} />
                              <input
                                type="text" placeholder="검색..."
                                value={gradeSearch[cfg.grade] || ""}
                                onChange={e => setGradeSearch(prev => ({ ...prev, [cfg.grade]: e.target.value }))}
                                className="w-full pl-7 pr-2 py-1.5 rounded-md text-[11px]"
                                style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          </div>

                          <div className="max-h-[500px] overflow-y-auto flex-1" style={{ background: "var(--card-bg)" }}>
                            {displayActions.length === 0 ? (
                              <div className="p-4 text-center text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                                {search ? "검색 결과 없음" : "해당 상품 없음"}
                              </div>
                            ) : (
                              <div>
                                {/* 기존/신규 섹션 (전체 보기일 때) */}
                                {filter === "all" && existingActions.length > 0 && newActions.length > 0 ? (
                                  <>
                                    <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ background: `${cfg.color}08`, borderBottom: "1px solid var(--border-subtle)" }}>
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
                                      <span className="text-[10px] font-bold" style={{ color: cfg.color }}>기존 광고 상품 ({existingActions.length})</span>
                                    </div>
                                    <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                                      {(search ? existingActions.filter(a => a.productName.toLowerCase().includes(search)) : existingActions).slice(0, cfg.grade === "C" ? 30 : 100).map((a, i) => (
                                        <ProductStrategyRow key={`e${i}`} action={a} gradeBudget={gradeBudget} gradeCount={allGradeActions.length} color={cfg.color} expanded={expandedProduct === a.productId} onToggle={() => setExpandedProduct(expandedProduct === a.productId ? null : a.productId)} compact />
                                      ))}
                                    </div>
                                    <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ background: "rgba(99,102,241,0.06)", borderTop: "2px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
                                      <Sparkles size={11} style={{ color: "#6366f1" }} />
                                      <span className="text-[10px] font-bold" style={{ color: "#6366f1" }}>신규 편입 ({newActions.length})</span>
                                    </div>
                                    <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                                      {(search ? newActions.filter(a => a.productName.toLowerCase().includes(search)) : newActions).slice(0, cfg.grade === "C" ? 20 : 100).map((a, i) => (
                                        <ProductStrategyRow key={`n${i}`} action={a} gradeBudget={gradeBudget} gradeCount={allGradeActions.length} color={cfg.color} expanded={expandedProduct === a.productId} onToggle={() => setExpandedProduct(expandedProduct === a.productId ? null : a.productId)} isNew compact />
                                      ))}
                                    </div>
                                  </>
                                ) : (
                                  <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                                    {displayActions.map((a, i) => (
                                      <ProductStrategyRow key={i} action={a} gradeBudget={gradeBudget} gradeCount={allGradeActions.length} color={cfg.color} expanded={expandedProduct === a.productId} onToggle={() => setExpandedProduct(expandedProduct === a.productId ? null : a.productId)} isNew={!a.isExisting} compact />
                                    ))}
                                  </div>
                                )}
                                {hasMore && (
                                  <div className="px-3 py-2 text-center text-[10px]" style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)" }}>
                                    +{filteredActions.length - maxShow}개 더 있음
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ═══ 3. 긴급 알림 바 — 컴팩트 가로 ═══ */}
          {(() => {
            const urgentRules = rules.filter(r => r.priority === "urgent").slice(0, 5);
            const issues = strategy?.adIssues;
            const alerts: { label: string; detail: string; color: string }[] = [];
            if (issues?.zeroConversion) alerts.push({ label: `전환 0 상품 ${issues.zeroConversion}개`, detail: "키워드 OFF", color: "#dc2626" });
            if (issues?.cGradeHighTier) alerts.push({ label: `C등급 고광고 ${issues.cGradeHighTier}개`, detail: "예산 축소", color: "#f59e0b" });
            if (issues?.aGradeNoAd) alerts.push({ label: `A등급 미광고 ${issues.aGradeNoAd}개`, detail: "광고 시작", color: "#059669" });
            urgentRules.forEach(r => alerts.push({ label: r.name.substring(0, 25), detail: r.action.substring(0, 20), color: "#dc2626" }));
            if (alerts.length === 0) return null;
            return (
              <div className="rounded-xl px-4 py-2.5 flex items-center gap-3 overflow-x-auto" style={{ background: "#dc262608", border: "1px solid #dc262615" }}>
                <div className="flex items-center gap-1.5 shrink-0">
                  <AlertTriangle size={14} style={{ color: "#dc2626" }} />
                  <span className="text-[11px] font-bold" style={{ color: "#dc2626" }}>긴급 {alerts.length}건</span>
                </div>
                <div className="flex gap-2 overflow-x-auto">
                  {alerts.slice(0, 6).map((a, i) => (
                    <span key={i} className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold" style={{ background: `${a.color}10`, color: a.color, border: `1px solid ${a.color}20` }}>
                      {a.label}
                    </span>
                  ))}
                </div>
                <a href="https://advertising.coupang.com" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-auto px-3 py-1 rounded-lg text-[10px] font-bold" style={{ background: "#dc2626", color: "#fff" }}>광고센터 →</a>
              </div>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* TAB: 상위노출 */}
      {/* ════════════════════════════════════════════ */}
      {tab === "exposure" && (
        <ExposureAnalysis data={exposureData} />
      )}

      </div>{/* 탭 콘텐츠 minHeight 닫기 */}
    </div>

    {/* ════════════════════════════════════════════ */}
    {/* 광고 등록 모달                               */}
    {/* ════════════════════════════════════════════ */}
    {registerModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setRegisterModal(null); setRegisterError(null); }}>
        <div
          className="relative w-full max-w-lg rounded-2xl p-6 space-y-4 overflow-y-auto max-h-[90vh]"
          style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-xl)", border: "1px solid var(--border-subtle)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black text-white" style={{ background: registerModal.color }}>{registerModal.grade}</span>
              <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>광고 등록</span>
            </div>
            <button onClick={() => { setRegisterModal(null); setRegisterError(null); }} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)]"><XCircle size={16} style={{ color: "var(--text-tertiary)" }} /></button>
          </div>

          {/* 중복 캠페인 경고 */}
          {registerError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12px]" style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#92400E" }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "#F59E0B" }} />
              <span>{registerError}</span>
            </div>
          )}

          {/* 캠페인명 / 그룹명 */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "캠페인 이름", key: "campaignName" as const },
              { label: "광고 그룹 이름", key: "adGroupName" as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                <input
                  className="w-full px-2.5 py-1.5 rounded-lg text-[12px] font-semibold"
                  style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                  value={registerModal[key]}
                  onChange={e => setRegisterModal(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                />
              </div>
            ))}
          </div>

          {/* 예산 / 운영방식 / 입찰가 */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "일예산 (원)", key: "dailyBudget" as const, type: "number" },
              { label: "스마트타겟팅 입찰가 (원)", key: "smartTargetingBid" as const, type: "number" },
              { label: "비검색 입찰가 (원)", key: "nonSearchBid" as const, type: "number" },
              { label: "목표 ROAS (%)", key: "targetRoas" as const, type: "number" },
            ].map(({ label, key }) => (
              <div key={key}>
                <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
                <input
                  type="number"
                  className="w-full px-2.5 py-1.5 rounded-lg text-[12px] font-semibold tabular-nums"
                  style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                  value={registerModal[key]}
                  onChange={e => setRegisterModal(prev => prev ? { ...prev, [key]: Number(e.target.value) } : prev)}
                />
              </div>
            ))}
          </div>

          {/* 운영 방식 */}
          <div>
            <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-tertiary)" }}>광고 운영 방식</div>
            <div className="flex gap-1.5">
              {(["직접입력", "자동운영_매출최적화", "자동운영_매출스타트"] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setRegisterModal(prev => prev ? { ...prev, operationMode: mode } : prev)}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                  style={registerModal.operationMode === mode
                    ? { background: registerModal.color, color: "#fff" }
                    : { background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }
                  }
                >{mode.replace("자동운영_", "자동:")}</button>
              ))}
            </div>
          </div>

          {/* 상품 목록 */}
          <div>
            <div className="text-[10px] font-semibold mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              광고 상품 ({registerModal.products.length}개)
            </div>
            <div className="rounded-lg overflow-hidden max-h-32 overflow-y-auto" style={{ border: "1px solid var(--border-subtle)" }}>
              {registerModal.products.slice(0, 10).map((p, i) => (
                <div key={i} className="flex items-center justify-between px-2.5 py-1.5" style={{ borderBottom: i < registerModal.products.length - 1 ? "1px solid var(--border-subtle)" : "none", background: i % 2 === 0 ? "var(--surface-sunken)" : "var(--card-bg)" }}>
                  <span className="text-[11px] truncate" style={{ color: "var(--text-primary)" }}>{p.productName}</span>
                </div>
              ))}
              {registerModal.products.length > 10 && (
                <div className="px-2.5 py-1.5 text-center text-[10px]" style={{ color: "var(--text-tertiary)" }}>+{registerModal.products.length - 10}개 더</div>
              )}
            </div>
          </div>

          {/* 키워드 */}
          {registerModal.keywords.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                키워드 ({registerModal.keywords.length}개)
              </div>
              <div className="flex flex-wrap gap-1">
                {registerModal.keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: `${registerModal.color}12`, color: registerModal.color, border: `1px solid ${registerModal.color}20` }}>
                    {kw.keyword} <span className="opacity-60">{kw.bidPrice.toLocaleString()}원</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 확인 버튼 */}
          <button
            disabled={registerLoading}
            onClick={async () => {
              setRegisterLoading(true);
              setRegisterError(null);
              try {
                await apiClient.post("/api/ads/campaigns/register", {
                  campaignName: registerModal.campaignName,
                  adGroupName: registerModal.adGroupName,
                  grade: registerModal.grade,
                  dailyBudget: registerModal.dailyBudget,
                  operationMode: registerModal.operationMode,
                  products: registerModal.products,
                  smartTargetingBid: registerModal.smartTargetingBid,
                  keywords: registerModal.keywords,
                  nonSearchBid: registerModal.nonSearchBid,
                  targetRoas: registerModal.targetRoas,
                });
                setRegisterModal(null);
                setRegisterError(null);
              } catch (err) {
                const { isApiError } = await import("@/lib/api-error");
                if (isApiError(err) && err.status === 409) {
                  setRegisterError(err.detail);
                }
                // 409 외 에러는 apiClient 전역 toast.error 처리
              } finally {
                setRegisterLoading(false);
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
            style={{ background: registerLoading ? "var(--text-quaternary)" : registerModal.color }}
          >
            <Megaphone size={14} />
            {registerLoading ? "등록 중..." : "광고 등록 실행"}
          </button>
        </div>
      </div>
    )}
    </>
  );
}

// ===== 상품별 전략 행 (키워드 전략 포함) =====
function ProductStrategyRow({ action: a, gradeBudget, gradeCount, color, expanded, onToggle, isNew, compact }: {
  action: StrategyAction; gradeBudget: number; gradeCount: number; color: string;
  expanded: boolean; onToggle: () => void; isNew?: boolean; compact?: boolean;
}) {
  const productBudget = gradeCount > 0 ? Math.round(gradeBudget / gradeCount) : 0;
  const recBudget = a.recommendedDailyBudget > 0 ? a.recommendedDailyBudget : productBudget;
  const sk = a.suggestedKeywords;
  const px = compact ? "px-3" : "px-5";

  return (
    <div className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
      <button onClick={onToggle} className={`w-full text-left ${px} py-2.5`}>
        {/* 상품명 + ROAS */}
        <div className="flex items-center justify-between gap-1.5 mb-0.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {isNew && <span className="shrink-0 px-1 py-px rounded text-[8px] font-bold text-white" style={{ background: "#6366f1" }}>N</span>}
            <span className={`${compact ? "text-[11px]" : "text-[13px]"} font-bold truncate`} style={{ color: "var(--text-primary)" }}>{a.productName}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`font-black tabular-nums ${compact ? "text-[12px]" : "text-[15px]"} ${a.currentRoas >= 300 ? "text-emerald-600" : a.currentRoas >= 100 ? "text-amber-600" : a.currentRoas > 0 ? "text-red-500" : ""}`} style={a.currentRoas === 0 ? { color: "var(--text-quaternary)" } : {}}>
              {a.currentRoas > 0 ? `${a.currentRoas}%` : "-"}
            </span>
            <ChevronDown size={11} className={`transition-transform ${expanded ? "rotate-180" : ""}`} style={{ color: "var(--text-quaternary)" }} />
          </div>
        </div>
        {/* 예산·입찰·우선순위 */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          <span>{recBudget.toLocaleString()}원/일</span>
          <span>·</span>
          <span>입찰 {a.maxBidPrice > 0 ? `${a.maxBidPrice.toLocaleString()}원` : "-"}</span>
          <span>·</span>
          <span className={`font-bold ${a.actionPriority === "urgent" ? "text-red-600" : a.actionPriority === "high" ? "text-orange-600" : ""}`}>
            {a.actionPriority === "urgent" ? "긴급" : a.actionPriority === "high" ? "높음" : a.actionPriority === "medium" ? "보통" : "낮음"}
          </span>
        </div>
      </button>

      {/* 펼침: 키워드 전략 상세 */}
      {expanded && (
        <div className={`${px} pb-3 space-y-2`}>
          {/* 캠페인 전략 */}
          <div className="rounded-lg p-2.5" style={{ background: `${color}06`, border: `1px solid ${color}18` }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Target size={11} style={{ color }} />
              <span className="text-[9px] font-bold uppercase" style={{ color }}>캠페인 전략</span>
            </div>
            <div className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{a.campaignStrategy}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{a.recommendedAction}</div>
          </div>

          {/* 키워드 전략 */}
          <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-1.5">
              <Search size={10} style={{ color: "var(--text-secondary)" }} />
              <span className="text-[9px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>키워드 전략</span>
            </div>

            {a.keywords && a.keywords.length > 0 && (
              <div>
                <div className="text-[9px] font-semibold mb-0.5" style={{ color: "var(--text-tertiary)" }}>운영 중</div>
                <div className="flex flex-wrap gap-0.5">
                  {a.keywords.slice(0, 6).map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-semibold" style={{ background: `${color}10`, color, border: `1px solid ${color}20` }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {sk?.main?.length > 0 && (
              <div>
                <span className="text-[9px] font-bold px-1 py-px rounded mr-1" style={{ background: "#dc262612", color: "#dc2626" }}>메인</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {sk.main.map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-bold" style={{ background: "#dc26260a", color: "#dc2626", border: "1px solid #dc262618" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {sk?.sub?.length > 0 && (
              <div>
                <span className="text-[9px] font-bold px-1 py-px rounded mr-1" style={{ background: "#2563eb12", color: "#2563eb" }}>서브</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {sk.sub.map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-semibold" style={{ background: "#2563eb08", color: "#2563eb", border: "1px solid #2563eb15" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {sk?.longtail?.length > 0 && (
              <div>
                <span className="text-[9px] font-bold px-1 py-px rounded mr-1" style={{ background: "#05966912", color: "#059669" }}>롱테일</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {sk.longtail.map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-medium" style={{ background: "#05966908", color: "#059669", border: "1px solid #05966912" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {sk?.negative?.length > 0 && (
              <div>
                <span className="text-[9px] font-bold px-1 py-px rounded mr-1" style={{ background: "#6b728010", color: "#6b7280" }}>제외</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {sk.negative.map((kw, ki) => (
                    <span key={ki} className="px-1.5 py-px rounded text-[9px] font-medium line-through" style={{ background: "#f4f5f7", color: "#9ca3af" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 벤치마크 상태 스타일
const BENCH_STATUS: Record<string, { bg: string; text: string; label: string; dot: string; cardBg: string; cardBorder: string }> = {
  excellent: { bg: "bg-emerald-50", text: "text-emerald-700", label: "최우수", dot: "bg-emerald-500", cardBg: "bg-emerald-50/60", cardBorder: "border-emerald-300" },
  good: { bg: "bg-blue-50", text: "text-blue-700", label: "우수", dot: "bg-blue-500", cardBg: "bg-blue-50/60", cardBorder: "border-blue-300" },
  average: { bg: "bg-yellow-50", text: "text-yellow-700", label: "평균", dot: "bg-yellow-500", cardBg: "bg-amber-50/40", cardBorder: "border-amber-300" },
  below: { bg: "bg-orange-50", text: "text-orange-700", label: "미달", dot: "bg-orange-500", cardBg: "bg-orange-50/60", cardBorder: "border-orange-300" },
  poor: { bg: "bg-red-50", text: "text-red-700", label: "위험", dot: "bg-red-500", cardBg: "bg-red-50/60", cardBorder: "border-red-300" },
};

// ===== 광고 AI 액션 / 해야할 일 탭 패널 =====
function AdSidePanel({ rules, strategy }: { rules: AdRuleRec[]; strategy: StrategyData | null }) {
  const [panelTab, setPanelTab] = useState<"todos" | "alerts">("todos");

  const todos = useMemo(() => {
    const items: { label: string; detail: string; priority: string }[] = [];
    if (strategy?.adIssues) {
      const iss = strategy.adIssues;
      if (iss.zeroConversion > 0) items.push({ label: `전환 0 상품 ${iss.zeroConversion}개 — 키워드 OFF`, detail: "클릭만 발생, 전환 없는 광고 중단", priority: "urgent" });
      if (iss.cGradeHighTier > 0) items.push({ label: `C등급 고광고 ${iss.cGradeHighTier}개 — 광고 축소`, detail: "C등급에 1차 광고 배정 중", priority: "high" });
      if (iss.aGradeNoAd > 0) items.push({ label: `A등급 미광고 ${iss.aGradeNoAd}개 — 광고 시작`, detail: "핵심 상품에 광고 미배정", priority: "high" });
      if (iss.lowRoas > 0) items.push({ label: `저ROAS ${iss.lowRoas}개 — 입찰가 하향`, detail: "ROAS 200% 미만 캠페인", priority: "medium" });
    }
    strategy?.actions?.forEach(a => {
      if (a.actionPriority === "urgent" || a.actionPriority === "high") {
        items.push({ label: `${a.productName?.substring(0, 18)}`, detail: a.recommendedAction, priority: a.actionPriority });
      }
    });
    return items.slice(0, 15);
  }, [strategy]);

  const todoCount = todos.length;
  const alertCount = rules.length;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full" style={{ background: "#ffffff", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <button onClick={() => setPanelTab("todos")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={panelTab === "todos" ? { background: "var(--primary)", color: "#fff" } : { color: "var(--text-tertiary)" }}>
          <Sparkles size={13} />
          할 일 {todoCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: panelTab === "todos" ? "#fff" : "var(--primary)", color: panelTab === "todos" ? "var(--primary)" : "#fff" }}>{todoCount}</span>}
        </button>
        <button onClick={() => setPanelTab("alerts")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={panelTab === "alerts" ? { background: "var(--danger)", color: "#fff" } : { color: "var(--text-tertiary)" }}>
          <AlertTriangle size={13} />
          알림 {alertCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] text-white" style={{ background: "var(--danger)" }}>{alertCount}</span>}
        </button>
      </div>

      {panelTab === "todos" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {todos.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-quaternary)" }}>처리할 업무가 없습니다</div>
          ) : todos.map((t, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: t.priority === "urgent" ? "var(--danger)" : t.priority === "high" ? "var(--warning)" : "var(--text-tertiary)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{t.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {panelTab === "alerts" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {rules.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-quaternary)" }}>알림이 없습니다</div>
          ) : rules.map((r, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{ background: r.priority === "urgent" ? "var(--danger)" : r.priority === "high" ? "var(--warning)" : "var(--text-tertiary)" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{r.action}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

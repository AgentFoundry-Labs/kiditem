"use client";

import { useState, useMemo } from "react";
import { RefreshCw, Brain, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import PageSkeleton from "@/components/ui/PageSkeleton";
import ScrapeCollector from "@/app/ads/collect/components/ScrapeCollector";
import {
  useAdOpsData,
  useAdOpsSelectedCampaign,
  useRegisterCampaign,
  useAiRefreshPlan,
} from "./hooks/useAdOpsData";
import type { RegisterCampaignPayload } from "./hooks/useAdOpsData";
import { TABS } from "./lib/types";
import type { TabKey } from "./lib/types";
import KpiDashboard from "./components/KpiDashboard";
import StatusContent from "./components/StatusContent";
import StrategyContent from "./components/StrategyContent";
import RegisterCampaignModal from "./components/RegisterCampaignModal";
import ExposureAnalysis from "./components/ExposureAnalysis";

export default function AdOpsPage() {
  const [tab, setTab] = useState<TabKey>("status");
  const [period, setPeriod] = useState("14d");
  const [campaignOrder, setCampaignOrder] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [prodPage, setProdPage] = useState(1);
  const [prodPageSize] = useState(20);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<Record<string, "all" | "existing" | "new" | "recommended">>({ A: "all", B: "all", C: "all" });
  const [gradeSearch, setGradeSearch] = useState<Record<string, string>>({ A: "", B: "", C: "" });
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [totalBudget, setTotalBudget] = useState<number>(300000);
  const [budgetInput, setBudgetInput] = useState("300,000");
  const [registerModal, setRegisterModal] = useState<RegisterCampaignPayload | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const {
    campaigns: campaignsQuery,
    rules: rulesQuery,
    wingStatus: wingStatusQuery,
    strategy: strategyQuery,
    dashboard: dashboardQuery,
    trends: trendsQuery,
    exposure: exposureQuery,
    trafficSummary: trafficSummaryQuery,
    isLoading,
  } = useAdOpsData(period, tab);

  const campaignProductsQuery = useAdOpsSelectedCampaign(selectedCampaign, period);
  const registerMutation = useRegisterCampaign();

  // ── Derived data ──
  const rawCampaigns = campaignsQuery.data?.campaigns ?? [];
  const totalKpi = campaignsQuery.data?.totalKpi ?? {};
  const sortedCampaigns = useMemo(
    () =>
      [...rawCampaigns].sort((a, b) => {
        if (b.adRevenue !== a.adRevenue) return b.adRevenue - a.adRevenue;
        if ((b.roas ?? 0) !== (a.roas ?? 0)) return (b.roas ?? 0) - (a.roas ?? 0);
        return b.clicks - a.clicks;
      }),
    [rawCampaigns],
  );

  const campaignOrderToUse =
    campaignOrder.length === sortedCampaigns.length
      ? campaignOrder
      : sortedCampaigns.map((c) => c.campaignName);

  const rules = rulesQuery.data?.recommendations ?? [];
  const wingKpis = wingStatusQuery.data?.wing?.kpis ?? {};
  const strategy = strategyQuery.data ?? null;
  const wingAdData = dashboardQuery.data?.trafficKpi?.adSummary ?? null;
  const trafficSummary = trafficSummaryQuery.data ?? null;
  const trends = trendsQuery.data ?? null;
  const exposureData = exposureQuery.data ?? null;
  const products = campaignProductsQuery.data?.products ?? [];

  const roas = totalKpi.roas || 0;
  const urgentCount = rules.filter((r) => r.priority === "urgent").length;

  const camp = sortedCampaigns.find((c) => c.campaignName === selectedCampaign);
  const totalPages = Math.ceil(products.length / prodPageSize);
  const pagedProducts = products.slice((prodPage - 1) * prodPageSize, prodPage * prodPageSize);

  const orderedCampaigns = campaignOrderToUse
    .map((name) => sortedCampaigns.find((c) => c.campaignName === name))
    .filter(Boolean) as typeof sortedCampaigns;

  const aiRefreshMutation = useAiRefreshPlan(period);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary() });
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const newOrder = [...campaignOrderToUse];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(idx, 0, moved);
    setCampaignOrder(newOrder);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const handleRegisterSubmit = async () => {
    if (!registerModal) return;
    setRegisterError(null);
    try {
      await registerMutation.mutateAsync(registerModal);
      setRegisterModal(null);
      setRegisterError(null);
    } catch (err) {
      const { isApiError } = await import("@/lib/api-error");
      if (isApiError(err) && err.status === 409) {
        setRegisterError(err.detail);
      }
    }
  };

  if (isLoading) return <PageSkeleton variant="dashboard" />;

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
              <span className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-tertiary)" }}>{period === 'month' ? '이번달 기준' : period === '14d' ? '14일 기준' : '7일 기준'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ScrapeCollector onComplete={handleRefresh} />
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
            <button onClick={handleRefresh} className="p-2.5 rounded-lg transition-colors" style={{ color: "var(--text-tertiary)" }} title="새로고침">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* ════════ KPI 대시보드 ════════ */}
        <KpiDashboard
          totalKpi={totalKpi}
          wingAdData={wingAdData}
          period={period}
          roas={roas}
          trendsDaily={(trendsQuery.data as any)?.daily ?? null}
        />

        {/* ════════ 탭 네비게이션 ════════ */}
        <div className="rounded-2xl px-3 py-3 flex items-center gap-1.5" style={{ background: "var(--primary)" }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-all"
                style={isActive ? { background: "#ffffff", color: "var(--primary)", boxShadow: "var(--shadow-sm)" } : { color: "rgba(255,255,255,0.7)" }}>
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ════════ 탭 콘텐츠 ════════ */}
        <div style={{ minHeight: 600 }}>
          {tab === "status" && (
            <StatusContent
              rules={rules}
              strategy={strategy}
              trends={trends}
              wingKpis={wingKpis}
              orderedCampaigns={orderedCampaigns}
              selectedCampaign={selectedCampaign}
              camp={camp}
              pagedProducts={pagedProducts}
              products={products}
              prodPage={prodPage}
              prodPageSize={prodPageSize}
              totalPages={totalPages}
              period={period}
              onSelectCampaign={(name) => { setSelectedCampaign(name); setProdPage(1); }}
              onClearCampaign={() => setSelectedCampaign(null)}
              onSetProdPage={setProdPage}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            />
          )}

          {tab === "strategy" && (
            <StrategyContent
              strategy={strategy}
              rules={rules}
              totalBudget={totalBudget}
              budgetInput={budgetInput}
              expandedProduct={expandedProduct}
              gradeFilter={gradeFilter}
              gradeSearch={gradeSearch}
              selectedGrade={selectedGrade}
              onBudgetChange={(value, input) => { setTotalBudget(value); setBudgetInput(input); }}
              onExpandProduct={setExpandedProduct}
              onGradeFilter={(grade, filter) => setGradeFilter(prev => ({ ...prev, [grade]: filter }))}
              onGradeSearch={(grade, search) => setGradeSearch(prev => ({ ...prev, [grade]: search }))}
              onSelectGrade={setSelectedGrade}
              onOpenRegisterModal={(payload) => { setRegisterError(null); setRegisterModal(payload); }}
              onAiRefresh={() => aiRefreshMutation.mutate()}
              isAiRefreshing={aiRefreshMutation.isPending}
            />
          )}

          {tab === "exposure" && (
            <ExposureAnalysis data={exposureData} />
          )}
        </div>
      </div>

      {/* ════════ 광고 등록 모달 ════════ */}
      {registerModal && (
        <RegisterCampaignModal
          registerModal={registerModal}
          registerError={registerError}
          registerMutation={registerMutation}
          onClose={() => { setRegisterModal(null); setRegisterError(null); }}
          onUpdate={setRegisterModal}
          onSubmit={handleRegisterSubmit}
        />
      )}
    </>
  );
}

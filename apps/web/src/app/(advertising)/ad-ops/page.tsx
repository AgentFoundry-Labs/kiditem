"use client";

import { useState } from "react";
import { RefreshCw, Brain, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import PageSkeleton from "@/components/ui/PageSkeleton";
import ScrapeCollector from "./components/ScrapeCollector";
import {
  useAdOpsData,
  useRegisterCampaign,
} from "./hooks/useAdOpsData";
import { TABS } from "./lib/types";
import KpiDashboard from "./components/KpiDashboard";
import StatusContent from "./components/StatusContent";
import type { AdCollectionPeriod } from "./components/AdCollectionDailyChart";
import StrategyContent from "./components/StrategyContent";
import CampaignContent from "./components/CampaignContent";
import AdProductsContent from "./components/AdProductsContent";
import RegisterCampaignModal from "./components/RegisterCampaignModal";
import ExposureAnalysis from "./components/ExposureAnalysis";
import type { TabKey } from "./lib/types";
import type { RegisterCampaignPayload } from "./hooks/useAdOpsData";
import type { CampaignSelection } from "./components/CampaignTable";

export default function AdOpsPage() {
  const [tab, setTab] = useState<TabKey>("status");
  const [period, setPeriod] = useState<AdCollectionPeriod>("14d");
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<Record<string, "all" | "existing" | "new" | "recommended">>({ A: "all", B: "all", C: "all" });
  const [gradeSearch, setGradeSearch] = useState<Record<string, string>>({ A: "", B: "", C: "" });
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [totalBudget, setTotalBudget] = useState<number>(300000);
  const [budgetInput, setBudgetInput] = useState("300,000");
  const [registerModal, setRegisterModal] = useState<RegisterCampaignPayload | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [initialCampaign, setInitialCampaign] = useState<CampaignSelection | null>(null);

  const queryClient = useQueryClient();

  const {
    campaigns: campaignsQuery,
    rules: rulesQuery,
    wingStatus: wingStatusQuery,
    strategy: strategyQuery,
    dashboard: dashboardQuery,
    trends: trendsQuery,
    exposure: exposureQuery,
    isLoading,
    isRefreshing,
  } = useAdOpsData(period, tab);

  const registerMutation = useRegisterCampaign();

  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const totalKpi = campaignsQuery.data?.totalKpi ?? {};
  const rules = rulesQuery.data?.recommendations ?? [];
  const wingKpis = wingStatusQuery.data?.wing?.kpis ?? {};
  const strategy = strategyQuery.data ?? null;
  const wingAdData = dashboardQuery.data?.wingAdData ?? null;
  const trends = trendsQuery.data ?? null;
  const exposureData = exposureQuery.data ?? null;
  const accountSummary = trends?.accountSummary ?? strategy?.accountSummary ?? null;

  const roas = totalKpi.roas || 0;
  const urgentCount = rules.filter((r) => r.priority === "urgent").length;
  const trendsDaily = trends?.daily.map((d) => ({
    spend: d.metrics.spend,
    revenue: d.metrics.revenue,
    clicks: d.metrics.clicks,
    impressions: d.metrics.impressions,
    conversions: d.metrics.conversions,
    roas: d.metrics.roas ?? 0,
    ctr: d.metrics.ctr ?? 0,
    cvr: d.metrics.cvr ?? 0,
  })) ?? null;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  const handleGoToCampaign = (campaign?: CampaignSelection) => {
    setInitialCampaign(campaign ?? null);
    setTab("campaign");
  };

  const handleStrategyRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.plan(period) });
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.rules(period) });
  };

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--primary)" }}>
              <Brain size={20} className="text-white" />
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-primary)" }}>광고 전략</h1>
              <span className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--text-tertiary)" }}>{period === "month" ? "이번달 기준" : period === "14d" ? "14일 기준" : "7일 기준"}</span>
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
              {([{ key: "7d", label: "7일" }, { key: "14d", label: "14일" }, { key: "month", label: "이번달" }] as const).map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className="px-4 py-1.5 text-sm font-semibold rounded-md transition-all"
                  style={period === p.key ? { background: "var(--primary)", color: "#ffffff", boxShadow: "var(--shadow-sm)" } : { color: "var(--text-tertiary)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2.5 rounded-lg transition-colors disabled:opacity-50" style={{ color: "var(--text-tertiary)" }} title="새로고침">
              <RefreshCw size={16} className={isRefreshing ? "animate-spin" : undefined} />
            </button>
          </div>
        </div>

        {isRefreshing && (
          <div className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }} aria-live="polite">
            <RefreshCw size={14} className="animate-spin" style={{ color: "var(--primary)" }} />
            {period === "month" ? "이번달" : period === "14d" ? "14일" : "7일"} 광고 데이터를 갱신 중입니다.
          </div>
        )}

        <div aria-busy={isRefreshing}>
        <KpiDashboard
          totalKpi={totalKpi}
          wingAdData={wingAdData}
          period={period}
          roas={roas}
          trendsDaily={trendsDaily}
          accountSummary={accountSummary}
        />
        </div>

        <div className="rounded-2xl px-3 py-3 flex items-center gap-1.5" style={{ background: "var(--primary)" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-all"
                style={isActive ? { background: "#ffffff", color: "var(--primary)", boxShadow: "var(--shadow-sm)" } : { color: "rgba(255,255,255,0.7)" }}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ minHeight: 600 }} aria-busy={isRefreshing}>
          {tab === "status" && (
              <StatusContent
                rules={rules}
                strategy={strategy}
                trends={trendsQuery.isPlaceholderData ? null : trends}
              wingKpis={wingKpis}
              campaigns={campaigns}
              onGoToCampaign={handleGoToCampaign}
              period={period}
              onPeriodChange={setPeriod}
              extensionStatus={wingStatusQuery.data ?? null}
            />
          )}

          {tab === "strategy" && (
            <StrategyContent
              strategy={strategy}
              rules={rules}
              trends={trends}
              period={period}
              totalBudget={totalBudget}
              budgetInput={budgetInput}
              expandedProduct={expandedProduct}
              gradeFilter={gradeFilter}
              gradeSearch={gradeSearch}
              selectedGrade={selectedGrade}
              onBudgetChange={(value, input) => { setTotalBudget(value); setBudgetInput(input); }}
              onExpandProduct={setExpandedProduct}
              onGradeFilter={(grade, filter) => setGradeFilter((prev) => ({ ...prev, [grade]: filter }))}
              onGradeSearch={(grade, search) => setGradeSearch((prev) => ({ ...prev, [grade]: search }))}
              onSelectGrade={setSelectedGrade}
              onOpenRegisterModal={(payload) => { setRegisterError(null); setRegisterModal(payload); }}
              onRefresh={handleStrategyRefresh}
              isRefreshing={strategyQuery.isFetching || rulesQuery.isFetching}
            />
          )}

          {tab === "campaign" && (
            <CampaignContent initialCampaign={initialCampaign} period={period} />
          )}

          {tab === "products" && (
            <AdProductsContent period={period} />
          )}

          {tab === "exposure" && (
            <ExposureAnalysis data={exposureData} />
          )}
        </div>
      </div>

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

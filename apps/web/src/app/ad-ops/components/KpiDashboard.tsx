"use client";

import {
  TrendingUp, Megaphone, BarChart3, Zap,
} from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { parseKoreanNumber } from "@/lib/parse-korean-number";

interface KpiDashboardProps {
  totalKpi: Record<string, number>;
  wingAdData: Record<string, string> | null;
  period: string;
  roas: number;
}

export default function KpiDashboard({ totalKpi, wingAdData, period, roas }: KpiDashboardProps) {
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

  const revenueGoal = 2000000;
  const spendGoal = 500000;
  const revenuePct = Math.min((adRevenue / revenueGoal) * 100, 100);
  const revenueAchieve = Math.round((adRevenue / revenueGoal) * 100);
  const spendPct = Math.min((adSpend / spendGoal) * 100, 100);
  const spendOver = adSpend > spendGoal;

  const periodLabel = period === "month" ? "30일" : period === "14d" ? "14일" : "7일";

  const renderSmallCard = (kpi: { label: string; value: string; unit: string; current: number; goal: number; goalLabel: string; invertGoal: boolean; accentColor: string; icon: typeof BarChart3; avg: number | null }) => {
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
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{periodLabel} 누적</div>
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
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{periodLabel} 누적</div>
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
}

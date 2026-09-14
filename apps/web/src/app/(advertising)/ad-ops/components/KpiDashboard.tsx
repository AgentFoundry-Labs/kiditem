"use client";

import { TrendingUp, Megaphone, BarChart3, Zap } from "lucide-react";
import type { AdTrendsSummary } from "@kiditem/shared/advertising";
import { formatKRW, formatNumber, formatPercent } from "@/lib/utils";
import { adTrendsSourceLabel } from "../lib/trends-source";

interface KpiDashboardProps {
  /** Campaign-sweep account totals over the measured days of the page period. */
  summary: AdTrendsSummary | null;
  period: string;
}

type SmallKpi = {
  label: string;
  value: string;
  basis: string;
  accentColor: string;
  icon: typeof BarChart3;
};

const CARD_STYLE = {
  background: "var(--card-bg)",
  boxShadow: "var(--shadow-sm)",
  border: "1px solid var(--border-subtle)",
} as const;

/** A quotient exists only when both sides were measured and the divisor is positive. */
function quotient(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0
    ? numerator / denominator
    : null;
}

function won(value: number | null): string {
  return value === null ? "-" : `${formatKRW(value)}원`;
}

function periodLabel(period: string): string {
  return period === "month" ? "이번달" : period === "14d" ? "14일" : "7일";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function SmallKpiCard({ kpi }: { kpi: SmallKpi }) {
  const Icon = kpi.icon;
  return (
    <div className="rounded-xl p-3.5 flex flex-col justify-between transition-colors hover:border-slate-300" style={CARD_STYLE}>
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Icon size={14} style={{ color: kpi.accentColor }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: kpi.accentColor }}>{kpi.label}</span>
        </div>
        <span className="text-xl font-extrabold tabular-nums" style={{ color: kpi.accentColor }}>{kpi.value}</span>
      </div>
      <div className="mt-2 pt-1.5 text-[10px]" style={{ color: "var(--text-tertiary)", borderTop: `1px solid ${kpi.accentColor}20` }}>
        {kpi.basis}
      </div>
    </div>
  );
}

export default function KpiDashboard({ summary, period }: KpiDashboardProps) {
  const metrics = summary?.metrics ?? null;
  const revenue = metrics?.revenue ?? null;
  const spend = metrics?.spend ?? null;
  const impressions = metrics?.impressions ?? null;
  const clicks = metrics?.clicks ?? null;
  const conversions = metrics?.conversions ?? null;
  // Averages divide by the server's measured-day count, never a browser-clock window.
  const measuredDays = summary?.periodDayCount ?? null;

  const dailyRevenue = quotient(revenue, measuredDays);
  const dailySpend = quotient(spend, measuredDays);
  const costPerClick = quotient(spend, clicks);
  const costPerConversion = quotient(spend, conversions);
  const spendShare = quotient(spend, revenue);
  // This endpoint has no total-sales reader, so the share is spend over ad-attributed revenue.
  const spendToAdRevenue = spendShare === null ? null : spendShare * 100;

  const caption = summary
    ? `${periodLabel(period)} 중 측정 ${formatNumber(summary.periodDayCount)}일 · ${adTrendsSourceLabel(summary)}`
    : "-";

  const smallKpis: SmallKpi[] = [
    { label: "ROAS", value: formatPercent(metrics?.roas ?? null), basis: "광고 전환 매출 ÷ 광고비", accentColor: "#733de5", icon: BarChart3 },
    { label: "광고비/전환매출", value: formatPercent(spendToAdRevenue), basis: "광고비 ÷ 광고 전환 매출", accentColor: "#dc2626", icon: Megaphone },
    { label: "CTR", value: formatPercent(metrics?.ctr ?? null), basis: "클릭 ÷ 노출", accentColor: "#0891b2", icon: Zap },
    { label: "CVR", value: formatPercent(metrics?.cvr ?? null), basis: "전환 ÷ 클릭", accentColor: "#059669", icon: TrendingUp },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ alignItems: "stretch" }}>
      {/* ─── HERO 1: 전환 매출 (2-row) ─── */}
      <div className="lg:row-span-2 rounded-xl px-5 py-4 flex flex-col justify-between" style={CARD_STYLE}>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={18} style={{ color: "var(--primary)" }} />
            <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--primary)" }}>광고 전환 매출</span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-3xl font-extrabold tabular-nums tracking-tight" style={{ color: "var(--primary)" }}>{formatKRW(revenue)}</span>
            {revenue !== null && (
              <span className="text-base font-semibold" style={{ color: "var(--primary)", opacity: 0.6 }}>원</span>
            )}
          </div>
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{caption}</div>
        </div>
        <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: "1px solid rgba(147,51,234,0.15)" }}>
          <DetailRow label="일평균 전환매출" value={won(dailyRevenue)} />
          <DetailRow label="노출수" value={formatNumber(impressions)} />
          <DetailRow label="클릭수" value={formatNumber(clicks)} />
          <DetailRow label="전환수" value={conversions === null ? "-" : `${formatNumber(conversions)}건`} />
        </div>
      </div>

      {/* ─── HERO 2: 집행 광고비 (2-row) ─── */}
      <div className="lg:row-span-2 rounded-xl px-5 py-4 flex flex-col justify-between" style={CARD_STYLE}>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Megaphone size={18} style={{ color: "#059669" }} />
            <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "#059669" }}>집행 광고비</span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-3xl font-extrabold tabular-nums tracking-tight" style={{ color: "#059669" }}>{formatKRW(spend)}</span>
            {spend !== null && (
              <span className="text-base font-semibold" style={{ color: "#059669", opacity: 0.6 }}>원</span>
            )}
          </div>
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{caption}</div>
        </div>
        <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: "1px solid rgba(5,150,105,0.15)" }}>
          <DetailRow label="CPC" value={won(costPerClick)} />
          <DetailRow label="일평균 광고비" value={won(dailySpend)} />
          <DetailRow label="건당 광고비" value={won(costPerConversion)} />
        </div>
      </div>

      {/* ─── 우측: ROAS · 광고비/전환매출 · CTR · CVR ─── */}
      {smallKpis.map((kpi) => <SmallKpiCard key={kpi.label} kpi={kpi} />)}
    </div>
  );
}

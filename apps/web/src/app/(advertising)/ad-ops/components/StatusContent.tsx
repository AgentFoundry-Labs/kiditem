"use client";

import { Megaphone, AlertTriangle, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn, formatKRW, formatNumber, formatDateTime } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { roasColor } from "../lib/status-colors";
import AdSidePanel from "./AdSidePanel";
import AdCollectionDailyChart from "./AdCollectionDailyChart";
import type { AdCollectionPeriod } from "./AdCollectionDailyChart";
import type { AdWeeklyPlan, AdTrendsData, AdCampaignSnapshot, AdExtensionStatus, AdStrategyAction } from "@kiditem/shared/advertising";
import type { CampaignSelection } from "./CampaignTable";

export function CampaignSummary({ campaigns, onSelect }: { campaigns: AdCampaignSnapshot[]; onSelect: (campaign?: CampaignSelection) => void }) {
  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () =>
      apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>(
        "/api/ads/config",
      ),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const top = campaigns
    .filter((campaign) => campaign.metricsAvailable !== false)
    .slice(0, 5);
  if (top.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <Megaphone size={14} style={{ color: "var(--primary)" }} />
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>캠페인 현황</h3>
        </div>
        <button onClick={() => onSelect()} className="text-xs font-semibold flex items-center gap-0.5" style={{ color: "var(--primary)" }}>
          전체보기 <ChevronRight size={12} />
        </button>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {top.map((c) => {
          const rowKey = `${c.channelAccountId}:${c.campaignIdentity}`;
          const displayName = c.campaignName ?? c.listing?.masterProduct.name ?? "알 수 없는 캠페인";
          const campaignState = (c.onOff ?? c.status)?.trim().toUpperCase() || null;
          return (
            <button
              key={rowKey}
              type="button"
              onClick={() => onSelect({
                channelAccountId: c.channelAccountId,
                campaignIdentity: c.campaignIdentity,
                campaignName: displayName,
              })}
              className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {displayName}
                  </span>
                  {campaignState && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={campaignState === "ON"
                        ? { background: "var(--primary-soft)", color: "var(--success)" }
                        : { background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}
                    >
                      {campaignState}
                    </span>
                  )}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  클릭 {formatNumber(c.metrics.clicks)} · 전환 {c.conversionsAvailable ? formatNumber(c.metrics.conversions) : "-"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {formatKRW(c.metrics.revenue)}원
                </div>
                <div className={cn("text-[11px] font-semibold tabular-nums", roasColor(c.metrics.roas ?? 0, roasT))}>
                  ROAS {c.metrics.roas ?? 0}%
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface StatusContentProps {
  rules: AdStrategyAction[];
  strategy: AdWeeklyPlan | null;
  trends: AdTrendsData | null;
  wingKpis: Record<string, string | { value: string; change?: string; numValue?: number }>;
  campaigns: AdCampaignSnapshot[];
  onGoToCampaign: (campaign?: CampaignSelection) => void;
  period: AdCollectionPeriod;
  onPeriodChange: (period: AdCollectionPeriod) => void;
  // H3 — current-state extension status surfaced from `/api/ads/extension/status`.
  // Carries `latestScrapeAt` / `latestChannelStateAt` / `rawSnapshotCount` /
  // `currentWinnerObservedListings` (renamed from legacy lifetime counts).
  // `latestScrapePageType` is intentionally NOT rendered — too internal for
  // operators (raw page slug like 'itemwinner'); other consumers may use it.
  extensionStatus?: AdExtensionStatus | null;
}

export default function StatusContent({
  rules,
  strategy,
  trends,
  wingKpis,
  campaigns,
  onGoToCampaign,
  period,
  onPeriodChange,
  extensionStatus,
}: StatusContentProps) {
  return (
    <div className="space-y-5">
      {/* 차트 + 할일/알림 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3" style={{ height: 520 }}>
        <div className="lg:col-span-3 h-full">
          <AdCollectionDailyChart
            initialTrends={trends}
            period={period}
            onPeriodChange={onPeriodChange}
          />
        </div>

        {/* 오른쪽 1칸: 할일 + 알림 */}
        <AdSidePanel rules={rules} strategy={strategy} />
      </div>

      {/* 아이템위너 · 노출 현황 (현재 상태) */}
      {Object.keys(wingKpis).length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <AlertTriangle size={16} style={{ color: "var(--warning)" }} />
            <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>아이템위너 · 노출 현재 상태</h2>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>현재 아이템위너 미보유 항목은 광고 전환율 급감 위험</span>
          </div>
          {/* H3 — current-state observation timeline. `latestChannelStateAt` is the
              max(lastObservedAt) across daily snapshots; `latestScrapeAt` is the
              latest ChannelScrapeRun finished/started time. `rawSnapshotCount`
              replaces the legacy AdSnapshot count. */}
          {extensionStatus && (
            <div className="flex items-center gap-4 mb-4 text-[11px] flex-wrap" style={{ color: "var(--text-tertiary)" }}>
              {extensionStatus.latestChannelStateAt && (
                <span>현재 상태 관측: <span className="tabular-nums font-medium" style={{ color: "var(--text-secondary)" }}>{formatDateTime(extensionStatus.latestChannelStateAt)}</span></span>
              )}
              {extensionStatus.latestScrapeAt && (
                <span>최근 수집: <span className="tabular-nums font-medium" style={{ color: "var(--text-secondary)" }}>{formatDateTime(extensionStatus.latestScrapeAt)}</span></span>
              )}
              <span>원시 수집 <span className="tabular-nums font-medium" style={{ color: "var(--text-secondary)" }}>{formatNumber(extensionStatus.rawSnapshotCount)}건</span></span>
              <span>현재 관측 listing <span className="tabular-nums font-medium" style={{ color: "var(--text-secondary)" }}>{formatNumber(extensionStatus.currentWinnerObservedListings)}/{formatNumber(extensionStatus.listingCount)}</span></span>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(wingKpis).map(([label, raw]) => {
              const isObj = raw && typeof raw === "object";
              const display = isObj ? String((raw as { value?: string; numValue?: number }).value ?? (raw as { numValue?: number }).numValue ?? "") : String(raw);
              const numeric = isObj ? Number((raw as { numValue?: number }).numValue ?? 0) : parseInt(String(raw)) || 0;
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

      {/* 캠페인 현황 요약 */}
      <CampaignSummary campaigns={campaigns} onSelect={onGoToCampaign} />
    </div>
  );
}

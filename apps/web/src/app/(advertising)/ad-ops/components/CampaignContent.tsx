"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { cn, formatKRW } from "@/lib/utils";
import { roasColor } from "../lib/status-colors";
import { toCampaignsResponse } from "../hooks/useAdOpsData";
import { CampaignTable } from "./CampaignTable";
import type { CampaignSelection } from "./CampaignTable";
import { ProductDrilldown } from "./ProductDrilldown";
import type { AdCampaignSnapshot, AdTrendsData } from "@kiditem/shared/advertising";

export default function CampaignContent({
  initialCampaign,
  period,
}: {
  initialCampaign: CampaignSelection | null;
  period: string;
}) {
  const [sortBy, setSortBy] = useState<"revenue" | "roas">("revenue");
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignSelection | null>(initialCampaign);
  const previousPeriod = useRef(period);

  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () =>
      apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>(
        "/api/ads/config",
      ),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const campaignsQuery = useQuery({
    queryKey: queryKeys.ads.campaigns(period),
    queryFn: () =>
      apiClient
        .get<AdCampaignSnapshot[]>(`/api/ads/campaigns?period=${period}`)
        .then(toCampaignsResponse),
  });

  // Trends carries the account-level KPI summary from coupang_ads_daily —
  // useful as a fallback KPI surface when campaign-grain rollups are sparse
  // or fully campaign-attributed (no listing identity).
  const trendsQuery = useQuery({
    queryKey: queryKeys.ads.trends(period),
    queryFn: () => apiClient.get<AdTrendsData>(`/api/ads/campaigns/trends?period=${period}`),
  });
  const isRefreshing =
    (campaignsQuery.isFetching || trendsQuery.isFetching) &&
    !campaignsQuery.isLoading;

  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const campaignKpi = campaignsQuery.data?.totalKpi ?? {};
  const accountSummary = trendsQuery.data?.accountSummary ?? null;
  const performanceCampaignCount = campaigns.filter(
    (campaign) => campaign.metricsAvailable !== false,
  ).length;

  useEffect(() => {
    if (previousPeriod.current === period) return;
    previousPeriod.current = period;
    setSelectedCampaign(null);
  }, [period]);

  useEffect(() => {
    if (campaignsQuery.isLoading || campaignsQuery.isFetching) return;
    setSelectedCampaign((current) => {
      if (!current) return null;
      return campaigns.some(
        (campaign) =>
          campaign.metricsAvailable !== false &&
          campaign.channelAccountId === current.channelAccountId &&
          campaign.campaignIdentity === current.campaignIdentity,
      )
        ? current
        : null;
    });
  }, [campaigns, campaignsQuery.isFetching, campaignsQuery.isLoading]);

  if (campaignsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>캠페인 데이터 로딩 중...</div>
      </div>
    );
  }

  if (campaignsQuery.isError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
          캠페인 데이터를 불러오지 못했습니다.
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          캠페인 0건이 아니라 조회 요청이 실패한 상태입니다.
        </p>
        <button
          type="button"
          onClick={() => void campaignsQuery.refetch()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
          style={{ background: "var(--primary)" }}
        >
          <RefreshCw size={13} />
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>캠페인 분석</h2>

      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }} aria-live="polite">
          <RefreshCw size={14} className="animate-spin" style={{ color: "var(--primary)" }} />
          캠페인 데이터를 갱신 중입니다.
        </div>
      )}

      {trendsQuery.isError && (
        <div
          className="rounded-xl border px-4 py-3 text-xs"
          style={{
            background: "var(--danger-subtle)",
            borderColor: "var(--danger)",
            color: "var(--danger)",
          }}
        >
          계정 합산 광고 지표를 불러오지 못했습니다. 캠페인 목록은 별도로 표시합니다.
        </div>
      )}

      <div className="space-y-4" aria-busy={isRefreshing}>
      {/* 캠페인 합산 KPI — 성과가 실제 수집된 캠페인만 합산한다. */}
      {performanceCampaignCount > 0 && <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            캠페인 합산 (성과 수집 {performanceCampaignCount}개)
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "총 광고비", value: `${formatKRW(campaignKpi.adSpend ?? 0)}원` },
            { label: "광고 매출", value: `${formatKRW(campaignKpi.adRevenue ?? 0)}원` },
            { label: "ROAS", value: `${campaignKpi.roas ?? 0}%`, colorClass: roasColor(campaignKpi.roas ?? 0, roasT) },
            { label: "CTR", value: `${(campaignKpi.ctr ?? 0).toFixed(2)}%` },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl px-5 py-4" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>{k.label}</div>
              <div className={cn("text-[22px] font-black tabular-nums leading-tight", k.colorClass ?? "")} style={!k.colorClass ? { color: "var(--text-primary)" } : {}}>
                {k.value}
              </div>
            </div>
          ))}
        </div>
      </div>}

      {/* 계정 합산 KPI — 쿠팡 광고센터 일별 집계 (coupang_ads_daily). 캠페인 합산과 별도 carded. */}
      {accountSummary && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              계정 합산 (쿠팡 광고센터 일별 · {accountSummary.source})
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {accountSummary.periodDayCount}일 · 최근 {accountSummary.latestBusinessDate ?? "-"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "총 광고비", value: `${formatKRW(accountSummary.metrics.spend)}원` },
              { label: "광고 매출", value: `${formatKRW(accountSummary.metrics.revenue)}원` },
              { label: "ROAS", value: `${accountSummary.metrics.roas ?? 0}%`, colorClass: roasColor(accountSummary.metrics.roas ?? 0, roasT) },
              { label: "CTR", value: `${(accountSummary.metrics.ctr ?? 0).toFixed(2)}%` },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl px-5 py-4" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>{k.label}</div>
                <div className={cn("text-[22px] font-black tabular-nums leading-tight", k.colorClass ?? "")} style={!k.colorClass ? { color: "var(--text-primary)" } : {}}>
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 캠페인 테이블 */}
      {campaigns.length > 0 ? (
        <CampaignTable
          campaigns={campaigns}
          sortBy={sortBy}
          onSortChange={setSortBy}
          selectedCampaign={selectedCampaign}
          onSelectCampaign={setSelectedCampaign}
        />
      ) : (
        <div className="flex min-h-[28vh] flex-col items-center justify-center rounded-xl px-4 py-8 text-center" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            이 기간에 수집된 캠페인 목록이 없습니다.
          </p>
          <p className="mt-1 text-xs">
            광고 동기화가 캠페인 목록 수집을 완료하면 여기에 표시됩니다.
          </p>
        </div>
      )}

      {/* 상품 드릴다운 */}
      {selectedCampaign && (
        <ProductDrilldown campaign={selectedCampaign} period={period} />
      )}
      </div>
    </div>
  );
}

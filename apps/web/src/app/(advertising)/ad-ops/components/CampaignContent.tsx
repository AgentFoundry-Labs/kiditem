"use client";

import { useState } from "react";
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

export default function CampaignContent({ initialCampaign }: { initialCampaign: CampaignSelection | null }) {
  const [period, setPeriod] = useState("7d");
  const [sortBy, setSortBy] = useState<"revenue" | "roas">("revenue");
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignSelection | null>(initialCampaign);

  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () =>
      apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>(
        "/api/ads/config",
      ),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.ads.campaigns(period),
    queryFn: () =>
      apiClient
        .get<AdCampaignSnapshot[]>(`/api/ads/campaigns?period=${period}`)
        .then(toCampaignsResponse),
    placeholderData: previousData => previousData,
  });

  // Trends carries the account-level KPI summary from coupang_ads_daily —
  // useful as a fallback KPI surface when campaign-grain rollups are sparse
  // or fully campaign-attributed (no listing identity).
  const { data: trends, isFetching: trendsFetching } = useQuery({
    queryKey: queryKeys.ads.trends(period),
    queryFn: () => apiClient.get<AdTrendsData>(`/api/ads/campaigns/trends?period=${period}`),
    placeholderData: previousData => previousData,
  });
  const isRefreshing = (isFetching || trendsFetching) && !isLoading;

  const campaigns = data?.campaigns ?? [];
  const campaignKpi = data?.totalKpi ?? {};
  const accountSummary = trends?.accountSummary ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>캠페인 데이터 로딩 중...</div>
      </div>
    );
  }

  // No campaign rollup AND no account summary → truly nothing to show.
  if (campaigns.length === 0 && !accountSummary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]" style={{ color: "var(--text-tertiary)" }}>
        <p className="text-sm mb-2">캠페인 스냅샷 데이터가 없습니다.</p>
        <p className="text-xs">데이터 수집 후 다시 확인해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 기간 토글 */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>캠페인 분석</h2>
        <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "var(--surface-sunken)" }}>
          {([["7d", "7일"], ["month", "월간"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className="px-4 py-1.5 text-sm font-semibold rounded-md transition-all"
              style={period === key ? { background: "var(--primary)", color: "#fff", boxShadow: "var(--shadow-sm)" } : { color: "var(--text-tertiary)" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ background: "var(--surface-raised)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }} aria-live="polite">
          <RefreshCw size={14} className="animate-spin" style={{ color: "var(--primary)" }} />
          캠페인 데이터를 갱신 중입니다.
        </div>
      )}

      <div className="space-y-4" aria-busy={isRefreshing}>
      {/* 캠페인 합산 KPI — 캠페인 단위 rollup. 0 이면 0 그대로 보여줌. */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            캠페인 합산 (ChannelAdTargetDailySnapshot)
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
      </div>

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
        <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}>
          기간 내 캠페인 단위 광고 row 가 없습니다.
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

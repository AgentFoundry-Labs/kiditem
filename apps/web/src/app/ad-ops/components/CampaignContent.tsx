"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { cn, formatKRW } from "@/lib/utils";
import { roasColor } from "../lib/status-colors";
import { CampaignTable } from "./CampaignTable";
import { ProductDrilldown } from "./ProductDrilldown";
import type { CampaignsResponse } from "../hooks/useAdOpsData";

export default function CampaignContent({ initialCampaign }: { initialCampaign: string | null }) {
  const [period, setPeriod] = useState("7d");
  const [sortBy, setSortBy] = useState<"revenue" | "roas">("revenue");
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(initialCampaign);

  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () =>
      apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>(
        "/api/ads/config",
      ),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ads.campaigns(period),
    queryFn: () => apiClient.get<CampaignsResponse>(`/api/ads/campaigns?period=${period}`),
  });

  const campaigns = data?.campaigns ?? [];
  const kpi = data?.totalKpi ?? {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>캠페인 데이터 로딩 중...</div>
      </div>
    );
  }

  if (campaigns.length === 0) {
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
          {([["7d", "7일"], ["30d", "월간"]] as const).map(([key, label]) => (
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

      {/* KPI 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "총 광고비", value: `${formatKRW(kpi.adSpend ?? 0)}원` },
          { label: "광고 매출", value: `${formatKRW(kpi.adRevenue ?? 0)}원` },
          { label: "ROAS", value: `${kpi.roas ?? 0}%`, colorClass: roasColor(kpi.roas ?? 0, roasT) },
          { label: "CTR", value: `${(kpi.ctr ?? 0).toFixed(1)}%` },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl px-5 py-4" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>{k.label}</div>
            <div className={cn("text-[22px] font-black tabular-nums leading-tight", k.colorClass ?? "")} style={!k.colorClass ? { color: "var(--text-primary)" } : {}}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* 캠페인 테이블 */}
      <CampaignTable
        campaigns={campaigns}
        sortBy={sortBy}
        onSortChange={setSortBy}
        selectedCampaign={selectedCampaign}
        onSelectCampaign={setSelectedCampaign}
      />

      {/* 상품 드릴다운 */}
      {selectedCampaign && (
        <ProductDrilldown campaignName={selectedCampaign} period={period} />
      )}
    </div>
  );
}

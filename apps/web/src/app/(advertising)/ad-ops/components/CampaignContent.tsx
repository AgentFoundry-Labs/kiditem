"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  AdCampaignManualReportsSchema,
  type AdCampaignSnapshot,
  type AdTrendsData,
} from "@kiditem/shared/advertising";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { cn, formatKRW, formatNumber } from "@/lib/utils";
import { exactManualReportRange } from "../lib/ad-campaign-collection";
import { roasColor } from "../lib/status-colors";
import { adTrendsSourceLabel } from "../lib/trends-source";
import { toCampaignsResponse } from "../hooks/useAdOpsData";
import ManualCampaignReportControl from "./ManualCampaignReportControl";
import ManualCampaignReportPanel from "./ManualCampaignReportPanel";
import { ProductDrilldown } from "./ProductDrilldown";
import { CampaignTable } from "./CampaignTable";
import type { CampaignSelection } from "./CampaignTable";

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
  // Trends carries the campaign sweep's account totals over the measured days
  // of the page period, beside the per-campaign rollups.
  const trendsQuery = useQuery({
    queryKey: queryKeys.ads.trends(period),
    queryFn: () => apiClient.get<AdTrendsData>(`/api/ads/campaigns/trends?period=${period}`),
  });
  const manualRange = exactManualReportRange(period, trendsQuery.data?.knownThrough);
  const manualReportsQuery = useQuery({
    queryKey: queryKeys.ads.manualReports(
      manualRange?.startDate ?? "disabled",
      manualRange?.endDate ?? "disabled",
    ),
    enabled: manualRange !== null,
    retry: false,
    queryFn: async () => {
      if (!manualRange) return null;
      return AdCampaignManualReportsSchema.parse(
        await apiClient.get(
          `/api/ads/ad-campaigns/reports?startDate=${manualRange.startDate}&endDate=${manualRange.endDate}`,
        ),
      );
    },
  });
  const isRefreshing =
    (campaignsQuery.isFetching || trendsQuery.isFetching) &&
    !campaignsQuery.isLoading;

  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const manualReports = manualReportsQuery.data?.reports ?? [];
  const campaignKpi = campaignsQuery.data?.totalKpi ?? null;
  const sweepSummary = trendsQuery.data?.summary ?? null;
  const accountMetrics = sweepSummary?.metrics ?? null;
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

      {manualReportsQuery.isError && (
        <div
          className="rounded-xl border px-4 py-3 text-xs"
          style={{
            background: "var(--danger-subtle)",
            borderColor: "var(--danger)",
            color: "var(--danger)",
          }}
          data-testid="manual-report-error"
          role="alert"
        >
          표시 범위 원본 보고서를 불러오지 못했습니다. 캠페인 일별 rollup은 별도로 표시합니다.
        </div>
      )}

      <ManualCampaignReportControl period={period} knownThrough={trendsQuery.data?.knownThrough} />
      <ManualCampaignReportPanel reports={manualReports} />

      <div className="space-y-4" aria-busy={isRefreshing}>
      {/* 캠페인 합산 KPI — 성과가 실제 수집된 캠페인만 합산한다. 비율은 합산한 원값으로 다시 계산하고 분모가 0이면 비운다. */}
      {campaignKpi && (
        <div data-testid="campaign-totals">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              캠페인 합산 (성과 수집 {performanceCampaignCount}개)
            </span>
          </div>
          <TotalsGrid
            items={[
              { label: "총 광고비", value: `${formatKRW(campaignKpi.adSpend)}원` },
              { label: "광고 매출", value: `${formatKRW(campaignKpi.adRevenue)}원` },
              roasItem(campaignKpi.roas, roasT),
              { label: "CTR", value: percentText(campaignKpi.ctr) },
            ]}
          />
        </div>
      )}

      {/* 계정 합산 KPI — 광고 동기화 캠페인 순회가 측정한 날만 합산한 계정 값. */}
      {sweepSummary && accountMetrics && (
        <div data-testid="account-totals">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              계정 합산 (광고 동기화 캠페인 순회)
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {`측정 ${formatNumber(sweepSummary.periodDayCount)}일 · ${adTrendsSourceLabel(sweepSummary)}`}
            </span>
          </div>
          <TotalsGrid
            items={[
              { label: "총 광고비", value: `${formatKRW(accountMetrics.spend)}원` },
              { label: "광고 매출", value: `${formatKRW(accountMetrics.revenue)}원` },
              roasItem(accountMetrics.roas, roasT),
              { label: "CTR", value: percentText(accountMetrics.ctr) },
            ]}
          />
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

type TotalsItem = { label: string; value: string; colorClass?: string };
type RoasThresholds = { excellent: number; warning: number; poor: number };

function percentText(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}%`;
}

/** A ROAS color only describes a measured ROAS. */
function roasItem(roas: number | null, thresholds: RoasThresholds): TotalsItem {
  return roas === null
    ? { label: "ROAS", value: "-" }
    : { label: "ROAS", value: `${roas}%`, colorClass: roasColor(roas, thresholds) };
}

function TotalsGrid({ items }: { items: TotalsItem[] }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((k) => (
        <div key={k.label} className="rounded-2xl px-5 py-4" style={{ background: "var(--card-bg)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-subtle)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>{k.label}</div>
          <div className={cn("text-[22px] font-black tabular-nums leading-tight", k.colorClass ?? "")} style={!k.colorClass ? { color: "var(--text-primary)" } : {}}>
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}

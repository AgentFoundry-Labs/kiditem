import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdCampaignSnapshot } from "@kiditem/shared/advertising";
import { CampaignSummary } from "./StatusContent";

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: mockApiGet },
}));

function wrapper(children: React.ReactNode) {
  return (
    <QueryClientProvider
      client={new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })}
    >
      {children}
    </QueryClientProvider>
  );
}

function campaign(overrides: Partial<AdCampaignSnapshot>): AdCampaignSnapshot {
  return {
    listing: null,
    channelAccountId: "11111111-1111-4111-8111-111111111111",
    campaignIdentity: "campaign:off",
    campaignId: "off",
    campaignName: "중단 캠페인",
    period: "14d",
    metricsAvailable: false,
    conversionsAvailable: false,
    status: "OFF",
    onOff: "OFF",
    metrics: {
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      roas: null,
      ctr: null,
      cvr: null,
    },
    ...overrides,
  };
}

describe("CampaignSummary", () => {
  it("does not surface metadata-only campaigns as zero-performance summary rows", () => {
    mockApiGet.mockResolvedValue({
      roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } },
    });
    const onSelect = vi.fn();

    render(
      wrapper(
        <CampaignSummary
          campaigns={[campaign({})]}
          onSelect={onSelect}
        />,
      ),
    );

    expect(screen.queryByText("캠페인 현황")).not.toBeInTheDocument();
    expect(screen.queryByText("중단 캠페인")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps only metric campaigns in the top summary", () => {
    mockApiGet.mockResolvedValue({
      roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } },
    });
    const metadataOnly = Array.from({ length: 5 }, (_, index) =>
      campaign({
        campaignIdentity: `campaign:off-${index}`,
        campaignName: `중단 캠페인 ${index + 1}`,
      }),
    );
    const active = campaign({
      campaignIdentity: "campaign:on",
      campaignName: "운영 캠페인",
      metricsAvailable: true,
      conversionsAvailable: true,
      status: "ON",
      onOff: "ON",
      metrics: {
        spend: 100,
        revenue: 500,
        impressions: 1000,
        clicks: 10,
        conversions: 2,
        roas: 500,
        ctr: 1,
        cvr: 20,
      },
    });

    render(
      wrapper(
        <CampaignSummary
          campaigns={[...metadataOnly, active]}
          onSelect={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole("button", { name: /운영 캠페인ON/ })).toBeEnabled();
    expect(screen.queryByText(/중단 캠페인/)).not.toBeInTheDocument();
  });
});

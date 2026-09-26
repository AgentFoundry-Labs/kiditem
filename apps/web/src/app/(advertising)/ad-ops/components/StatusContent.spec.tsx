import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StatusContent, { CampaignSummary, wingKpiCount } from "./StatusContent";
import type { AdCampaignSnapshot } from "@kiditem/shared/advertising";

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: mockApiGet },
}));
// The status tab's chart, side panel and profitability card read their own
// sources; the itemwinner card is the surface under test.
vi.mock("./AdCollectionDailyChart", () => ({ default: () => null }));
vi.mock("./AdSidePanel", () => ({ default: () => null }));
vi.mock("./AdvertisingProfitabilityRefresh", () => ({ default: () => null }));

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

describe("wingKpiCount", () => {
  it("reads a parsed Wing KPI count and leaves an unparseable cell unknown", () => {
    expect(wingKpiCount("12")).toBe(12);
    expect(wingKpiCount("1,234개")).toBe(1234);
    expect(wingKpiCount("0")).toBe(0);
    expect(wingKpiCount("-")).toBeNull();
    expect(wingKpiCount("")).toBeNull();
    expect(wingKpiCount({ value: "3건", numValue: 3 })).toBe(3);
    expect(wingKpiCount({ value: "5건" })).toBe(5);
    expect(wingKpiCount({ value: "-" })).toBeNull();
  });
});

describe("StatusContent", () => {
  it("keeps the itemwinner collection on the status tab before any KPI is collected", async () => {
    mockApiGet.mockImplementation(async (path: string) =>
      path === "/api/operations?kinds=advertising.wing_itemwinner&limit=5"
        ? { operations: [] }
        : { roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } } },
    );

    render(
      wrapper(
        <StatusContent
          rules={[]}
          strategy={null}
          trends={null}
          wingKpis={{}}
          campaigns={[]}
          onGoToCampaign={vi.fn()}
          period="14d"
          onPeriodChange={vi.fn()}
          extensionStatus={null}
        />,
      ),
    );

    expect(screen.getByRole("heading", { name: "아이템위너 · 노출 현재 상태" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "아이템위너 수집" })).toBeEnabled();
    expect(screen.getByText("아직 수집한 아이템위너 현황이 없습니다.")).toBeInTheDocument();
  });
});

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

    const activeButton = screen.getByRole("button", { name: /운영 캠페인ON/ });
    expect(activeButton).toBeEnabled();
    expect(within(activeButton).getByText("ROAS 500%")).toHaveClass("text-emerald-600");
    expect(screen.queryByText(/중단 캠페인/)).not.toBeInTheDocument();
  });

  it("keeps unknown summary ROAS neutral while preserving an observed zero", () => {
    mockApiGet.mockResolvedValue({
      roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } },
    });
    const unknown = campaign({
      campaignIdentity: "campaign:unknown-roas",
      campaignName: "ROAS 미수집",
      metricsAvailable: true,
      conversionsAvailable: true,
      status: "ON",
      onOff: "ON",
    });
    const zero = campaign({
      campaignIdentity: "campaign:zero-roas",
      campaignName: "ROAS 0",
      metricsAvailable: true,
      conversionsAvailable: true,
      status: "ON",
      onOff: "ON",
      metrics: {
        spend: 0,
        revenue: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        roas: 0,
        ctr: 0,
        cvr: 0,
      },
    });

    render(
      wrapper(
        <CampaignSummary
          campaigns={[unknown, zero]}
          onSelect={vi.fn()}
        />,
      ),
    );

    const unknownButton = screen.getByRole("button", { name: /ROAS 미수집/ });
    const unknownRoas = within(unknownButton).getByText("ROAS -");
    expect(unknownRoas.className).not.toMatch(/text-(emerald|green|orange|red)-\d+/);

    const zeroButton = screen.getByRole("button", { name: /ROAS 0/ });
    expect(within(zeroButton).getByText("ROAS 0%")).toHaveClass("text-red-600");
  });
});

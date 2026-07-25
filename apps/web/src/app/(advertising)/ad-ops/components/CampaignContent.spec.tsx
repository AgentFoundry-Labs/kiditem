import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignContent from "./CampaignContent";

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: mockApiGet },
}));

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function successfulResponse(url: string) {
  if (url === "/api/ads/config") {
    return Promise.resolve({
      roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } },
    });
  }
  if (url.startsWith("/api/ads/campaigns/trends")) {
    return Promise.resolve({ accountSummary: null });
  }
  if (url.startsWith("/api/ads/campaigns")) {
    return Promise.resolve([]);
  }
  return Promise.reject(new Error(`unexpected request: ${url}`));
}

describe("CampaignContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation(successfulResponse);
  });

  it("uses the page-wide period for both campaign and trend queries", async () => {
    render(<CampaignContent initialCampaign={null} period="14d" />, {
      wrapper: wrapper(),
    });

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        "/api/ads/campaigns?period=14d",
      );
      expect(mockApiGet).toHaveBeenCalledWith(
        "/api/ads/campaigns/trends?period=14d",
      );
    });
    expect(
      await screen.findByText("이 기간에 수집된 캠페인 목록이 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "7일" })).not.toBeInTheDocument();
  });

  it.each(["7d", "14d", "month"] as const)(
    "queries campaign and account totals for the selected %s period",
    async (period) => {
      render(<CampaignContent initialCampaign={null} period={period} />, {
        wrapper: wrapper(),
      });

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          `/api/ads/campaigns?period=${period}`,
        );
        expect(mockApiGet).toHaveBeenCalledWith(
          `/api/ads/campaigns/trends?period=${period}`,
        );
      });
    },
  );

  it("does not keep the previous period campaign totals visible while the next period loads", async () => {
    let resolveSevenDayCampaigns:
      | ((campaigns: Record<string, unknown>[]) => void)
      | undefined;
    const sevenDayCampaigns = new Promise<Record<string, unknown>[]>((resolve) => {
      resolveSevenDayCampaigns = resolve;
    });
    const snapshot = (name: string, spend: number) => ({
      listing: null,
      channelAccountId: "11111111-1111-4111-8111-111111111111",
      campaignIdentity: `campaign:${name}`,
      campaignId: name,
      campaignName: name,
      period: "14d",
      metricsAvailable: true,
      conversionsAvailable: true,
      status: "ON",
      onOff: "ON",
      metrics: {
        spend,
        revenue: spend * 5,
        impressions: 1000,
        clicks: 10,
        conversions: 2,
        roas: 500,
        ctr: 1,
        cvr: 20,
      },
    });
    mockApiGet.mockImplementation((url: string) => {
      if (url === "/api/ads/config") {
        return Promise.resolve({
          roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } },
        });
      }
      if (url.startsWith("/api/ads/campaigns/trends")) {
        return Promise.resolve({ accountSummary: null });
      }
      if (url === "/api/ads/campaigns?period=14d") {
        return Promise.resolve([snapshot("14일 캠페인", 1400)]);
      }
      if (url === "/api/ads/campaigns?period=7d") {
        return sevenDayCampaigns;
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const view = render(
      <CampaignContent initialCampaign={null} period="14d" />,
      { wrapper: wrapper() },
    );

    expect(await screen.findByText("14일 캠페인")).toBeInTheDocument();

    view.rerender(
      <CampaignContent initialCampaign={null} period="7d" />,
    );

    expect(
      await screen.findByText("캠페인 데이터 로딩 중..."),
    ).toBeInTheDocument();
    expect(screen.queryByText("14일 캠페인")).not.toBeInTheDocument();

    resolveSevenDayCampaigns?.([snapshot("7일 캠페인", 700)]);

    expect(await screen.findByText("7일 캠페인")).toBeInTheDocument();
    expect(screen.queryByText("14일 캠페인")).not.toBeInTheDocument();
  });

  it("distinguishes a failed campaign request from a real empty result", async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith("/api/ads/campaigns?")) {
        return Promise.reject(new Error("campaign request failed"));
      }
      return successfulResponse(url);
    });

    render(<CampaignContent initialCampaign={null} period="7d" />, {
      wrapper: wrapper(),
    });

    expect(
      await screen.findByText("캠페인 데이터를 불러오지 못했습니다."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("이 기간에 수집된 캠페인 목록이 없습니다."),
    ).not.toBeInTheDocument();
  });

  it("clears a campaign detail selection when the page-wide period changes", async () => {
    const selectedCampaign = {
      channelAccountId: "account-1",
      campaignIdentity: "campaign-1",
      campaignName: "기존 캠페인",
    };
    const campaignSnapshot = {
      ...selectedCampaign,
      listing: null,
      period: "14d",
      campaignId: "campaign-1",
      metricsAvailable: true,
      conversionsAvailable: false,
      status: "ON",
      onOff: "ON",
      metrics: {
        spend: 100,
        revenue: 500,
        impressions: 1000,
        clicks: 10,
        conversions: 0,
        roas: 500,
        ctr: 1,
        cvr: 0,
      },
    };
    mockApiGet.mockImplementation((url: string) => {
      if (url === "/api/ads/config") {
        return Promise.resolve({
          roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } },
        });
      }
      if (url.startsWith("/api/ads/campaigns/trends")) {
        return Promise.resolve({ accountSummary: null });
      }
      if (url === "/api/ads/campaigns?period=14d") {
        return Promise.resolve([campaignSnapshot]);
      }
      if (url === "/api/ads/campaigns?period=7d") {
        return Promise.resolve([]);
      }
      if (url.startsWith("/api/ads/products?")) {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const view = render(
      <CampaignContent initialCampaign={selectedCampaign} period="14d" />,
      { wrapper: wrapper() },
    );

    expect(
      await screen.findByText("기존 캠페인 · 상품별 성과"),
    ).toBeInTheDocument();

    view.rerender(
      <CampaignContent initialCampaign={selectedCampaign} period="7d" />,
    );

    await waitFor(() => {
      expect(
        screen.queryByText("기존 캠페인 · 상품별 성과"),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps metadata-only campaigns in the list without showing a zero KPI aggregate", async () => {
    const metadataOnlyCampaign = {
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
    };
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith("/api/ads/campaigns?")) {
        return Promise.resolve([metadataOnlyCampaign]);
      }
      return successfulResponse(url);
    });

    render(<CampaignContent initialCampaign={null} period="14d" />, {
      wrapper: wrapper(),
    });

    expect(await screen.findByText("중단 캠페인")).toBeInTheDocument();
    expect(screen.getByText("OFF")).toBeInTheDocument();
    expect(screen.getByText("성과 미수집")).toBeInTheDocument();
    expect(screen.queryByText(/캠페인 합산 \(성과 수집/)).not.toBeInTheDocument();
  });
});

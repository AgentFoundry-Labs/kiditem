import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const unavailableTrends = {
  knownThrough: "2026-07-23",
  from: "2026-07-10",
  to: "2026-07-23",
  daily: [],
  summary: {
    periodDayCount: 0,
    latestBusinessDate: null,
    observedAt: null,
    metrics: null,
    orders: null,
  },
};

function successfulResponse(url: string) {
  if (url === "/api/ads/config") {
    return Promise.resolve({
      roas: { thresholds: { excellent: 300, warning: 200, poor: 100 } },
    });
  }
  if (url.startsWith("/api/ads/campaigns/trends")) {
    return Promise.resolve(unavailableTrends);
  }
  if (url.startsWith("/api/ads/ad-campaigns/reports?")) {
    return Promise.resolve({
      channelAccountId: "11111111-1111-4111-8111-111111111111",
      reports: [],
    });
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

  it("renders every exact-range manual report with captured rows without replacing campaign facts", async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith("/api/ads/ad-campaigns/reports?")) {
        return Promise.resolve({
          channelAccountId: "11111111-1111-4111-8111-111111111111",
          reports: [
            {
              attemptId: "22222222-2222-4222-8222-222222222222",
              generation: "3",
              plan: {
                sourceType: "coupang_ad_campaign",
                parserVersion: "ad-campaign-v1",
                captureMode: "manual_report",
                period: "7d",
                channelAccountId: "11111111-1111-4111-8111-111111111111",
                expectedAdvertiserId: "advertiser-1",
                startDate: "2026-08-30",
                endDate: "2026-09-05",
                targetUrl: "https://advertising.coupang.com/campaigns",
                businessDates: ["2026-09-05"],
              },
              payload: {
                data: [{ campaign: "displayed-range-a" }],
                normalizedRows: [{
                  campaignName: "캠페인 A",
                  productName: "상품 A",
                  spend: 1234,
                  revenue: 5678,
                  impressions: 100,
                  clicks: 12,
                  conversions: 3,
                  roas: 460.3,
                  ctr: 12,
                  conversionRate: 25,
                }],
                campaignName: "manual-report-a",
                timestamp: "2026-09-06T00:00:00.000Z",
              },
            },
            {
              attemptId: "33333333-3333-4333-8333-333333333333",
              generation: "4",
              plan: {
                sourceType: "coupang_ad_campaign",
                parserVersion: "ad-campaign-v1",
                captureMode: "manual_report",
                period: "7d",
                channelAccountId: "33333333-3333-4333-8333-333333333333",
                expectedAdvertiserId: "advertiser-2",
                startDate: "2026-08-29",
                endDate: "2026-09-04",
                targetUrl: "https://advertising.coupang.com/campaigns?scope=second",
                businessDates: ["2026-09-04"],
              },
              payload: {
                data: [{ campaign: "displayed-range-b" }],
                normalizedRows: [{
                  campaignName: "캠페인 B",
                  productName: "상품 B",
                  spend: 2000,
                  revenue: 9000,
                  impressions: 200,
                  clicks: 20,
                  conversions: 5,
                  roas: 450,
                  ctr: 10,
                  conversionRate: 25,
                }],
                campaignName: "manual-report-b",
                timestamp: "2026-09-05T00:00:00.000Z",
              },
            },
          ],
        });
      }
      return successfulResponse(url);
    });

    render(<CampaignContent initialCampaign={null} period="7d" />, {
      wrapper: wrapper(),
    });

    const manualPanel = await screen.findByTestId("manual-report-panel");
    expect(manualPanel).toHaveTextContent("캠페인 A");
    expect(manualPanel).toHaveTextContent("상품 A");
    expect(manualPanel).toHaveTextContent("1,234원");
    expect(manualPanel).toHaveTextContent("5,678원");
    expect(manualPanel).toHaveTextContent("460.3%");
    expect(manualPanel).toHaveTextContent("12.0%");
    expect(manualPanel).toHaveTextContent("25.0%");
    expect(manualPanel).toHaveTextContent("캠페인 B");
    expect(manualPanel).toHaveTextContent("상품 B");
    expect(manualPanel).toHaveTextContent("2,000원");
    expect(manualPanel).toHaveTextContent("9,000원");
    expect(manualPanel).toHaveTextContent("450.0%");
    expect(screen.getByTestId("manual-report-22222222-2222-4222-8222-222222222222")).toBeInTheDocument();
    expect(screen.getByTestId("manual-report-33333333-3333-4333-8333-333333333333")).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/ads\/ad-campaigns\/reports\?startDate=\d{4}-\d{2}-\d{2}&endDate=\d{4}-\d{2}-\d{2}$/),
    );
  });

  it("keeps raw report column labels and units unchanged when normalized rows are absent", async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith("/api/ads/ad-campaigns/reports?")) {
        return Promise.resolve({
          channelAccountId: "11111111-1111-4111-8111-111111111111",
          reports: [{
            attemptId: "55555555-5555-4555-8555-555555555555",
            generation: "6",
            plan: {
              sourceType: "coupang_ad_campaign",
              parserVersion: "ad-campaign-v1",
              captureMode: "manual_report",
              period: "7d",
              channelAccountId: "11111111-1111-4111-8111-111111111111",
              expectedAdvertiserId: "advertiser-1",
              startDate: "2026-08-30",
              endDate: "2026-09-05",
              targetUrl: "https://advertising.coupang.com/campaigns",
              businessDates: ["2026-09-05"],
            },
            payload: {
              data: [{ "광고상품": "원본 상품", "전환매출": "1.2만", "클릭률": "4.5%" }],
              normalizedRows: [],
              campaignName: "raw-report",
              timestamp: "2026-09-06T00:00:00.000Z",
            },
          }],
        });
      }
      return successfulResponse(url);
    });

    render(<CampaignContent initialCampaign={null} period="7d" />, {
      wrapper: wrapper(),
    });

    const rawTable = await screen.findByTestId("manual-report-raw-table-55555555-5555-4555-8555-555555555555");
    expect(rawTable).toHaveTextContent("전환매출");
    expect(rawTable).toHaveTextContent("1.2만");
    expect(rawTable).toHaveTextContent("클릭률");
    expect(rawTable).toHaveTextContent("4.5%");
    expect(rawTable).not.toHaveTextContent("12,000원");
  });

  it("renders an explicit empty manual report as confirmed empty evidence", async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith("/api/ads/ad-campaigns/reports?")) {
        return Promise.resolve({
          channelAccountId: "11111111-1111-4111-8111-111111111111",
          reports: [{
            attemptId: "44444444-4444-4444-8444-444444444444",
            generation: "5",
            plan: {
              sourceType: "coupang_ad_campaign",
              parserVersion: "ad-campaign-v1",
              captureMode: "manual_report",
              period: "7d",
              channelAccountId: "11111111-1111-4111-8111-111111111111",
              expectedAdvertiserId: "advertiser-1",
              startDate: "2026-08-30",
              endDate: "2026-09-05",
              targetUrl: "https://advertising.coupang.com/campaigns",
              businessDates: ["2026-09-05"],
            },
            payload: {
              data: [],
              normalizedRows: [],
              campaignName: "_전체",
              timestamp: "2026-09-06T00:00:00.000Z",
            },
          }],
        });
      }
      return successfulResponse(url);
    });

    render(<CampaignContent initialCampaign={null} period="7d" />, {
      wrapper: wrapper(),
    });

    expect(
      await screen.findByTestId("manual-report-empty-44444444-4444-4444-8444-444444444444"),
    ).toHaveTextContent("명시적 빈 결과로 보관했습니다");
  });

  it("surfaces a manual report read error without hiding the sweep consumer", async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith("/api/ads/ad-campaigns/reports?")) {
        return Promise.reject(new Error("manual report read failed"));
      }
      return successfulResponse(url);
    });

    render(<CampaignContent initialCampaign={null} period="7d" />, {
      wrapper: wrapper(),
    });

    expect(await screen.findByTestId("manual-report-error")).toHaveTextContent(
      "표시 범위 원본 보고서를 불러오지 못했습니다",
    );
    expect(await screen.findByText("이 기간에 수집된 캠페인 목록이 없습니다.")).toBeInTheDocument();
  });

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
        return Promise.resolve(unavailableTrends);
      }
      if (url.startsWith("/api/ads/ad-campaigns/reports?")) {
        return Promise.resolve({
          channelAccountId: "11111111-1111-4111-8111-111111111111",
          reports: [],
        });
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
        return Promise.resolve(unavailableTrends);
      }
      if (url === "/api/ads/campaigns?period=14d") {
        return Promise.resolve([campaignSnapshot]);
      }
      if (url === "/api/ads/campaigns?period=7d") {
        return Promise.resolve([]);
      }
      if (url.startsWith("/api/ads/ad-campaigns/reports?")) {
        return Promise.resolve({
          channelAccountId: "11111111-1111-4111-8111-111111111111",
          reports: [],
        });
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

  it("shows campaign-sweep account totals from the trends summary with unmeasured ratios as -", async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith("/api/ads/campaigns/trends")) {
        return Promise.resolve({
          ...unavailableTrends,
          summary: {
            periodDayCount: 7,
            latestBusinessDate: "2026-07-23",
            observedAt: "2026-07-24T00:00:00.000Z",
            metrics: {
              spend: 2000,
              revenue: 0,
              impressions: 0,
              clicks: 0,
              conversions: null,
              roas: null,
              ctr: null,
              cvr: null,
            },
            orders: null,
          },
        });
      }
      return successfulResponse(url);
    });

    render(<CampaignContent initialCampaign={null} period="14d" />, {
      wrapper: wrapper(),
    });

    const card = await screen.findByTestId("account-totals");
    expect(card).toHaveTextContent("측정 7일 · 쿠팡 광고 캠페인 합산 · 2026-07-23까지");
    expect(within(card).getByText("2,000원")).toBeInTheDocument();
    expect(within(card).getByText("0원")).toBeInTheDocument();
    expect(within(card).getAllByText("-")).toHaveLength(2);
    expect(card.querySelector("[class*='text-red']")).toBeNull();
  });

  it("keeps unmeasured campaign total ratios unknown instead of a red 0% ROAS", async () => {
    const idleCampaign = {
      listing: null,
      channelAccountId: "11111111-1111-4111-8111-111111111111",
      campaignIdentity: "campaign:idle",
      campaignId: "idle",
      campaignName: "무노출 캠페인",
      period: "14d",
      metricsAvailable: true,
      conversionsAvailable: false,
      status: "ON",
      onOff: "ON",
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
    mockApiGet.mockImplementation((url: string) =>
      url.startsWith("/api/ads/campaigns?")
        ? Promise.resolve([idleCampaign])
        : successfulResponse(url),
    );

    render(<CampaignContent initialCampaign={null} period="14d" />, {
      wrapper: wrapper(),
    });

    const totals = await screen.findByTestId("campaign-totals");
    expect(totals).toHaveTextContent("캠페인 합산 (성과 수집 1개)");
    expect(within(totals).getAllByText("0원")).toHaveLength(2);
    expect(within(totals).getAllByText("-")).toHaveLength(2);
    expect(totals.querySelector("[class*='text-red']")).toBeNull();
  });
});

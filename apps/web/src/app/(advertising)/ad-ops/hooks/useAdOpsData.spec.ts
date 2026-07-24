import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdCampaignSnapshot } from "@kiditem/shared/advertising";
import { toCampaignsResponse, useAdProducts } from "./useAdOpsData";

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: mockApiGet,
    post: vi.fn(),
  },
}));

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function campaign(overrides: Partial<AdCampaignSnapshot>): AdCampaignSnapshot {
  return {
    listing: null,
    channelAccountId: "11111111-1111-4111-8111-111111111111",
    campaignIdentity: "campaign:on",
    campaignId: "on",
    campaignName: "운영 캠페인",
    period: "14d",
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
    ...overrides,
  };
}

describe("toCampaignsResponse", () => {
  it("excludes metadata-only campaigns from aggregate KPIs", () => {
    const response = toCampaignsResponse([
      campaign({}),
      campaign({
        campaignIdentity: "campaign:off",
        campaignId: "off",
        campaignName: "중단 캠페인",
        metricsAvailable: false,
        conversionsAvailable: false,
        status: "OFF",
        onOff: "OFF",
        // A non-zero sentinel makes the regression explicit even though the
        // server currently normalizes metadata-only metrics to zero.
        metrics: {
          spend: 900,
          revenue: 1800,
          impressions: 9000,
          clicks: 90,
          conversions: 9,
          roas: 200,
          ctr: 1,
          cvr: 10,
        },
      }),
    ]);

    expect(response.totalKpi).toEqual({
      adSpend: 100,
      adRevenue: 500,
      impressions: 1000,
      clicks: 10,
      conversions: 2,
      roas: 500,
      ctr: 1,
      cvr: 20,
    });
  });
});

describe("useAdProducts period queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["7d", "14d", "month"] as const)(
    "queries product rollups for the selected %s period",
    async (period) => {
      mockApiGet.mockResolvedValue([]);

      const { result } = renderHook(() => useAdProducts(period, true), {
        wrapper: wrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(mockApiGet).toHaveBeenCalledWith(
        `/api/ads/products?period=${period}`,
      );
    },
  );

  it("clears the previous period products while the next period is loading", async () => {
    let resolveSevenDayProducts:
      | ((products: Record<string, unknown>[]) => void)
      | undefined;
    const sevenDayProducts = new Promise<Record<string, unknown>[]>((resolve) => {
      resolveSevenDayProducts = resolve;
    });
    const product = (name: string, spend: number) => ({
      externalOptionId: name,
      externalId: name,
      listing: null,
      productName: name,
      keyword: null,
      onOff: "ON",
      imageUrl: null,
      campaignName: "캠페인",
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
      if (url === "/api/ads/products?period=14d") {
        return Promise.resolve([product("14일 상품", 1400)]);
      }
      if (url === "/api/ads/products?period=7d") {
        return sevenDayProducts;
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });

    const { result, rerender } = renderHook(
      ({ period }) => useAdProducts(period, true),
      {
        initialProps: { period: "14d" },
        wrapper: wrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.products[0]?.productName).toBe("14일 상품");
    });

    rerender({ period: "7d" });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
      expect(result.current.products).toEqual([]);
    });

    resolveSevenDayProducts?.([product("7일 상품", 700)]);

    await waitFor(() => {
      expect(result.current.products[0]?.productName).toBe("7일 상품");
    });
    expect(result.current.products).toHaveLength(1);
  });
});

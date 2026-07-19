import { describe, expect, it, vi } from "vitest";
import { removeAmbiguousAdCampaignAccountKpis } from "../data-migrations/v0.1.25/005_remove_ambiguous_ad_campaign_account_kpis";

function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-daily-1",
    organizationId: "org-1",
    rawSnapshotId: "snapshot-1",
    status: null,
    exposureStatus: null,
    saleStatus: null,
    channelPrice: null,
    reviewCount: null,
    avgRating: null,
    isOfferWinner: null,
    myPrice: null,
    winnerPrice: null,
    winnerGapPrice: null,
    productRank: null,
    categoryRank: null,
    adSpend: 40_215,
    adRevenue: 216_470,
    adImpressions: 100,
    adClicks: 10,
    adConversions: 216_470,
    adOrders: 3,
    adDirectOrders1d: 0,
    adIndirectOrders1d: 0,
    adDirectQty1d: 0,
    adIndirectQty1d: 0,
    adDirectRevenue1d: 0,
    adIndirectRevenue1d: 0,
    adTotalOrders14d: 0,
    adDirectOrders14d: 0,
    adIndirectOrders14d: 0,
    adTotalQty14d: 0,
    adDirectQty14d: 0,
    adIndirectQty14d: 0,
    adTotalRevenue14d: 0,
    adDirectRevenue14d: 0,
    adIndirectRevenue14d: 0,
    trafficVisitors: 0,
    trafficViews: 0,
    trafficCartAdds: 0,
    trafficOrders: 0,
    trafficSalesQty: 0,
    trafficRevenue: 0,
    metaJson: {
      "advertising.campaign": { campaignName: "캠페인" },
    },
    ...overrides,
  };
}

function rawSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "snapshot-1",
    organizationId: "org-1",
    channel: "coupang",
    source: "advertising",
    pageType: "product",
    scrapeRun: {
      organizationId: "org-1",
      channel: "coupang",
      source: "advertising",
      pageType: "campaign",
    },
    ...overrides,
  };
}

function txFor(rows: ReturnType<typeof listingRow>[] = []) {
  return {
    channelListingDailySnapshot: {
      findMany: vi.fn().mockResolvedValue(rows),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    channelScrapeSnapshot: {
      findMany: vi.fn().mockResolvedValue([rawSnapshot()]),
    },
    channelAccountDailyKpiSnapshot: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe("ad campaign account KPI cleanup migration", () => {
  it("has the durable v0.1.25 migration identity", () => {
    expect(removeAmbiguousAdCampaignAccountKpis).toMatchObject({
      id: "v0.1.25:005_remove_ambiguous_ad_campaign_account_kpis",
      releaseVersion: "0.1.25",
    });
  });

  it("deletes the lossy per-campaign account projection", async () => {
    const tx = txFor();
    tx.channelAccountDailyKpiSnapshot.deleteMany.mockResolvedValue({ count: 16 });

    const result = await removeAmbiguousAdCampaignAccountKpis.run(tx as never);

    expect(tx.channelScrapeSnapshot.findMany).not.toHaveBeenCalled();
    expect(tx.channelAccountDailyKpiSnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        channel: "coupang",
        source: "advertising",
        kpiType: "advertising_campaign_kpis",
      },
    });
    expect(result).toEqual({
      affectedRows: 16,
      details: {
        deletedAmbiguousAccountKpiCount: 16,
        deletedAmbiguousListingCount: 0,
        clearedMixedListingCount: 0,
        skippedUnsafeListingCount: 0,
        upstreamReplayPolicy: "skip_ambiguous_listing_and_account_projection",
        preservedRawCampaignRuns: true,
        canonicalAccountKpiSource: "coupang_ads/coupang_ads_daily",
      },
    });
  });

  it("deletes a campaign-only listing fact after proving scrape-run provenance", async () => {
    const tx = txFor([listingRow()]);

    const result = await removeAmbiguousAdCampaignAccountKpis.run(tx as never);

    expect(tx.channelScrapeSnapshot.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ id: "snapshot-1", organizationId: "org-1" }],
      },
      select: expect.any(Object),
    });
    expect(tx.channelListingDailySnapshot.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "listing-daily-1",
        organizationId: "org-1",
        rawSnapshotId: "snapshot-1",
        adConversions: 216_470,
      }),
    });
    expect(tx.channelListingDailySnapshot.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      affectedRows: 1,
      details: {
        deletedAmbiguousListingCount: 1,
        clearedMixedListingCount: 0,
      },
    });
  });

  it("clears only campaign-owned fields from a mixed listing fact", async () => {
    const tx = txFor([listingRow({ trafficVisitors: 12 })]);

    const result = await removeAmbiguousAdCampaignAccountKpis.run(tx as never);

    expect(tx.channelListingDailySnapshot.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "listing-daily-1",
        organizationId: "org-1",
        adConversions: 216_470,
      }),
      data: expect.objectContaining({
        adSpend: 0,
        adRevenue: 0,
        adImpressions: 0,
        adClicks: 0,
        adConversions: 0,
        adOrders: 0,
        rawSnapshotId: null,
      }),
    });
    expect(tx.channelListingDailySnapshot.deleteMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      affectedRows: 1,
      details: {
        deletedAmbiguousListingCount: 0,
        clearedMixedListingCount: 1,
      },
    });
  });

  it("fails before cleanup when another advertising owner is mixed in", async () => {
    const tx = txFor([
      listingRow({
        metaJson: {
          "advertising.campaign": { campaignName: "캠페인" },
          "advertising.raw": { source: "report" },
        },
      }),
    ]);

    await expect(
      removeAmbiguousAdCampaignAccountKpis.run(tx as never),
    ).rejects.toThrow(/Unsafe campaign listing projection provenance/);
    expect(tx.channelListingDailySnapshot.updateMany).not.toHaveBeenCalled();
    expect(tx.channelListingDailySnapshot.deleteMany).not.toHaveBeenCalled();
    expect(tx.channelAccountDailyKpiSnapshot.deleteMany).not.toHaveBeenCalled();
  });

  it("fails before cleanup when raw provenance is missing or not a campaign run", async () => {
    const tx = txFor([listingRow()]);
    tx.channelScrapeSnapshot.findMany.mockResolvedValue([
      rawSnapshot({
        scrapeRun: {
          organizationId: "org-1",
          channel: "coupang",
          source: "advertising",
          pageType: "advertising",
        },
      }),
    ]);

    await expect(
      removeAmbiguousAdCampaignAccountKpis.run(tx as never),
    ).rejects.toThrow(/Unsafe campaign listing projection provenance/);
    expect(tx.channelAccountDailyKpiSnapshot.deleteMany).not.toHaveBeenCalled();
  });
});

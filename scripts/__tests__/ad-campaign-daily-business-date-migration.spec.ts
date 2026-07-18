import { describe, expect, it } from "vitest";
import {
  buildAdCampaignDailyRepairPlan,
  hasNonCampaignListingSignal,
  repairAdCampaignDailyBusinessDates,
  type AdCampaignRepairRunInput,
} from "../data-migrations/v0.1.21/001_repair_ad_campaign_daily_business_dates";

const wrongDate = new Date("2026-07-18T00:00:00.000Z");
const requestedDate = new Date("2026-07-17T00:00:00.000Z");

function repairRun(input: {
  id: string;
  observedAt: string;
  spend: number;
  revenue: number;
  campaignName: string;
}): AdCampaignRepairRunInput {
  const observedAt = new Date(input.observedAt);
  return {
    id: input.id,
    organizationId: "org-1",
    channelAccountId: "account-1",
    businessDate: wrongDate,
    periodStart: requestedDate,
    periodEnd: requestedDate,
    startedAt: observedAt,
    finishedAt: observedAt,
    metaJson: {
      campaignName: input.campaignName,
      kpis: { spend: input.spend },
    },
    snapshots: [
      {
        id: `${input.id}-snapshot`,
        organizationId: "org-1",
        businessDate: wrongDate,
        observedAt,
        externalId: "seller-product-1",
        externalOptionId: "vendor-item-1",
        listingId: "listing-1",
        listingOptionId: "option-1",
        normalizedJson: {
          pageType: "product",
          campaignName: input.campaignName,
          productName: "상품",
          runningAdSpend: input.spend,
          revenue: input.revenue,
          impressions: 100,
          clicks: 10,
          conversions: 2,
          orders: 1,
        },
      },
    ],
  };
}

function listingSignalRow(overrides: Record<string, unknown> = {}) {
  return {
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
    metaJson: { "advertising.campaign": { campaignName: "캠페인" } },
    ...overrides,
  };
}

describe("ad campaign daily business-date migration", () => {
  it("uses the durable v0.1.21 migration identity", () => {
    expect(repairAdCampaignDailyBusinessDates).toMatchObject({
      id: "v0.1.21:001_repair_ad_campaign_daily_business_dates",
      releaseVersion: "0.1.21",
    });
  });

  it("replays only campaign-qualified targets and never lossy listing/account facts", () => {
    const first = repairRun({
      id: "run-1",
      observedAt: "2026-07-18T01:00:00.000Z",
      spend: 100,
      revenue: 1000,
      campaignName: "같은 캠페인",
    });
    const second = repairRun({
      id: "run-2",
      observedAt: "2026-07-18T02:00:00.000Z",
      spend: 250,
      revenue: 3000,
      campaignName: "같은 캠페인",
    });

    const plan = buildAdCampaignDailyRepairPlan([first, second]);

    expect(plan.listings).toEqual([]);
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]).toMatchObject({
      businessDate: requestedDate,
      targetKey: "product:같은 캠페인:vendor-item-1",
      metrics: { spend: 250, revenue: 3000 },
      sampleCount: 2,
      rawSnapshotId: "run-2-snapshot",
    });
    expect(plan.accounts).toEqual([]);
    expect(
      plan.targetProjectionKeyBySnapshotId.get("run-2-snapshot"),
    ).toBe(plan.targets[0].key);
  });

  it("keeps the same product in different campaigns as separate targets", () => {
    const first = repairRun({
      id: "run-1",
      observedAt: "2026-07-18T01:00:00.000Z",
      spend: 100,
      revenue: 1000,
      campaignName: "첫 캠페인",
    });
    const second = repairRun({
      id: "run-2",
      observedAt: "2026-07-18T02:00:00.000Z",
      spend: 250,
      revenue: 3000,
      campaignName: "둘째 캠페인",
    });

    const plan = buildAdCampaignDailyRepairPlan([first, second]);

    expect(plan.targets.map((row) => row.targetKey).sort()).toEqual([
      "product:둘째 캠페인:vendor-item-1",
      "product:첫 캠페인:vendor-item-1",
    ]);
    expect(plan.listings).toEqual([]);
    expect(plan.accounts).toEqual([]);
  });

  it("distinguishes campaign-only listing rows from rows carrying traffic or state", () => {
    expect(hasNonCampaignListingSignal(listingSignalRow())).toBe(false);
    expect(
      hasNonCampaignListingSignal(
        listingSignalRow({ trafficVisitors: 12, isOfferWinner: true }),
      ),
    ).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  recoverObservedCampaignTargetConversions,
  repairAdCampaignTargetConversions,
  resolveRevenueShapedCampaignTargetConversion,
  type CampaignTargetRawSnapshot,
  type RevenueShapedCampaignTargetCandidate,
} from "../data-migrations/v0.1.25/003_repair_ad_campaign_target_conversions";

const businessDate = new Date("2026-07-17T00:00:00.000Z");

function candidate(
  overrides: Partial<RevenueShapedCampaignTargetCandidate> = {},
): RevenueShapedCampaignTargetCandidate {
  return {
    id: "target-1",
    organizationId: "org-1",
    businessDate,
    targetKey: "product:vendor-item-1",
    spend: 40_215,
    revenue: 216_470,
    conversions: 216_470,
    orders: 3,
    adSpend: 40_215,
    adRevenue: 216_470,
    rawSnapshotId: "snapshot-1",
    metaJson: {
      "advertising.campaign.target": {
        pageType: "product",
        productName: "상품",
      },
    },
    ...overrides,
  };
}

function rawSnapshot(
  overrides: Partial<CampaignTargetRawSnapshot> = {},
): CampaignTargetRawSnapshot {
  return {
    id: "snapshot-1",
    organizationId: "org-1",
    channel: "coupang",
    source: "advertising",
    pageType: "product",
    businessDate,
    rawJson: {
      "광고 전환 판매수": "4",
      "광고 전환 주문수": "3",
      "광고 전환 매출": "216,470",
    },
    normalizedJson: {
      pageType: "product",
      runningAdSpend: 40_215,
      revenue: 216_470,
      conversions: 216_470,
      orders: 3,
    },
    ...overrides,
  };
}

describe("ad campaign target conversions migration", () => {
  it("uses the durable v0.1.25 migration identity", () => {
    expect(repairAdCampaignTargetConversions).toMatchObject({
      id: "v0.1.25:003_repair_ad_campaign_target_conversions",
      releaseVersion: "0.1.25",
    });
  });

  it("recovers the observed conversion-sale count, never the order count", () => {
    const snapshot = rawSnapshot();

    expect(recoverObservedCampaignTargetConversions(snapshot)).toBe(4);
    expect(
      resolveRevenueShapedCampaignTargetConversion({
        candidate: candidate(),
        rawSnapshot: snapshot,
      }),
    ).toBe(4);
  });

  it("accepts normalized conversions only with an explicit observed-metric marker", () => {
    const snapshot = rawSnapshot({
      rawJson: { "광고 전환 주문수": "3" },
      normalizedJson: {
        pageType: "product",
        runningAdSpend: 40_215,
        revenue: 216_470,
        conversions: 7,
        orders: 3,
        _observedMetrics: { conversions: true },
      },
    });

    expect(recoverObservedCampaignTargetConversions(snapshot)).toBe(7);
  });

  it("returns null when exact conversion evidence is absent or conflicting", () => {
    expect(
      recoverObservedCampaignTargetConversions(
        rawSnapshot({ rawJson: { "광고 전환 주문수": "3" } }),
      ),
    ).toBeNull();
    expect(
      recoverObservedCampaignTargetConversions(
        rawSnapshot({
          rawJson: {
            "광고 전환 판매수": "4",
            rawColumns: { conversions: "5" },
          },
        }),
      ),
    ).toBeNull();
  });

  it("rejects mixed metadata instead of guessing which source owns the metrics", () => {
    expect(
      resolveRevenueShapedCampaignTargetConversion({
        candidate: candidate({
          metaJson: {
            "advertising.campaign.target": { pageType: "product" },
            "advertising.raw.target": { pageType: "product" },
          },
        }),
        rawSnapshot: rawSnapshot(),
      }),
    ).toBeNull();
  });

  it("updates only conversions from the exact raw header with CAS guards", async () => {
    const row = candidate();
    const findUnique = vi.fn().mockResolvedValue(rawSnapshot());
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([row]),
      channelScrapeSnapshot: { findUnique },
      channelAdTargetDailySnapshot: { updateMany },
    };

    const result = await repairAdCampaignTargetConversions.run(tx as never);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        id_organizationId: {
          id: "snapshot-1",
          organizationId: "org-1",
        },
      },
      select: expect.objectContaining({ rawJson: true, normalizedJson: true }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "target-1",
        organizationId: "org-1",
        targetType: "product",
        targetKey: "product:vendor-item-1",
        conversions: 216_470,
        revenue: 216_470,
        orders: 3,
        rawSnapshotId: "snapshot-1",
      }),
      data: { conversions: 4 },
    });
    expect(result).toEqual({
      affectedRows: 1,
      details: {
        candidateCount: 1,
        updatedCount: 1,
        unresolvedEvidenceCount: 0,
        alreadyObservedCount: 0,
        rawSnapshotUpdatedCount: 0,
        metaUpdatedCount: 0,
      },
    });
  });

  it("fails before all writes when any candidate lacks exact evidence", async () => {
    const first = candidate();
    const second = candidate({
      id: "target-2",
      targetKey: "product:vendor-item-2",
      rawSnapshotId: "snapshot-2",
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([first, second]),
      channelScrapeSnapshot: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(rawSnapshot())
          .mockResolvedValueOnce(
            rawSnapshot({
              id: "snapshot-2",
              rawJson: { "광고 전환 주문수": "3" },
            }),
          ),
      },
      channelAdTargetDailySnapshot: { updateMany: vi.fn() },
    };

    await expect(
      repairAdCampaignTargetConversions.run(tx as never),
    ).rejects.toThrow(/evidence is missing or ambiguous.*target-2/);
    expect(tx.channelAdTargetDailySnapshot.updateMany).not.toHaveBeenCalled();
  });

  it("is a no-op after the fingerprint no longer matches", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      channelScrapeSnapshot: { findUnique: vi.fn() },
      channelAdTargetDailySnapshot: { updateMany: vi.fn() },
    };

    await expect(
      repairAdCampaignTargetConversions.run(tx as never),
    ).resolves.toMatchObject({ affectedRows: 0 });
    expect(tx.channelScrapeSnapshot.findUnique).not.toHaveBeenCalled();
    expect(tx.channelAdTargetDailySnapshot.updateMany).not.toHaveBeenCalled();
  });

  it("fails when a candidate changes after validation", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([candidate()]),
      channelScrapeSnapshot: {
        findUnique: vi.fn().mockResolvedValue(rawSnapshot()),
      },
      channelAdTargetDailySnapshot: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    await expect(
      repairAdCampaignTargetConversions.run(tx as never),
    ).rejects.toThrow(/changed during repair/);
  });
});

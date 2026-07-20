import { describe, expect, it, vi } from "vitest";
import {
  buildCampaignQualifiedProductTargetKeys,
  rekeyAdCampaignProductTargets,
  type LegacyCampaignProductTarget,
} from "../data-migrations/v0.1.25/004_rekey_ad_campaign_product_targets";

const businessDate = new Date("2026-07-17T00:00:00.000Z");
const updatedAt = new Date("2026-07-18T01:00:00.000Z");

function target(
  overrides: Partial<LegacyCampaignProductTarget> = {},
): LegacyCampaignProductTarget {
  return {
    id: "target-1",
    organizationId: "org-1",
    businessDate,
    targetKey: "product:vendor-item-1",
    listingId: "listing-1",
    externalId: "seller-product-1",
    externalOptionId: "vendor-item-1",
    campaignId: "campaign-id-1",
    campaignName: "캠페인 이름",
    rawSnapshotId: "snapshot-1",
    metaJson: {
      "advertising.campaign.target": { pageType: "product" },
    },
    updatedAt,
    ...overrides,
  };
}

function rawRow(campaignId = "campaign-id-1", id = "snapshot-1") {
  return {
    id,
    organizationId: "org-1",
    businessDate,
    externalId: "seller-product-1",
    externalOptionId: "vendor-item-1",
    listingId: "listing-1",
    listing: { externalId: "seller-product-1" },
    listingOption: { externalOptionId: "vendor-item-1" },
    normalizedJson: {
      pageType: "product",
      campaignId,
      campaignName: "캠페인 이름",
    },
    scrapeRun: {
      businessDate,
      periodStart: businessDate,
      periodEnd: businessDate,
      period: "1d",
      status: "complete",
      metaJson: { campaignName: "캠페인 이름" },
    },
  };
}

function txFor(rows: LegacyCampaignProductTarget[]) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(rows),
    adAction: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    channelAdTargetDailySnapshot: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    channelScrapeSnapshot: {
      findMany: vi.fn().mockResolvedValue([rawRow()]),
    },
  };
}

describe("ad campaign product target rekey migration", () => {
  it("uses the durable v0.1.25 migration identity", () => {
    expect(rekeyAdCampaignProductTargets).toMatchObject({
      id: "v0.1.25:004_rekey_ad_campaign_product_targets",
      releaseVersion: "0.1.25",
    });
  });

  it("prefers campaign id and external option id for the qualified key", () => {
    expect(
      buildCampaignQualifiedProductTargetKeys({
        campaignId: " campaign-id ",
        campaignName: "campaign name",
        externalOptionId: " vendor-item ",
        externalId: "seller-product",
        listingId: "listing",
      }),
    ).toEqual({
      campaignAnchor: "campaign-id",
      productAnchor: "vendor-item",
      legacyKey: "product:vendor-item",
      qualifiedKey: "product:campaign-id:vendor-item",
    });
  });

  it("falls back to campaign name and the remaining product anchors", () => {
    expect(
      buildCampaignQualifiedProductTargetKeys({
        campaignId: null,
        campaignName: "캠페인",
        externalOptionId: null,
        externalId: "seller-product",
        listingId: "listing",
      }).qualifiedKey,
    ).toBe("product:캠페인:seller-product");
    expect(
      buildCampaignQualifiedProductTargetKeys({
        campaignId: null,
        campaignName: "캠페인",
        externalOptionId: null,
        externalId: null,
        listingId: "listing",
      }).qualifiedKey,
    ).toBe("product:캠페인:listing");
  });

  it("rejects campaign targets without campaign identity", () => {
    expect(() =>
      buildCampaignQualifiedProductTargetKeys({
        campaignId: null,
        campaignName: null,
        externalOptionId: "vendor-item",
        externalId: null,
        listingId: null,
      }),
    ).toThrow(/no campaign identity/);
  });

  it("rekeys only targetKey with organization-scoped CAS guards", async () => {
    const row = target();
    const tx = txFor([row]);

    const result = await rekeyAdCampaignProductTargets.run(tx as never);

    expect(tx.channelAdTargetDailySnapshot.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_channel_businessDate_targetType_targetKey: {
          organizationId: "org-1",
          channel: "coupang",
          businessDate,
          targetType: "product",
          targetKey: "product:campaign-id-1:vendor-item-1",
        },
      },
      select: expect.any(Object),
    });
    expect(tx.channelAdTargetDailySnapshot.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "target-1",
        organizationId: "org-1",
        businessDate,
        targetType: "product",
        targetKey: "product:vendor-item-1",
        campaignId: "campaign-id-1",
        externalOptionId: "vendor-item-1",
        rawSnapshotId: "snapshot-1",
        updatedAt,
      }),
      data: { targetKey: "product:campaign-id-1:vendor-item-1" },
    });
    expect(result).toMatchObject({
      affectedRows: 1,
      details: {
        candidateCount: 1,
        updatedCount: 1,
        skippedAmbiguousEvidenceCount: 0,
        mergedExistingDestinationCount: 0,
      },
    });
  });

  it("is a no-op when fresh replay already wrote only qualified rows", async () => {
    const row = target({
      targetKey: "product:campaign-id-1:vendor-item-1",
    });
    const tx = txFor([row]);

    await expect(
      rekeyAdCampaignProductTargets.run(tx as never),
    ).resolves.toMatchObject({ affectedRows: 0 });
    expect(tx.channelAdTargetDailySnapshot.findUnique).not.toHaveBeenCalled();
    expect(tx.channelScrapeSnapshot.findMany).not.toHaveBeenCalled();
    expect(tx.channelAdTargetDailySnapshot.updateMany).not.toHaveBeenCalled();
  });

  it("rekeys a product safely when multiple campaigns exist on the day", async () => {
    const tx = txFor([target()]);
    tx.channelScrapeSnapshot.findMany.mockResolvedValue([
      rawRow("campaign-id-1", "snapshot-1"),
      rawRow("campaign-id-2", "snapshot-2"),
    ]);

    await expect(
      rekeyAdCampaignProductTargets.run(tx as never),
    ).resolves.toMatchObject({
      affectedRows: 1,
      details: { updatedCount: 1, skippedAmbiguousEvidenceCount: 0 },
    });
    expect(tx.channelAdTargetDailySnapshot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { targetKey: "product:campaign-id-1:vendor-item-1" },
      }),
    );
  });

  it("fails before writes when a multi-campaign legacy row has no exact link", async () => {
    const tx = txFor([target({ rawSnapshotId: null })]);
    tx.channelScrapeSnapshot.findMany.mockResolvedValue([
      rawRow("campaign-id-1", "snapshot-1"),
      rawRow("campaign-id-2", "snapshot-2"),
    ]);

    await expect(
      rekeyAdCampaignProductTargets.run(tx as never),
    ).rejects.toThrow(/raw evidence is missing or ambiguous/);
    expect(tx.channelAdTargetDailySnapshot.updateMany).not.toHaveBeenCalled();
    expect(tx.channelAdTargetDailySnapshot.deleteMany).not.toHaveBeenCalled();
  });

  it("merges a proven legacy row into an existing qualified destination", async () => {
    const tx = txFor([target()]);
    tx.channelAdTargetDailySnapshot.findUnique.mockResolvedValue({
      id: "qualified-target",
      targetKey: "product:campaign-id-1:vendor-item-1",
      listingId: "listing-1",
      externalId: "seller-product-1",
      externalOptionId: "vendor-item-1",
      campaignId: "campaign-id-1",
      campaignName: "캠페인 이름",
      metaJson: {
        "advertising.campaign.target": { pageType: "product" },
      },
    });
    tx.adAction.updateMany.mockResolvedValue({ count: 2 });

    const result = await rekeyAdCampaignProductTargets.run(tx as never);

    expect(tx.adAction.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", adTargetDailyId: "target-1" },
      data: { adTargetDailyId: "qualified-target" },
    });
    expect(tx.channelAdTargetDailySnapshot.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "target-1",
        organizationId: "org-1",
        targetKey: "product:vendor-item-1",
        updatedAt,
      }),
    });
    expect(tx.channelAdTargetDailySnapshot.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      affectedRows: 3,
      details: {
        updatedCount: 0,
        mergedExistingDestinationCount: 1,
        reparentedActionCount: 2,
      },
    });
  });

  it("fails before writes for an unsafe legacy identity/key", async () => {
    const tx = txFor([
      target({ campaignId: null, campaignName: null, rawSnapshotId: null }),
    ]);

    await expect(
      rekeyAdCampaignProductTargets.run(tx as never),
    ).rejects.toThrow(/Unsafe campaign product target identity\/key/);
    expect(tx.channelScrapeSnapshot.findMany).not.toHaveBeenCalled();
    expect(tx.channelAdTargetDailySnapshot.updateMany).not.toHaveBeenCalled();
  });

  it("fails when a target changes after preflight", async () => {
    const tx = txFor([target()]);
    tx.channelAdTargetDailySnapshot.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      rekeyAdCampaignProductTargets.run(tx as never),
    ).rejects.toThrow(/changed during rekey/);
  });
});

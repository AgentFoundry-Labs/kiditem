import { Prisma, type Prisma as PrismaNamespace } from "@prisma/client";
import type { DataMigration } from "../types";
import { hasNonCampaignListingSignal } from "./001_repair_ad_campaign_daily_business_dates";

const CAMPAIGN_LISTING_META = "advertising.campaign";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function removeCampaignMeta(metaJson: unknown): JsonRecord {
  const next = { ...asRecord(metaJson) };
  delete next[CAMPAIGN_LISTING_META];
  return next;
}

function jsonValueOrDbNull(
  value: JsonRecord,
): PrismaNamespace.InputJsonValue | typeof Prisma.DbNull {
  return Object.keys(value).length > 0
    ? (value as PrismaNamespace.InputJsonValue)
    : Prisma.DbNull;
}

function rawSnapshotKey(organizationId: string, id: string): string {
  return `${organizationId}\u0000${id}`;
}

/**
 * `ad_campaign` is submitted once per campaign, but its legacy account and
 * listing destinations are unique only by account/day and listing/day. Those
 * rows are lossy last-writes, not exact daily totals. Raw campaign runs and
 * campaign-qualified target facts remain the audit/source-of-truth; exact
 * account totals live under `source='coupang_ads', kpiType='coupang_ads_daily'`.
 */
export const removeAmbiguousAdCampaignAccountKpis: DataMigration = {
  id: "v0.1.25:005_remove_ambiguous_ad_campaign_account_kpis",
  releaseVersion: "0.1.25",
  name: "Remove ambiguous per-campaign account and listing projections",
  async run(tx) {
    const listingRows = await tx.channelListingDailySnapshot.findMany({
      where: {
        channel: "coupang",
        metaJson: {
          path: [CAMPAIGN_LISTING_META],
          not: Prisma.AnyNull,
        },
      },
      select: {
        id: true,
        organizationId: true,
        rawSnapshotId: true,
        status: true,
        exposureStatus: true,
        saleStatus: true,
        channelPrice: true,
        reviewCount: true,
        avgRating: true,
        isOfferWinner: true,
        myPrice: true,
        winnerPrice: true,
        winnerGapPrice: true,
        productRank: true,
        categoryRank: true,
        adSpend: true,
        adRevenue: true,
        adImpressions: true,
        adClicks: true,
        adConversions: true,
        adOrders: true,
        adDirectOrders1d: true,
        adIndirectOrders1d: true,
        adDirectQty1d: true,
        adIndirectQty1d: true,
        adDirectRevenue1d: true,
        adIndirectRevenue1d: true,
        adTotalOrders14d: true,
        adDirectOrders14d: true,
        adIndirectOrders14d: true,
        adTotalQty14d: true,
        adDirectQty14d: true,
        adIndirectQty14d: true,
        adTotalRevenue14d: true,
        adDirectRevenue14d: true,
        adIndirectRevenue14d: true,
        trafficVisitors: true,
        trafficViews: true,
        trafficCartAdds: true,
        trafficOrders: true,
        trafficSalesQty: true,
        trafficRevenue: true,
        metaJson: true,
      },
      orderBy: [{ organizationId: "asc" }, { businessDate: "asc" }, { id: "asc" }],
    });

    const rawSnapshotKeys = listingRows.flatMap((row) =>
      row.rawSnapshotId
        ? [{ id: row.rawSnapshotId, organizationId: row.organizationId }]
        : [],
    );
    const rawSnapshots =
      rawSnapshotKeys.length > 0
        ? await tx.channelScrapeSnapshot.findMany({
            where: { OR: rawSnapshotKeys },
            select: {
              id: true,
              organizationId: true,
              channel: true,
              source: true,
              pageType: true,
              scrapeRun: {
                select: {
                  organizationId: true,
                  channel: true,
                  source: true,
                  pageType: true,
                },
              },
            },
          })
        : [];
    const rawSnapshotByKey = new Map(
      rawSnapshots.map((row) => [
        rawSnapshotKey(row.organizationId, row.id),
        row,
      ]),
    );
    const safeListingRows: typeof listingRows = [];
    const unsafeListingIds: string[] = [];
    for (const row of listingRows) {
      const meta = asRecord(row.metaJson);
      const hasOtherAdvertisingOwner = Object.keys(meta).some(
        (key) => key !== CAMPAIGN_LISTING_META && key.startsWith("advertising."),
      );
      const rawSnapshot = row.rawSnapshotId
        ? rawSnapshotByKey.get(
            rawSnapshotKey(row.organizationId, row.rawSnapshotId),
          )
        : null;
      const scrapeRun = rawSnapshot?.scrapeRun;
      if (
        !Object.hasOwn(meta, CAMPAIGN_LISTING_META) ||
        hasOtherAdvertisingOwner ||
        !rawSnapshot ||
        rawSnapshot.organizationId !== row.organizationId ||
        rawSnapshot.channel !== "coupang" ||
        rawSnapshot.source !== "advertising" ||
        rawSnapshot.pageType !== "product" ||
        !scrapeRun ||
        scrapeRun.organizationId !== row.organizationId ||
        scrapeRun.channel !== "coupang" ||
        scrapeRun.source !== "advertising" ||
        scrapeRun.pageType !== "campaign"
      ) {
        unsafeListingIds.push(row.id);
        continue;
      }

      safeListingRows.push(row);
    }

    // Successful migrations are not rerun. If provenance cannot prove that
    // every campaign-marked listing row came from the lossy campaign writer,
    // fail before any mutation so the transaction remains retryable instead
    // of silently leaving an active, potentially corrupted daily fact.
    if (unsafeListingIds.length > 0) {
      throw new Error(
        `Unsafe campaign listing projection provenance for ${unsafeListingIds.length} row(s): ${unsafeListingIds.join(", ")}`,
      );
    }

    let deletedAmbiguousListingCount = 0;
    let clearedMixedListingCount = 0;
    for (const row of safeListingRows) {

      const where = {
        id: row.id,
        organizationId: row.organizationId,
        rawSnapshotId: row.rawSnapshotId,
        adSpend: row.adSpend,
        adRevenue: row.adRevenue,
        adImpressions: row.adImpressions,
        adClicks: row.adClicks,
        adConversions: row.adConversions,
        adOrders: row.adOrders,
      };
      if (hasNonCampaignListingSignal(row)) {
        const updated = await tx.channelListingDailySnapshot.updateMany({
          where,
          data: {
            adSpend: 0,
            adRevenue: 0,
            adImpressions: 0,
            adClicks: 0,
            adConversions: 0,
            adOrders: 0,
            rawSnapshotId: null,
            metaJson: jsonValueOrDbNull(removeCampaignMeta(row.metaJson)),
          },
        });
        if (updated.count !== 1) {
          throw new Error(
            `Campaign listing projection changed during cleanup: ${row.id}`,
          );
        }
        clearedMixedListingCount += 1;
      } else {
        const deleted = await tx.channelListingDailySnapshot.deleteMany({ where });
        if (deleted.count !== 1) {
          throw new Error(
            `Campaign listing projection changed during cleanup: ${row.id}`,
          );
        }
        deletedAmbiguousListingCount += 1;
      }
    }

    const deletedAccountKpis = await tx.channelAccountDailyKpiSnapshot.deleteMany({
      where: {
        channel: "coupang",
        source: "advertising",
        kpiType: "advertising_campaign_kpis",
      },
    });

    const affectedRows =
      deletedAmbiguousListingCount +
      clearedMixedListingCount +
      deletedAccountKpis.count;
    return {
      affectedRows,
      details: {
        deletedAmbiguousAccountKpiCount: deletedAccountKpis.count,
        deletedAmbiguousListingCount,
        clearedMixedListingCount,
        skippedUnsafeListingCount: 0,
        upstreamReplayPolicy: "skip_ambiguous_listing_and_account_projection",
        preservedRawCampaignRuns: true,
        canonicalAccountKpiSource: "coupang_ads/coupang_ads_daily",
      },
    };
  },
};

import { Prisma, type Prisma as PrismaNamespace } from "@prisma/client";
import type { DataMigration } from "../types";

const CAMPAIGN_LISTING_META = "advertising.campaign";
const CAMPAIGN_TARGET_META = "advertising.campaign.target";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

export type AdCampaignRepairSnapshotInput = {
  id: string;
  organizationId: string;
  businessDate: Date | null;
  observedAt: Date;
  externalId: string | null;
  externalOptionId: string | null;
  listingId: string | null;
  listingOptionId: string | null;
  normalizedJson: unknown;
};

export type AdCampaignRepairRunInput = {
  id: string;
  organizationId: string;
  channelAccountId: string;
  businessDate: Date;
  periodStart: Date;
  periodEnd: Date;
  startedAt: Date;
  finishedAt: Date | null;
  metaJson: unknown;
  snapshots: AdCampaignRepairSnapshotInput[];
};

type AdMetrics = {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
};

export type AdCampaignListingProjection = {
  key: string;
  organizationId: string;
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  productName: string | null;
  rawSnapshotId: string;
  metaData: JsonRecord;
  metrics: AdMetrics;
  sampleCount: number;
  firstObservedAt: Date;
  lastObservedAt: Date;
};

export type AdCampaignTargetProjection = {
  key: string;
  organizationId: string;
  channel: string;
  businessDate: Date;
  targetType: "campaign" | "keyword" | "product";
  targetKey: string;
  listingId: string | null;
  listingOptionId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adGroup: string | null;
  keyword: string | null;
  placement: string | null;
  status: string | null;
  onOff: string | null;
  currentBid: number | null;
  dailyBudget: number | null;
  rawSnapshotId: string;
  metaData: JsonRecord;
  metrics: AdMetrics;
  sampleCount: number;
  firstObservedAt: Date;
  lastObservedAt: Date;
};

export type AdCampaignAccountProjection = {
  key: string;
  organizationId: string;
  channelAccountId: string;
  channel: string;
  source: string;
  kpiType: string;
  businessDate: Date;
  periodStart: Date;
  periodEnd: Date;
  normalizedJson: JsonRecord;
  rawJson: JsonRecord;
  sampleCount: number;
  firstObservedAt: Date;
  lastObservedAt: Date;
};

export type AdCampaignDailyRepairPlan = {
  listings: AdCampaignListingProjection[];
  targets: AdCampaignTargetProjection[];
  accounts: AdCampaignAccountProjection[];
  targetProjectionKeyBySnapshotId: Map<string, string>;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/[^\d.-]/g, "");
  return normalized ? Number(normalized) || 0 : 0;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function minDate(left: Date, right: Date): Date {
  return left <= right ? left : right;
}

function maxDate(left: Date, right: Date): Date {
  return left >= right ? left : right;
}

function targetTypeOf(
  pageType: string,
  keyword: string | null,
): "campaign" | "keyword" | "product" {
  if (pageType === "product") return "product";
  if (keyword) return "keyword";
  return "campaign";
}

function buildTargetKey(input: {
  targetType: "campaign" | "keyword" | "product";
  campaignId: string | null;
  campaignName: string | null;
  adGroup: string | null;
  keyword: string | null;
  externalOptionId: string | null;
  externalId: string | null;
  listingId: string | null;
}): string {
  const campaignAnchor = input.campaignId ?? input.campaignName;
  const productAnchor =
    input.externalOptionId ?? input.externalId ?? input.listingId;
  if (input.targetType === "campaign") {
    if (!campaignAnchor) throw new Error("campaign target has no identity");
    return `campaign:${campaignAnchor}`;
  }
  if (input.targetType === "keyword") {
    if (!campaignAnchor || !input.keyword) {
      throw new Error("keyword target has no identity");
    }
    return `keyword:${campaignAnchor}:${input.adGroup ?? ""}:${input.keyword}`;
  }
  if (!productAnchor) throw new Error("product target has no identity");
  return campaignAnchor
    ? `product:${campaignAnchor}:${productAnchor}`
    : `product:${productAnchor}`;
}

function metricsOf(row: JsonRecord): AdMetrics {
  return {
    spend: Math.round(toNumber(row.runningAdSpend ?? row.spend)),
    revenue: Math.round(toNumber(row.revenue)),
    impressions: Math.round(toNumber(row.impressions)),
    clicks: Math.round(toNumber(row.clicks)),
    conversions: Math.round(toNumber(row.conversions)),
    orders: Math.round(toNumber(row.orders)),
  };
}

function projectionKey(parts: Array<string | null>): string {
  return parts.map((part) => part ?? "").join("\u0000");
}

/**
 * Freeze the v0.1.25 replay semantics beside the migration. Historical data
 * migrations must not change when the live ingest normalizers evolve later.
 */
export function buildAdCampaignDailyRepairPlan(
  runs: AdCampaignRepairRunInput[],
  listingExternalIdById: ReadonlyMap<string, string> = new Map(),
  optionExternalIdById: ReadonlyMap<string, string> = new Map(),
): AdCampaignDailyRepairPlan {
  // `ad_campaign` rows are collected once per campaign. Listing daily facts
  // are unique only by listing/day, so replaying them would either last-write
  // one campaign or require an aggregation contract the historical payload
  // does not prove. Keep the compatibility field empty and repair targets only.
  const listings: AdCampaignListingProjection[] = [];
  const targets = new Map<string, AdCampaignTargetProjection>();
  // Account KPI rows have the same per-campaign -> per-account/day loss. 005
  // removes that legacy projection, so 001 must not recreate it first.
  const accounts: AdCampaignAccountProjection[] = [];
  const targetProjectionKeyBySnapshotId = new Map<string, string>();

  for (const run of runs) {
    const runMeta = asRecord(run.metaJson);
    const campaignName = cleanString(runMeta.campaignName) ?? "_전체";

    for (const snapshot of run.snapshots) {
      const row = asRecord(snapshot.normalizedJson);
      if (Object.keys(row).length === 0 || row._kpiOnly) continue;
      if (!row.campaignName && !row.productName && !row.keyword) continue;

      const rowCampaignName = cleanString(row.campaignName) ?? campaignName;
      const rowCampaignId = cleanString(row.campaignId);
      const rowAdGroup = cleanString(row.adGroup);
      const rowKeyword = cleanString(row.keyword);
      const pageType = cleanString(row.pageType) ?? "campaign";
      const externalId =
        snapshot.externalId ??
        (snapshot.listingId
          ? listingExternalIdById.get(snapshot.listingId) ?? null
          : null);
      const externalOptionId =
        snapshot.externalOptionId ??
        (snapshot.listingOptionId
          ? optionExternalIdById.get(snapshot.listingOptionId) ?? null
          : null);
      const metrics = metricsOf(row);

      const targetType = targetTypeOf(pageType, rowKeyword);
      let targetKey: string;
      try {
        targetKey = buildTargetKey({
          targetType,
          campaignId: rowCampaignId,
          campaignName: rowCampaignName,
          adGroup: rowAdGroup,
          keyword: rowKeyword,
          externalOptionId,
          externalId,
          listingId: snapshot.listingId,
        });
      } catch {
        continue;
      }
      const key = projectionKey([
        run.organizationId,
        "coupang",
        dateKey(run.periodStart),
        targetType,
        targetKey,
      ]);
      const current = targets.get(key);
      const descriptors = {
        listingId: snapshot.listingId,
        listingOptionId: snapshot.listingOptionId,
        externalId,
        externalOptionId,
        campaignId: rowCampaignId,
        campaignName: rowCampaignName,
        adGroup: rowAdGroup,
        keyword: rowKeyword,
        placement: cleanString(row.placement),
        status: cleanString(row.status),
        onOff: cleanString(row.onOff),
        currentBid: toNumberOrNull(row.currentBid),
        dailyBudget: toNumberOrNull(row.dailyBudget),
      };
      const metaData = {
        providerRoas: toNumber(row.roas ?? row.adEfficiencyTarget),
        providerCtr: toNumber(row.ctr),
        providerConversionRate: toNumber(row.conversionRate),
        pageType,
        productName: cleanString(row.productName),
        imageUrl: cleanString(row.imageUrl),
        productUrl: cleanString(row.productUrl),
        saleType: cleanString(row.saleType),
      };
      if (current) {
        for (const [descriptor, value] of Object.entries(descriptors)) {
          if (value !== null && value !== undefined) {
            (current as unknown as JsonRecord)[descriptor] = value;
          }
        }
        current.rawSnapshotId = snapshot.id;
        current.metaData = metaData;
        current.metrics = metrics;
        current.sampleCount += 1;
        current.firstObservedAt = minDate(
          current.firstObservedAt,
          snapshot.observedAt,
        );
        current.lastObservedAt = maxDate(
          current.lastObservedAt,
          snapshot.observedAt,
        );
      } else {
        targets.set(key, {
          key,
          organizationId: run.organizationId,
          channel: "coupang",
          businessDate: run.periodStart,
          targetType,
          targetKey,
          ...descriptors,
          rawSnapshotId: snapshot.id,
          metaData,
          metrics,
          sampleCount: 1,
          firstObservedAt: snapshot.observedAt,
          lastObservedAt: snapshot.observedAt,
        });
      }
      targetProjectionKeyBySnapshotId.set(snapshot.id, key);
    }

  }

  return {
    listings,
    targets: [...targets.values()],
    accounts,
    targetProjectionKeyBySnapshotId,
  };
}

function hasOtherAdvertisingMeta(
  metaJson: unknown,
  allowedKey: string,
): boolean {
  return Object.keys(asRecord(metaJson)).some(
    (key) => key !== allowedKey && key.startsWith("advertising."),
  );
}

function removeMetaKey(metaJson: unknown, key: string): JsonRecord {
  const next = { ...asRecord(metaJson) };
  delete next[key];
  return next;
}

function jsonValueOrDbNull(
  value: JsonRecord,
): PrismaNamespace.InputJsonValue | typeof Prisma.DbNull {
  return Object.keys(value).length > 0
    ? (value as PrismaNamespace.InputJsonValue)
    : Prisma.DbNull;
}

export function hasNonCampaignListingSignal(row: {
  status: string | null;
  exposureStatus: string | null;
  saleStatus: string | null;
  channelPrice: number | null;
  reviewCount: number | null;
  avgRating: PrismaNamespace.Decimal | null;
  isOfferWinner: boolean | null;
  myPrice: number | null;
  winnerPrice: number | null;
  winnerGapPrice: number | null;
  productRank: number | null;
  categoryRank: number | null;
  adDirectOrders1d: number;
  adIndirectOrders1d: number;
  adDirectQty1d: number;
  adIndirectQty1d: number;
  adDirectRevenue1d: number;
  adIndirectRevenue1d: number;
  adTotalOrders14d: number;
  adDirectOrders14d: number;
  adIndirectOrders14d: number;
  adTotalQty14d: number;
  adDirectQty14d: number;
  adIndirectQty14d: number;
  adTotalRevenue14d: number;
  adDirectRevenue14d: number;
  adIndirectRevenue14d: number;
  trafficVisitors: number;
  trafficViews: number;
  trafficCartAdds: number;
  trafficOrders: number;
  trafficSalesQty: number;
  trafficRevenue: number;
  metaJson: unknown;
}): boolean {
  const nullableState = [
    row.status,
    row.exposureStatus,
    row.saleStatus,
    row.channelPrice,
    row.reviewCount,
    row.avgRating,
    row.isOfferWinner,
    row.myPrice,
    row.winnerPrice,
    row.winnerGapPrice,
    row.productRank,
    row.categoryRank,
  ];
  const otherMetrics = [
    row.adDirectOrders1d,
    row.adIndirectOrders1d,
    row.adDirectQty1d,
    row.adIndirectQty1d,
    row.adDirectRevenue1d,
    row.adIndirectRevenue1d,
    row.adTotalOrders14d,
    row.adDirectOrders14d,
    row.adIndirectOrders14d,
    row.adTotalQty14d,
    row.adDirectQty14d,
    row.adIndirectQty14d,
    row.adTotalRevenue14d,
    row.adDirectRevenue14d,
    row.adIndirectRevenue14d,
    row.trafficVisitors,
    row.trafficViews,
    row.trafficCartAdds,
    row.trafficOrders,
    row.trafficSalesQty,
    row.trafficRevenue,
  ];
  const otherMeta = removeMetaKey(row.metaJson, CAMPAIGN_LISTING_META);
  return (
    nullableState.some((value) => value !== null) ||
    otherMetrics.some((value) => value !== 0) ||
    Object.keys(otherMeta).length > 0
  );
}

function sameDay(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function kstStartedDate(run: { startedAt: Date }): string {
  return new Date(run.startedAt.getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export const repairAdCampaignDailyBusinessDates: DataMigration = {
  id: "v0.1.25:001_repair_ad_campaign_daily_business_dates",
  releaseVersion: "0.1.25",
  name: "Repair Coupang ad campaign daily business dates from raw evidence",
  async run(tx) {
    const oneDayRuns = await tx.channelScrapeRun.findMany({
      where: {
        channel: "coupang",
        source: "advertising",
        pageType: "campaign",
        period: "1d",
        periodStart: { not: null },
      },
      orderBy: [{ periodStart: "asc" }, { startedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        organizationId: true,
        channelAccountId: true,
        businessDate: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        metaJson: true,
        snapshots: {
          orderBy: [{ observedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            organizationId: true,
            businessDate: true,
            observedAt: true,
            externalId: true,
            externalOptionId: true,
            listingId: true,
            listingOptionId: true,
            normalizedJson: true,
          },
        },
      },
    });

    const mismatchedRuns = oneDayRuns.filter(
      (run) => !sameDay(run.businessDate, run.periodStart),
    );
    if (mismatchedRuns.length === 0) {
      return {
        affectedRows: 0,
        details: {
          candidateRunCount: 0,
          replayedListingFactCount: 0,
          replayedTargetFactCount: 0,
          replayedAccountKpiCount: 0,
        },
      };
    }

    for (const run of mismatchedRuns) {
      if (
        run.status !== "complete" ||
        !run.businessDate ||
        !run.periodStart ||
        !run.periodEnd ||
        !sameDay(run.periodStart, run.periodEnd) ||
        dateKey(run.businessDate) !== kstStartedDate(run) ||
        run.periodStart > run.businessDate
      ) {
        throw new Error(
          `Unsafe ad_campaign 1d repair candidate: ${run.id}`,
        );
      }
      if (
        run.snapshots.some(
          (snapshot) =>
            snapshot.organizationId !== run.organizationId ||
            !sameDay(snapshot.businessDate, run.businessDate),
        )
      ) {
        throw new Error(
          `Ad campaign run has mixed snapshot business dates: ${run.id}`,
        );
      }
    }

    const listingIds = [
      ...new Set(
        mismatchedRuns.flatMap((run) =>
          run.snapshots.flatMap((snapshot) =>
            snapshot.listingId ? [snapshot.listingId] : [],
          ),
        ),
      ),
    ];
    const listingOptionIds = [
      ...new Set(
        mismatchedRuns.flatMap((run) =>
          run.snapshots.flatMap((snapshot) =>
            snapshot.listingOptionId ? [snapshot.listingOptionId] : [],
          ),
        ),
      ),
    ];
    const listings =
      listingIds.length > 0
        ? await tx.channelListing.findMany({
            where: { id: { in: listingIds } },
            select: { id: true, externalId: true },
          })
        : [];
    const listingOptions =
      listingOptionIds.length > 0
        ? await tx.channelListingOption.findMany({
            where: { id: { in: listingOptionIds } },
            select: { id: true, externalOptionId: true },
          })
        : [];

    const repairRuns: AdCampaignRepairRunInput[] = mismatchedRuns.map((run) => ({
      id: run.id,
      organizationId: run.organizationId,
      channelAccountId: run.channelAccountId,
      businessDate: run.businessDate as Date,
      periodStart: run.periodStart as Date,
      periodEnd: run.periodEnd as Date,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      metaJson: run.metaJson,
      snapshots: run.snapshots,
    }));
    const plan = buildAdCampaignDailyRepairPlan(
      repairRuns,
      new Map(listings.map((row) => [row.id, row.externalId])),
      new Map(
        listingOptions.map((row) => [row.id, row.externalOptionId]),
      ),
    );
    const candidateSnapshotIds = new Set(
      repairRuns.flatMap((run) => run.snapshots.map((snapshot) => snapshot.id)),
    );
    const wrongListingDates = [
      ...new Map(
        repairRuns.map((run) => [
          projectionKey([run.organizationId, dateKey(run.businessDate)]),
          {
            organizationId: run.organizationId,
            businessDate: run.businessDate,
          },
        ]),
      ).values(),
    ];
    const wrongAccountDates = [
      ...new Map(
        repairRuns.map((run) => [
          projectionKey([
            run.organizationId,
            run.channelAccountId,
            dateKey(run.businessDate),
          ]),
          {
            organizationId: run.organizationId,
            channelAccountId: run.channelAccountId,
            businessDate: run.businessDate,
          },
        ]),
      ).values(),
    ];

    const listingSelect = {
      id: true,
      organizationId: true,
      listingId: true,
      businessDate: true,
      productName: true,
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
      sampleCount: true,
      firstObservedAt: true,
      lastObservedAt: true,
      rawSnapshotId: true,
      metaJson: true,
    } as const;
    const wrongListingRows = await tx.channelListingDailySnapshot.findMany({
      where: { OR: wrongListingDates },
      select: listingSelect,
    });
    const taintedListingRows = wrongListingRows.filter((row) => {
      const meta = asRecord(row.metaJson);
      return (
        candidateSnapshotIds.has(row.rawSnapshotId ?? "") ||
        Object.hasOwn(meta, CAMPAIGN_LISTING_META)
      );
    });
    for (const row of taintedListingRows) {
      if (
        !candidateSnapshotIds.has(row.rawSnapshotId ?? "") ||
        !Object.hasOwn(asRecord(row.metaJson), CAMPAIGN_LISTING_META) ||
        hasOtherAdvertisingMeta(row.metaJson, CAMPAIGN_LISTING_META)
      ) {
        throw new Error(`Unsafe mixed listing projection: ${row.id}`);
      }
    }

    const wrongTargetRows = await tx.channelAdTargetDailySnapshot.findMany({
      where: { OR: wrongListingDates },
      select: {
        id: true,
        organizationId: true,
        rawSnapshotId: true,
        metaJson: true,
      },
    });
    const taintedTargetRows = wrongTargetRows.filter((row) => {
      const meta = asRecord(row.metaJson);
      return (
        candidateSnapshotIds.has(row.rawSnapshotId ?? "") ||
        Object.hasOwn(meta, CAMPAIGN_TARGET_META)
      );
    });
    for (const row of taintedTargetRows) {
      const rawSnapshotId = row.rawSnapshotId ?? "";
      if (
        !candidateSnapshotIds.has(rawSnapshotId) ||
        !Object.hasOwn(asRecord(row.metaJson), CAMPAIGN_TARGET_META) ||
        Object.keys(asRecord(row.metaJson)).some(
          (key) => key !== CAMPAIGN_TARGET_META,
        ) ||
        !plan.targetProjectionKeyBySnapshotId.has(rawSnapshotId)
      ) {
        throw new Error(`Unsafe mixed target projection: ${row.id}`);
      }
    }

    const wrongAccountRows =
      await tx.channelAccountDailyKpiSnapshot.findMany({
        where: {
          source: "advertising",
          kpiType: "advertising_campaign_kpis",
          OR: wrongAccountDates,
        },
        select: {
          id: true,
          organizationId: true,
          channelAccountId: true,
          businessDate: true,
          periodStart: true,
          periodEnd: true,
        },
      });
    const repairAccountKeys = new Set(
      repairRuns.map((run) =>
        projectionKey([
          run.organizationId,
          run.channelAccountId,
          dateKey(run.periodStart),
        ]),
      ),
    );
    const taintedAccountRows = wrongAccountRows.filter(
      (row) => !sameDay(row.businessDate, row.periodStart),
    );
    for (const row of taintedAccountRows) {
      if (
        !row.periodStart ||
        !row.periodEnd ||
        !sameDay(row.periodStart, row.periodEnd) ||
        !repairAccountKeys.has(
          projectionKey([
            row.organizationId,
            row.channelAccountId,
            dateKey(row.periodStart),
          ]),
        )
      ) {
        throw new Error(`Unsafe account KPI projection: ${row.id}`);
      }
    }

    const destinationListings = new Map<
      string,
      Awaited<
        ReturnType<
          typeof tx.channelListingDailySnapshot.findUnique
        >
      >
    >();
    for (const projection of plan.listings) {
      const existing = await tx.channelListingDailySnapshot.findUnique({
        where: {
          organizationId_listingId_businessDate: {
            organizationId: projection.organizationId,
            listingId: projection.listingId,
            businessDate: projection.businessDate,
          },
        },
      });
      if (
        existing &&
        (existing.adSpend !== 0 ||
          existing.adRevenue !== 0 ||
          existing.adImpressions !== 0 ||
          existing.adClicks !== 0 ||
          existing.adConversions !== 0 ||
          existing.adOrders !== 0 ||
          Object.keys(asRecord(existing.metaJson)).some((key) =>
            key.startsWith("advertising."),
          ))
      ) {
        throw new Error(
          `Destination listing already has advertising facts: ${existing.id}`,
        );
      }
      destinationListings.set(projection.key, existing);
    }
    for (const projection of plan.targets) {
      const existing = await tx.channelAdTargetDailySnapshot.findUnique({
        where: {
          organizationId_channel_businessDate_targetType_targetKey: {
            organizationId: projection.organizationId,
            channel: projection.channel,
            businessDate: projection.businessDate,
            targetType: projection.targetType,
            targetKey: projection.targetKey,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new Error(
          `Destination target fact already exists: ${existing.id}`,
        );
      }
    }
    for (const projection of plan.accounts) {
      const existing = await tx.channelAccountDailyKpiSnapshot.findUnique({
        where: {
          organizationId_channelAccountId_source_businessDate_kpiType: {
            organizationId: projection.organizationId,
            channelAccountId: projection.channelAccountId,
            source: projection.source,
            businessDate: projection.businessDate,
            kpiType: projection.kpiType,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new Error(
          `Destination campaign KPI already exists: ${existing.id}`,
        );
      }
    }

    let affectedRows = 0;
    let mergedDestinationListingCount = 0;
    for (const projection of plan.listings) {
      const existing = destinationListings.get(projection.key);
      const campaignMeta = {
        ...asRecord(existing?.metaJson),
        [CAMPAIGN_LISTING_META]: projection.metaData,
      };
      if (existing) {
        const updated = await tx.channelListingDailySnapshot.updateMany({
          where: {
            id: existing.id,
            organizationId: projection.organizationId,
          },
          data: {
            adSpend: projection.metrics.spend,
            adRevenue: projection.metrics.revenue,
            adImpressions: projection.metrics.impressions,
            adClicks: projection.metrics.clicks,
            adConversions: projection.metrics.conversions,
            adOrders: projection.metrics.orders,
            ...(existing.productName === null && projection.productName
              ? { productName: projection.productName }
              : {}),
            metaJson: campaignMeta as PrismaNamespace.InputJsonValue,
            sampleCount: existing.sampleCount + projection.sampleCount,
            firstObservedAt: minDate(
              existing.firstObservedAt,
              projection.firstObservedAt,
            ),
            lastObservedAt: maxDate(
              existing.lastObservedAt,
              projection.lastObservedAt,
            ),
          },
        });
        affectedRows += updated.count;
        mergedDestinationListingCount += updated.count;
      } else {
        await tx.channelListingDailySnapshot.create({
          data: {
            organizationId: projection.organizationId,
            listingId: projection.listingId,
            channel: projection.channel,
            externalId: projection.externalId,
            businessDate: projection.businessDate,
            productName: projection.productName,
            adSpend: projection.metrics.spend,
            adRevenue: projection.metrics.revenue,
            adImpressions: projection.metrics.impressions,
            adClicks: projection.metrics.clicks,
            adConversions: projection.metrics.conversions,
            adOrders: projection.metrics.orders,
            rawSnapshotId: projection.rawSnapshotId,
            metaJson: campaignMeta as PrismaNamespace.InputJsonValue,
            sampleCount: projection.sampleCount,
            firstObservedAt: projection.firstObservedAt,
            lastObservedAt: projection.lastObservedAt,
            createdAt: projection.firstObservedAt,
            updatedAt: projection.lastObservedAt,
          },
        });
        affectedRows += 1;
      }
    }

    const destinationTargetIdByKey = new Map<string, string>();
    for (const projection of plan.targets) {
      const created = await tx.channelAdTargetDailySnapshot.create({
        data: {
          organizationId: projection.organizationId,
          channel: projection.channel,
          businessDate: projection.businessDate,
          targetType: projection.targetType,
          targetKey: projection.targetKey,
          listingId: projection.listingId,
          listingOptionId: projection.listingOptionId,
          externalId: projection.externalId,
          externalOptionId: projection.externalOptionId,
          campaignId: projection.campaignId,
          campaignName: projection.campaignName,
          adGroup: projection.adGroup,
          keyword: projection.keyword,
          placement: projection.placement,
          status: projection.status,
          onOff: projection.onOff,
          currentBid: projection.currentBid,
          dailyBudget: projection.dailyBudget,
          spend: projection.metrics.spend,
          revenue: projection.metrics.revenue,
          impressions: projection.metrics.impressions,
          clicks: projection.metrics.clicks,
          conversions: projection.metrics.conversions,
          orders: projection.metrics.orders,
          adSpend: projection.metrics.spend,
          adRevenue: projection.metrics.revenue,
          rawSnapshotId: projection.rawSnapshotId,
          metaJson: {
            [CAMPAIGN_TARGET_META]: projection.metaData,
          } as PrismaNamespace.InputJsonValue,
          sampleCount: projection.sampleCount,
          firstObservedAt: projection.firstObservedAt,
          lastObservedAt: projection.lastObservedAt,
          createdAt: projection.firstObservedAt,
          updatedAt: projection.lastObservedAt,
        },
        select: { id: true },
      });
      destinationTargetIdByKey.set(projection.key, created.id);
      affectedRows += 1;
    }

    for (const projection of plan.accounts) {
      await tx.channelAccountDailyKpiSnapshot.create({
        data: {
          organizationId: projection.organizationId,
          channelAccountId: projection.channelAccountId,
          channel: projection.channel,
          source: projection.source,
          kpiType: projection.kpiType,
          businessDate: projection.businessDate,
          periodStart: projection.periodStart,
          periodEnd: projection.periodEnd,
          normalizedJson:
            projection.normalizedJson as PrismaNamespace.InputJsonValue,
          rawJson: projection.rawJson as PrismaNamespace.InputJsonValue,
          sampleCount: projection.sampleCount,
          firstObservedAt: projection.firstObservedAt,
          lastObservedAt: projection.lastObservedAt,
          createdAt: projection.firstObservedAt,
          updatedAt: projection.lastObservedAt,
        },
      });
      affectedRows += 1;
    }

    let reparentedActionCount = 0;
    for (const row of taintedTargetRows) {
      const projectionKeyForSnapshot =
        plan.targetProjectionKeyBySnapshotId.get(row.rawSnapshotId as string);
      const destinationId = projectionKeyForSnapshot
        ? destinationTargetIdByKey.get(projectionKeyForSnapshot)
        : null;
      if (!destinationId) {
        throw new Error(`Missing destination target for ${row.id}`);
      }
      const reparented = await tx.adAction.updateMany({
        where: {
          organizationId: row.organizationId,
          adTargetDailyId: row.id,
        },
        data: { adTargetDailyId: destinationId },
      });
      reparentedActionCount += reparented.count;
      affectedRows += reparented.count;
      const deleted = await tx.channelAdTargetDailySnapshot.deleteMany({
        where: { id: row.id, organizationId: row.organizationId },
      });
      affectedRows += deleted.count;
    }

    let deletedWrongListingCount = 0;
    let clearedMixedListingCount = 0;
    for (const row of taintedListingRows) {
      if (hasNonCampaignListingSignal(row)) {
        const updated = await tx.channelListingDailySnapshot.updateMany({
          where: { id: row.id, organizationId: row.organizationId },
          data: {
            adSpend: 0,
            adRevenue: 0,
            adImpressions: 0,
            adClicks: 0,
            adConversions: 0,
            adOrders: 0,
            rawSnapshotId: null,
            metaJson: jsonValueOrDbNull(
              removeMetaKey(row.metaJson, CAMPAIGN_LISTING_META),
            ),
          },
        });
        clearedMixedListingCount += updated.count;
        affectedRows += updated.count;
      } else {
        const deleted = await tx.channelListingDailySnapshot.deleteMany({
          where: { id: row.id, organizationId: row.organizationId },
        });
        deletedWrongListingCount += deleted.count;
        affectedRows += deleted.count;
      }
    }

    for (const row of taintedAccountRows) {
      const deleted = await tx.channelAccountDailyKpiSnapshot.deleteMany({
        where: { id: row.id, organizationId: row.organizationId },
      });
      affectedRows += deleted.count;
    }

    let correctedSnapshotCount = 0;
    for (const run of repairRuns) {
      const updatedSnapshots = await tx.channelScrapeSnapshot.updateMany({
        where: {
          scrapeRunId: run.id,
          organizationId: run.organizationId,
          businessDate: run.businessDate,
        },
        data: { businessDate: run.periodStart },
      });
      if (updatedSnapshots.count !== run.snapshots.length) {
        throw new Error(`Snapshot repair count changed for run ${run.id}`);
      }
      correctedSnapshotCount += updatedSnapshots.count;
      affectedRows += updatedSnapshots.count;
      const updatedRun = await tx.channelScrapeRun.updateMany({
        where: {
          id: run.id,
          organizationId: run.organizationId,
          businessDate: run.businessDate,
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
          status: "complete",
        },
        data: { businessDate: run.periodStart },
      });
      if (updatedRun.count !== 1) {
        throw new Error(`Run repair count changed for ${run.id}`);
      }
      affectedRows += 1;
    }

    const repairedDates = repairRuns.map((run) => dateKey(run.periodStart));
    return {
      affectedRows,
      details: {
        candidateRunCount: repairRuns.length,
        correctedSnapshotCount,
        repairedBusinessDateFrom: repairedDates.sort()[0] ?? null,
        repairedBusinessDateTo: repairedDates.sort().at(-1) ?? null,
        replayedListingFactCount: plan.listings.length,
        mergedDestinationListingCount,
        replayedTargetFactCount: plan.targets.length,
        replayedAccountKpiCount: plan.accounts.length,
        deletedWrongListingCount,
        clearedMixedListingCount,
        deletedWrongTargetCount: taintedTargetRows.length,
        deletedWrongAccountKpiCount: taintedAccountRows.length,
        reparentedActionCount,
      },
    };
  },
};

import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart, kstMonthStart } from '../../../../common/kst';
import { buildPerListingMetrics } from '../../../../common/per-listing-profit';
import type { AdConfigService } from '../../../application/service/ad-config.service';
import type {
  AdAggregateRow,
  AdsConfig,
  HydratedListing,
  InventoryRow,
} from '../../../domain/model/strategy-types';
import {
  buildGradeMap,
  toAdAggregateRows,
  uniqueIds,
} from '../../../domain/strategy-context';
import type { ChannelStateSignal } from '@kiditem/shared/advertising';

export type StrategyContext = {
  adGroups: AdAggregateRow[];
  adIssuesAdGroups: AdAggregateRow[];
  listings: HydratedListing[];
  profitRateByListing: Map<string, number>;
  channelStateByListing: Map<string, ChannelStateSignal>;
  gradeMap: Map<string, 'A' | 'B' | 'C' | null>;
  config: AdsConfig;
};

/**
 * Hydrate every input the strategy sub-services need from `ChannelListingDailySnapshot`
 * and friends.
 *
 * - Lifetime ad aggregate (rule evaluation) and 14-day aggregate (issues
 *   categorization) come from the same daily-fact table — provider ratios
 *   in `metaJson` are NOT consulted; ratios recompute downstream from sums.
 * - Hydrate listings first so we can hand the channel-state loader the exact
 *   primary-option list (avoids attaching the wrong option's daily snapshot).
 * - Live profit metrics + channel state run in parallel after hydrate.
 *
 * Tenant scope: every read binds `companyId`. Cross-tenant rows cannot
 * reach the orchestrator.
 */
export async function loadStrategyContext(
  prisma: PrismaService,
  adConfigService: AdConfigService,
  companyId: string,
  year: number,
  month: number,
): Promise<StrategyContext> {
  const since14d = kstInclusiveDaysStart(14);

  const [adAggAll, adAgg14d, config] = await Promise.all([
    prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      where: { companyId },
      _sum: {
        adSpend: true,
        adRevenue: true,
        adClicks: true,
        adImpressions: true,
        adConversions: true,
      },
    }),
    prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      where: { companyId, businessDate: { gte: since14d } },
      _sum: {
        adSpend: true,
        adRevenue: true,
        adClicks: true,
        adImpressions: true,
        adConversions: true,
      },
    }),
    adConfigService.getConfig(companyId),
  ]);

  const listingIds = uniqueIds([
    ...adAggAll.map((a) => a.listingId),
    ...adAgg14d.map((a) => a.listingId),
  ]);
  const listingIdSet = new Set(listingIds);
  const monthWindow = {
    from: kstMonthStart(year, month),
    to: kstMonthStart(year, month + 1),
  };

  const listings = await hydrateListings(prisma, companyId, listingIds);
  const [liveMetrics, channelStateByListing] = await Promise.all([
    listingIds.length === 0
      ? Promise.resolve([])
      : buildPerListingMetrics(prisma, companyId, monthWindow.from, monthWindow.to).then(
          (rows) => rows.filter((row) => listingIdSet.has(row.listingId)),
        ),
    loadChannelStateByListing(prisma, companyId, listings),
  ]);

  const profitRateByListing = new Map<string, number>(
    liveMetrics.map((metric) => [metric.listingId, metric.profitRate]),
  );

  return {
    adGroups: toAdAggregateRows(adAggAll),
    adIssuesAdGroups: toAdAggregateRows(adAgg14d),
    listings,
    profitRateByListing,
    channelStateByListing,
    gradeMap: buildGradeMap(listings),
    config: config satisfies AdsConfig,
  };
}

/**
 * Read the latest `ChannelListingDailySnapshot` per listing and the latest
 * `ChannelListingOptionDailySnapshot` for each listing's deterministic
 * hydrated primary option, hydrated into a `ChannelStateSignal` map keyed
 * by listingId. The map omits listings without any daily snapshot, so the
 * rule engine sees a real `null` (not stale state) and skips evidence
 * enrichment.
 *
 * Cross-domain note: `ChannelListing*DailySnapshot` are channels-namespace
 * Prisma models, but advertising owns the dual-write helper today (see
 * `apps/server/src/advertising/CLAUDE.md` "Cross-domain coupling
 * exception"). Reading them here via `PrismaService` keeps that boundary
 * intact — no `ChannelSyncService` inject.
 */
export async function loadChannelStateByListing(
  prisma: PrismaService,
  companyId: string,
  listings: HydratedListing[],
): Promise<Map<string, ChannelStateSignal>> {
  const map = new Map<string, ChannelStateSignal>();
  if (listings.length === 0) return map;

  const listingIds = listings.map((l) => l.id);
  const primaryListingOptionByListing = new Map<string, string>();
  for (const l of listings) {
    if (l.primaryOption) {
      primaryListingOptionByListing.set(l.id, l.primaryOption.listingOptionId);
    }
  }
  const primaryListingOptionIds = Array.from(
    primaryListingOptionByListing.values(),
  );

  type ListingDailyRow = {
    listingId: string;
    channel: string;
    externalId: string;
    businessDate: Date;
    lastObservedAt: Date;
    sampleCount: number;
    productName: string | null;
    status: string | null;
    exposureStatus: string | null;
    saleStatus: string | null;
    channelPrice: number | null;
    isOfferWinner: boolean | null;
    myPrice: number | null;
    winnerPrice: number | null;
    winnerGapPrice: number | null;
    productRank: number | null;
    categoryRank: number | null;
  };
  type OptionDailyRow = {
    listingId: string;
    listingOptionId: string;
    externalOptionId: string;
    businessDate: Date;
    optionName: string | null;
    saleStatus: string | null;
    isActive: boolean | null;
    salePrice: number | null;
    stockQty: number | null;
    isOfferWinner: boolean | null;
    myPrice: number | null;
    winnerPrice: number | null;
    winnerGapPrice: number | null;
  };

  // `DISTINCT ON` returns exactly one row per (listing_id) /
  // (listing_option_id) — the row with the newest `business_date` thanks to
  // the matching ORDER BY. This bounds the query to N rows for N listings
  // regardless of how much daily history has accumulated, and lets the
  // database do the dedup work instead of streaming everything to JS.
  const [listingDailies, optionDailies] = await Promise.all([
    prisma.$queryRaw<ListingDailyRow[]>(Prisma.sql`
      SELECT DISTINCT ON (listing_id)
        listing_id          AS "listingId",
        channel,
        external_id         AS "externalId",
        business_date       AS "businessDate",
        last_observed_at    AS "lastObservedAt",
        sample_count        AS "sampleCount",
        product_name        AS "productName",
        status,
        exposure_status     AS "exposureStatus",
        sale_status         AS "saleStatus",
        channel_price       AS "channelPrice",
        is_offer_winner     AS "isOfferWinner",
        my_price            AS "myPrice",
        winner_price        AS "winnerPrice",
        winner_gap_price    AS "winnerGapPrice",
        product_rank        AS "productRank",
        category_rank       AS "categoryRank"
      FROM channel_listing_daily_snapshots
      WHERE company_id = ${companyId}::uuid
        AND listing_id = ANY(${listingIds}::uuid[])
      ORDER BY
        listing_id,
        business_date DESC,
        last_observed_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        id DESC
    `),
    primaryListingOptionIds.length === 0
      ? Promise.resolve([] as OptionDailyRow[])
      : prisma.$queryRaw<OptionDailyRow[]>(Prisma.sql`
          SELECT DISTINCT ON (listing_option_id)
            listing_id           AS "listingId",
            listing_option_id    AS "listingOptionId",
            external_option_id   AS "externalOptionId",
            business_date        AS "businessDate",
            option_name          AS "optionName",
            sale_status          AS "saleStatus",
            is_active            AS "isActive",
            sale_price           AS "salePrice",
            stock_qty            AS "stockQty",
            is_offer_winner      AS "isOfferWinner",
            my_price             AS "myPrice",
            winner_price         AS "winnerPrice",
            winner_gap_price     AS "winnerGapPrice"
          FROM channel_listing_option_daily_snapshots
          WHERE company_id = ${companyId}::uuid
            AND listing_option_id = ANY(${primaryListingOptionIds}::uuid[])
          ORDER BY
            listing_option_id,
            business_date DESC,
            last_observed_at DESC NULLS LAST,
            updated_at DESC NULLS LAST,
            id DESC
        `),
  ]);

  const optionByListing = new Map<string, OptionDailyRow>();
  for (const row of optionDailies) {
    if (!optionByListing.has(row.listingId)) {
      optionByListing.set(row.listingId, row);
    }
  }

  for (const ld of listingDailies) {
    const od = optionByListing.get(ld.listingId);
    const signal: ChannelStateSignal = {
      channel: ld.channel,
      externalId: ld.externalId,
      businessDate: ld.businessDate.toISOString().slice(0, 10),
      lastObservedAt: ld.lastObservedAt.toISOString(),
      sampleCount: ld.sampleCount,
      productName: ld.productName,
      status: ld.status,
      exposureStatus: ld.exposureStatus,
      saleStatus: ld.saleStatus,
      channelPrice: ld.channelPrice,
      isOfferWinner: ld.isOfferWinner,
      myPrice: ld.myPrice,
      winnerPrice: ld.winnerPrice,
      winnerGapPrice: ld.winnerGapPrice,
      productRank: ld.productRank,
      categoryRank: ld.categoryRank,
      primaryOption: od
        ? {
            listingOptionId: od.listingOptionId,
            externalOptionId: od.externalOptionId,
            optionName: od.optionName,
            saleStatus: od.saleStatus,
            isActive: od.isActive,
            salePrice: od.salePrice,
            stockQty: od.stockQty,
            isOfferWinner: od.isOfferWinner,
            myPrice: od.myPrice,
            winnerPrice: od.winnerPrice,
            winnerGapPrice: od.winnerGapPrice,
          }
        : null,
    };
    map.set(ld.listingId, signal);
  }

  return map;
}

/**
 * For each listing, return the minimum `Inventory.leadTimeDays` across its
 * active options. Listings without active inventory rows map to `null`.
 * `getExposureAnalysis` uses this for the fulfillment factor score.
 */
export async function loadLeadTimeByListing(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (listingIds.length === 0) return map;
  const rows = await prisma.channelListingOption.findMany({
    where: { companyId, listingId: { in: listingIds }, isActive: true },
    select: {
      listingId: true,
      optionId: true,
    },
  });
  const optionIds = Array.from(
    new Set(rows.map((row) => row.optionId).filter((id): id is string => id != null)),
  );
  const inventories = optionIds.length > 0
    ? await prisma.inventory.findMany({
        where: { optionId: { in: optionIds }, companyId },
        select: { optionId: true, leadTimeDays: true },
      })
    : [];
  const inventoryMap = new Map(inventories.map((inventory) => [inventory.optionId, inventory]));
  for (const r of rows) {
    const lt = r.optionId ? inventoryMap.get(r.optionId)?.leadTimeDays ?? null : null;
    const cur = map.get(r.listingId) ?? null;
    if (lt != null && (cur == null || lt < cur)) map.set(r.listingId, lt);
    else if (!map.has(r.listingId)) map.set(r.listingId, cur);
  }
  return map;
}

/**
 * listingIds → HydratedListing[] (master + ABC/tier/health meta + primary
 * option pricing). companyId scope is enforced (ADR-0006). primaryOption is
 * the deterministic first active option (createdAt asc, externalOptionId asc,
 * id asc); ad-grade-rules uses it for margin / adBudgetLimit evaluation.
 */
export async function hydrateListings(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<HydratedListing[]> {
  if (listingIds.length === 0) return [];
  const rows = await prisma.channelListing.findMany({
    where: { id: { in: listingIds }, companyId, isDeleted: false },
    select: {
      id: true,
      externalId: true,
      channelName: true,
      masterId: true,
      options: {
        where: { isActive: true },
        orderBy: [
          { createdAt: 'asc' },
          { externalOptionId: 'asc' },
          { id: 'asc' },
        ],
        select: {
          id: true,
          optionId: true,
        },
      },
    },
  });
  const masterIds = Array.from(new Set(rows.map((r) => r.masterId)));
  const optionIds = Array.from(
    new Set(
      rows
        .flatMap((r) => r.options.map((option) => option.optionId))
        .filter((id): id is string => id != null),
    ),
  );
  const [masters, productOptions] = await Promise.all([
    masterIds.length > 0
      ? prisma.masterProduct.findMany({
          where: { id: { in: masterIds }, companyId },
          select: { id: true, code: true, name: true, abcGrade: true, adTier: true, healthScore: true },
        })
      : Promise.resolve([]),
    optionIds.length > 0
      ? prisma.productOption.findMany({
          where: { id: { in: optionIds }, companyId },
          select: {
            id: true,
            availableStock: true,
            costPrice: true,
            sellPrice: true,
            commissionRate: true,
            shippingCost: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const masterMap = new Map(masters.map((master) => [master.id, master]));
  const optionMap = new Map(productOptions.map((option) => [option.id, option]));
  return rows
    .map((r): HydratedListing | null => {
      const master = masterMap.get(r.masterId);
      if (!master) return null;
      const firstClo =
        r.options.find((clo) => clo.optionId != null && optionMap.has(clo.optionId)) ?? null;
      const firstOption = firstClo?.optionId ? optionMap.get(firstClo.optionId) ?? null : null;
      return {
        id: r.id,
        externalId: r.externalId,
        channelName: r.channelName,
        masterProduct: {
          id: master.id,
          code: master.code,
          name: master.name,
          abcGrade: master.abcGrade as 'A' | 'B' | 'C' | null,
          adTier: master.adTier,
          healthScore: master.healthScore,
        },
        primaryOption: firstClo && firstOption
          ? {
              id: firstOption.id,
              listingOptionId: firstClo.id,
              availableStock: firstOption.availableStock,
              costPrice: firstOption.costPrice,
              sellPrice: firstOption.sellPrice,
              commissionRate: firstOption.commissionRate,
              shippingCost: firstOption.shippingCost,
            }
          : null,
      };
    })
    .filter((listing): listing is HydratedListing => listing !== null);
}

/**
 * listingIds → optionId 별 InventoryRow Map. Sub-services (ad-grade-rules)
 * use it to look up stock/cost by snapshot.optionId. Tenant scope enforced;
 * only active options with non-null `optionId` are returned.
 */
export async function getInventorySnapshot(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<Map<string, InventoryRow>> {
  if (listingIds.length === 0) return new Map();
  const options = await prisma.channelListingOption.findMany({
    where: { companyId, listingId: { in: listingIds }, isActive: true, optionId: { not: null } },
    select: {
      optionId: true,
      listingId: true,
    },
  });
  const optionIds = Array.from(
    new Set(options.map((option) => option.optionId).filter((id): id is string => id != null)),
  );
  const productOptions = optionIds.length > 0
    ? await prisma.productOption.findMany({
        where: { id: { in: optionIds }, companyId },
        select: { id: true, availableStock: true, costPrice: true, sellPrice: true, commissionRate: true },
      })
    : [];
  const optionMap = new Map(productOptions.map((option) => [option.id, option]));
  const map = new Map<string, InventoryRow>();
  for (const o of options) {
    const option = o.optionId ? optionMap.get(o.optionId) : null;
    if (!o.optionId || !option) continue;
    map.set(o.optionId, {
      optionId: o.optionId,
      listingId: o.listingId,
      availableStock: option.availableStock ?? 0,
      costPrice: option.costPrice,
      sellPrice: option.sellPrice,
      commissionRate: option.commissionRate,
    });
  }
  return map;
}

// apps/server/src/advertising/services/channel-scrape-persistence.service.ts
//
// Wave C2 — advertising-local helper that writes raw extension scrape data
// into the channel-generic `ChannelScrapeRun` / `ChannelScrapeSnapshot` tables
// added by Wave C0. Lives inside the advertising domain on purpose:
// per `apps/server/AGENTS.md`, services from one business domain must not
// inject services from another. We therefore reach into the channels-namespace
// Prisma models directly through `PrismaService` rather than calling
// `ChannelSyncService`.
//
// Wave C3 — adds idempotent daily upsert for listing/option state
// (`ChannelListingDailySnapshot` / `ChannelListingOptionDailySnapshot`).
// Same `(companyId, listingId, businessDate)` (or `listingOptionId`) is
// upserted: `sampleCount` increments, `lastObservedAt` updates, observable
// fields overwrite when explicitly non-null. Raw snapshots stay append-only.
//
// Hard rewrite Phase H2 — additionally upserts
// `ChannelAdTargetDailySnapshot` (campaign/keyword/product/ad_product grain)
// and `ChannelAccountDailyKpiSnapshot` (account/store-level KPI). Listing
// daily upsert is extended to accept ad and traffic metric blocks.
//
// Daily-fact metric semantics (single source-of-truth rule):
//   The provider sends a *daily total* per (listing, businessDate) or
//   (target, businessDate) row. The persistence helpers therefore use
//   **overwrite-on-replay** semantics for additive metric numerator columns
//   (adSpend, adRevenue, adImpressions, ..., trafficVisitors, ...). Two
//   identical replays produce the same final value — they do NOT use
//   `{ increment }`. Only `sampleCount` increments per observation event.
//   `firstObservedAt` is preserved; `lastObservedAt` advances every call.
//   Provider ratios (ROAS / CTR / CVR) are NOT trusted: callers store them
//   inside `metaJson` only. Reads recompute ratios from the additive
//   numerator/denominator columns.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ScrapeMatchStatus = 'matched' | 'matched_listing_only' | 'unmatched';

export interface ScrapeRunInput {
  companyId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  targetUrl?: string | null;
  period?: string | null;
  parserVersion?: string | null;
  metaJson?: Prisma.InputJsonValue | null;
}

export interface ScrapeSnapshotInput {
  scrapeRunId: string;
  companyId: string;
  channel: string;
  source: string;
  pageType: string;
  businessDate?: Date | null;
  externalId?: string | null;
  externalOptionId?: string | null;
  listingId?: string | null;
  listingOptionId?: string | null;
  optionId?: string | null;
  matchStatus: ScrapeMatchStatus;
  matchReason?: string | null;
  rowHash?: string | null;
  rawJson: Prisma.InputJsonValue;
  normalizedJson?: Prisma.InputJsonValue | null;
}

export interface ScrapeRunFinalize {
  scrapeRunId: string;
  companyId: string;
  status: 'complete' | 'error' | 'partial';
  rowCount?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  errorCount?: number;
  errorJson?: Prisma.InputJsonValue | null;
}

/**
 * Wave C3 — observable listing-level state derived from a single raw row.
 * Caller passes only the fields that this scrape actually observed; `null`
 * and `undefined` mean "not observed" and won't overwrite an existing value
 * on a repeated upsert. Non-null values overwrite.
 */
export interface ListingDailyState {
  productName?: string | null;
  status?: string | null;
  exposureStatus?: string | null;
  saleStatus?: string | null;
  channelPrice?: number | null;
  reviewCount?: number | null;
  avgRating?: number | null;
  isOfferWinner?: boolean | null;
  myPrice?: number | null;
  winnerPrice?: number | null;
  winnerGapPrice?: number | null;
  productRank?: number | null;
  categoryRank?: number | null;
}

/**
 * H2 — additive metric block for listing-day. The provider sends a daily
 * total per `(listing, businessDate)`; helpers overwrite the column to that
 * total on replay (no `{ increment }`).
 */
export interface ListingDailyAdMetrics {
  adSpend?: number | null;
  adRevenue?: number | null;
  adImpressions?: number | null;
  adClicks?: number | null;
  adConversions?: number | null;
  adOrders?: number | null;
  adDirectOrders1d?: number | null;
  adIndirectOrders1d?: number | null;
  adDirectQty1d?: number | null;
  adIndirectQty1d?: number | null;
  adDirectRevenue1d?: number | null;
  adIndirectRevenue1d?: number | null;
  adTotalOrders14d?: number | null;
  adDirectOrders14d?: number | null;
  adIndirectOrders14d?: number | null;
  adTotalQty14d?: number | null;
  adDirectQty14d?: number | null;
  adIndirectQty14d?: number | null;
  adTotalRevenue14d?: number | null;
  adDirectRevenue14d?: number | null;
  adIndirectRevenue14d?: number | null;
}

export interface ListingDailyTrafficMetrics {
  trafficVisitors?: number | null;
  trafficViews?: number | null;
  trafficCartAdds?: number | null;
  trafficOrders?: number | null;
  trafficSalesQty?: number | null;
  trafficRevenue?: number | null;
}

export interface ListingDailyMetrics {
  ad?: ListingDailyAdMetrics;
  traffic?: ListingDailyTrafficMetrics;
}

export interface ListingDailyUpsertInput extends ListingDailyState {
  companyId: string;
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  observedAt?: Date;
  rawSnapshotId?: string | null;
  metaJson?: Prisma.InputJsonValue | null;
  metrics?: ListingDailyMetrics;
}

export interface ListingOptionDailyState {
  optionName?: string | null;
  salePrice?: number | null;
  stockQty?: number | null;
  saleStatus?: string | null;
  isActive?: boolean | null;
  isOfferWinner?: boolean | null;
  myPrice?: number | null;
  winnerPrice?: number | null;
  winnerGapPrice?: number | null;
}

export interface ListingOptionDailyUpsertInput extends ListingOptionDailyState {
  companyId: string;
  listingId: string;
  listingOptionId: string;
  optionId?: string | null;
  channel: string;
  externalId: string;
  externalOptionId: string;
  businessDate: Date;
  observedAt?: Date;
  rawSnapshotId?: string | null;
  metaJson?: Prisma.InputJsonValue | null;
}

/** H2 — see `ChannelAdTargetDailySnapshot`. */
export type AdTargetType = 'campaign' | 'keyword' | 'product' | 'ad_product';

export interface AdTargetDailyMetrics {
  spend?: number | null;
  revenue?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  orders?: number | null;
  adSpend?: number | null;
  adRevenue?: number | null;
}

export interface UpsertAdTargetDailyInput extends AdTargetDailyMetrics {
  companyId: string;
  channel: string;
  businessDate: Date;
  targetType: AdTargetType;
  targetKey: string;

  listingId?: string | null;
  listingOptionId?: string | null;
  optionId?: string | null;
  externalId?: string | null;
  externalOptionId?: string | null;

  campaignId?: string | null;
  campaignName?: string | null;
  adGroup?: string | null;
  keyword?: string | null;
  placement?: string | null;
  status?: string | null;
  onOff?: string | null;
  currentBid?: number | null;
  dailyBudget?: number | null;

  observedAt?: Date;
  rawSnapshotId?: string | null;
  metaJson?: Prisma.InputJsonValue | null;
}

export interface UpsertAccountKpiInput {
  companyId: string;
  channel: string;
  source: string;
  kpiType: string;
  businessDate: Date;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  normalizedJson: Prisma.InputJsonValue;
  rawJson?: Prisma.InputJsonValue | null;
  rawSnapshotId?: string | null;
  observedAt?: Date;
}

const LISTING_STATE_KEYS: ReadonlyArray<keyof ListingDailyState> = [
  'productName',
  'status',
  'exposureStatus',
  'saleStatus',
  'channelPrice',
  'reviewCount',
  'avgRating',
  'isOfferWinner',
  'myPrice',
  'winnerPrice',
  'winnerGapPrice',
  'productRank',
  'categoryRank',
];

const OPTION_STATE_KEYS: ReadonlyArray<keyof ListingOptionDailyState> = [
  'optionName',
  'salePrice',
  'stockQty',
  'saleStatus',
  'isActive',
  'isOfferWinner',
  'myPrice',
  'winnerPrice',
  'winnerGapPrice',
];

const LISTING_AD_METRIC_KEYS: ReadonlyArray<keyof ListingDailyAdMetrics> = [
  'adSpend',
  'adRevenue',
  'adImpressions',
  'adClicks',
  'adConversions',
  'adOrders',
  'adDirectOrders1d',
  'adIndirectOrders1d',
  'adDirectQty1d',
  'adIndirectQty1d',
  'adDirectRevenue1d',
  'adIndirectRevenue1d',
  'adTotalOrders14d',
  'adDirectOrders14d',
  'adIndirectOrders14d',
  'adTotalQty14d',
  'adDirectQty14d',
  'adIndirectQty14d',
  'adTotalRevenue14d',
  'adDirectRevenue14d',
  'adIndirectRevenue14d',
];

const LISTING_TRAFFIC_METRIC_KEYS: ReadonlyArray<keyof ListingDailyTrafficMetrics> =
  [
    'trafficVisitors',
    'trafficViews',
    'trafficCartAdds',
    'trafficOrders',
    'trafficSalesQty',
    'trafficRevenue',
  ];

const AD_TARGET_METRIC_KEYS: ReadonlyArray<keyof AdTargetDailyMetrics> = [
  'spend',
  'revenue',
  'impressions',
  'clicks',
  'conversions',
  'orders',
  'adSpend',
  'adRevenue',
];

const AD_TARGET_DESCRIPTOR_KEYS: ReadonlyArray<
  keyof Pick<
    UpsertAdTargetDailyInput,
    | 'campaignId'
    | 'campaignName'
    | 'adGroup'
    | 'keyword'
    | 'placement'
    | 'status'
    | 'onOff'
    | 'currentBid'
    | 'dailyBudget'
    | 'listingId'
    | 'listingOptionId'
    | 'optionId'
    | 'externalId'
    | 'externalOptionId'
  >
> = [
  'campaignId',
  'campaignName',
  'adGroup',
  'keyword',
  'placement',
  'status',
  'onOff',
  'currentBid',
  'dailyBudget',
  'listingId',
  'listingOptionId',
  'optionId',
  'externalId',
  'externalOptionId',
];

function pickObservedFields<T extends object, K extends keyof T>(
  source: T,
  keys: ReadonlyArray<K>,
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * H2 — convert an `ad`/`traffic` metric block into the shape consumed by
 * the listing-daily upsert. Missing keys → `0` on create (matches the
 * `Int @default(0)` columns), undefined on update (don't touch the column).
 */
function spreadMetricsForCreate<K extends string>(
  block: Partial<Record<K, number | null | undefined>> | undefined,
  keys: ReadonlyArray<K>,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const v = block?.[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return out;
}

function spreadMetricsForUpdate<K extends string>(
  block: Partial<Record<K, number | null | undefined>> | undefined,
  keys: ReadonlyArray<K>,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (!block) return out;
  for (const k of keys) {
    const v = block[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

@Injectable()
export class ChannelScrapePersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: ScrapeRunInput): Promise<{ id: string }> {
    return this.prisma.channelScrapeRun.create({
      data: {
        companyId: input.companyId,
        channel: input.channel,
        source: input.source,
        pageType: input.pageType,
        businessDate: input.businessDate ?? null,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        targetUrl: input.targetUrl ?? null,
        period: input.period ?? null,
        parserVersion: input.parserVersion ?? null,
        status: 'running',
        metaJson:
          input.metaJson === undefined || input.metaJson === null
            ? Prisma.DbNull
            : input.metaJson,
      },
      select: { id: true },
    });
  }

  async appendSnapshot(input: ScrapeSnapshotInput): Promise<{ id: string }> {
    return this.prisma.channelScrapeSnapshot.create({
      data: {
        scrapeRunId: input.scrapeRunId,
        companyId: input.companyId,
        channel: input.channel,
        source: input.source,
        pageType: input.pageType,
        businessDate: input.businessDate ?? null,
        externalId: input.externalId ?? null,
        externalOptionId: input.externalOptionId ?? null,
        listingId: input.listingId ?? null,
        listingOptionId: input.listingOptionId ?? null,
        optionId: input.optionId ?? null,
        matchStatus: input.matchStatus,
        matchReason: input.matchReason ?? null,
        rowHash: input.rowHash ?? null,
        rawJson: input.rawJson,
        normalizedJson:
          input.normalizedJson === undefined || input.normalizedJson === null
            ? Prisma.DbNull
            : input.normalizedJson,
      },
      select: { id: true },
    });
  }

  async finalizeRun(input: ScrapeRunFinalize): Promise<void> {
    const result = await this.prisma.channelScrapeRun.updateMany({
      where: { id: input.scrapeRunId, companyId: input.companyId },
      data: {
        status: input.status,
        rowCount: input.rowCount ?? 0,
        matchedCount: input.matchedCount ?? 0,
        unmatchedCount: input.unmatchedCount ?? 0,
        errorCount: input.errorCount ?? 0,
        finishedAt: new Date(),
        errorJson:
          input.errorJson === undefined || input.errorJson === null
            ? Prisma.DbNull
            : input.errorJson,
      },
    });
    if (result.count !== 1) {
      throw new Error(
        `ChannelScrapeRun not found for company scope: ${input.scrapeRunId}`,
      );
    }
  }

  /**
   * Wave C3 — upsert listing-level daily state.
   *
   * Idempotent on `(companyId, listingId, businessDate)`. Repeated calls
   * increment `sampleCount`, refresh `lastObservedAt` and `rawSnapshotId`,
   * and overwrite observable fields when the new value is non-null.
   * `firstObservedAt` is preserved across updates.
   *
   * H2 — also accepts an optional `metrics.ad` / `metrics.traffic` block.
   * Metric values use **overwrite-on-replay** semantics: provider sends a
   * daily total per (listing, businessDate) and repeated calls overwrite
   * the column to that same total. They do NOT use `{ increment }`.
   * Missing metric keys mean "not observed in this scrape" and leave any
   * previously written column untouched on update.
   */
  async upsertListingDaily(
    input: ListingDailyUpsertInput,
  ): Promise<{ id: string }> {
    const observedAt = input.observedAt ?? new Date();
    const observedState = pickObservedFields(input, LISTING_STATE_KEYS);
    const metaJsonForCreate =
      input.metaJson === undefined || input.metaJson === null
        ? Prisma.DbNull
        : input.metaJson;
    const adMetricsCreate = spreadMetricsForCreate(
      input.metrics?.ad,
      LISTING_AD_METRIC_KEYS,
    );
    const trafficMetricsCreate = spreadMetricsForCreate(
      input.metrics?.traffic,
      LISTING_TRAFFIC_METRIC_KEYS,
    );
    const adMetricsUpdate = spreadMetricsForUpdate(
      input.metrics?.ad,
      LISTING_AD_METRIC_KEYS,
    );
    const trafficMetricsUpdate = spreadMetricsForUpdate(
      input.metrics?.traffic,
      LISTING_TRAFFIC_METRIC_KEYS,
    );

    return this.prisma.channelListingDailySnapshot.upsert({
      where: {
        companyId_listingId_businessDate: {
          companyId: input.companyId,
          listingId: input.listingId,
          businessDate: input.businessDate,
        },
      },
      create: {
        companyId: input.companyId,
        listingId: input.listingId,
        channel: input.channel,
        externalId: input.externalId,
        businessDate: input.businessDate,
        sampleCount: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
        rawSnapshotId: input.rawSnapshotId ?? null,
        metaJson: metaJsonForCreate,
        productName: input.productName ?? null,
        status: input.status ?? null,
        exposureStatus: input.exposureStatus ?? null,
        saleStatus: input.saleStatus ?? null,
        channelPrice: input.channelPrice ?? null,
        reviewCount: input.reviewCount ?? null,
        avgRating: input.avgRating ?? null,
        isOfferWinner: input.isOfferWinner ?? null,
        myPrice: input.myPrice ?? null,
        winnerPrice: input.winnerPrice ?? null,
        winnerGapPrice: input.winnerGapPrice ?? null,
        productRank: input.productRank ?? null,
        categoryRank: input.categoryRank ?? null,
        ...adMetricsCreate,
        ...trafficMetricsCreate,
      },
      update: {
        sampleCount: { increment: 1 },
        lastObservedAt: observedAt,
        ...(input.rawSnapshotId !== undefined
          ? { rawSnapshotId: input.rawSnapshotId }
          : {}),
        ...(input.metaJson !== undefined
          ? {
              metaJson:
                input.metaJson === null ? Prisma.DbNull : input.metaJson,
            }
          : {}),
        ...observedState,
        ...adMetricsUpdate,
        ...trafficMetricsUpdate,
      },
      select: { id: true },
    });
  }

  /**
   * Wave C3 — upsert option-level daily state.
   * Idempotent on `(companyId, listingOptionId, businessDate)`. Same update
   * semantics as `upsertListingDaily`.
   */
  async upsertOptionDaily(
    input: ListingOptionDailyUpsertInput,
  ): Promise<{ id: string }> {
    const observedAt = input.observedAt ?? new Date();
    const observedState = pickObservedFields(input, OPTION_STATE_KEYS);
    const metaJsonForCreate =
      input.metaJson === undefined || input.metaJson === null
        ? Prisma.DbNull
        : input.metaJson;

    return this.prisma.channelListingOptionDailySnapshot.upsert({
      where: {
        companyId_listingOptionId_businessDate: {
          companyId: input.companyId,
          listingOptionId: input.listingOptionId,
          businessDate: input.businessDate,
        },
      },
      create: {
        companyId: input.companyId,
        listingId: input.listingId,
        listingOptionId: input.listingOptionId,
        optionId: input.optionId ?? null,
        channel: input.channel,
        externalId: input.externalId,
        externalOptionId: input.externalOptionId,
        businessDate: input.businessDate,
        sampleCount: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
        rawSnapshotId: input.rawSnapshotId ?? null,
        metaJson: metaJsonForCreate,
        optionName: input.optionName ?? null,
        salePrice: input.salePrice ?? null,
        stockQty: input.stockQty ?? null,
        saleStatus: input.saleStatus ?? null,
        isActive: input.isActive ?? null,
        isOfferWinner: input.isOfferWinner ?? null,
        myPrice: input.myPrice ?? null,
        winnerPrice: input.winnerPrice ?? null,
        winnerGapPrice: input.winnerGapPrice ?? null,
      },
      update: {
        sampleCount: { increment: 1 },
        lastObservedAt: observedAt,
        ...(input.rawSnapshotId !== undefined
          ? { rawSnapshotId: input.rawSnapshotId }
          : {}),
        ...(input.metaJson !== undefined
          ? {
              metaJson:
                input.metaJson === null ? Prisma.DbNull : input.metaJson,
            }
          : {}),
        ...(input.optionId !== undefined && input.optionId !== null
          ? { optionId: input.optionId }
          : {}),
        ...observedState,
      },
      select: { id: true },
    });
  }

  /**
   * H2 — upsert ad target (campaign/keyword/product/ad_product) daily fact.
   *
   * Idempotent on `(companyId, channel, businessDate, targetType, targetKey)`.
   *
   * Metric semantics (overwrite-on-replay): caller MUST pass a daily total
   * per `(target, businessDate)` row from the provider. Repeated calls
   * overwrite the column to the same total — they do not increment. Missing
   * metric keys leave any previously written column untouched on update.
   * Provider ratios are NOT trusted; if needed, attach them via `metaJson`.
   *
   * `sampleCount` increments per call; `firstObservedAt` is preserved;
   * `lastObservedAt` advances every call. `rawSnapshotId` updates to the
   * latest observed `ChannelScrapeSnapshot.id` so audit/replay reaches the
   * row.
   */
  async upsertAdTargetDaily(
    input: UpsertAdTargetDailyInput,
  ): Promise<{ id: string }> {
    if (!input.targetKey || input.targetKey.trim().length === 0) {
      throw new Error(
        'upsertAdTargetDaily: targetKey must be a non-empty deterministic string',
      );
    }
    const observedAt = input.observedAt ?? new Date();
    const metaJsonForCreate =
      input.metaJson === undefined || input.metaJson === null
        ? Prisma.DbNull
        : input.metaJson;
    const metricsCreate = spreadMetricsForCreate(input, AD_TARGET_METRIC_KEYS);
    const metricsUpdate = spreadMetricsForUpdate(input, AD_TARGET_METRIC_KEYS);
    const observedDescriptors = pickObservedFields(
      input,
      AD_TARGET_DESCRIPTOR_KEYS,
    );

    return this.prisma.channelAdTargetDailySnapshot.upsert({
      where: {
        companyId_channel_businessDate_targetType_targetKey: {
          companyId: input.companyId,
          channel: input.channel,
          businessDate: input.businessDate,
          targetType: input.targetType,
          targetKey: input.targetKey,
        },
      },
      create: {
        companyId: input.companyId,
        channel: input.channel,
        businessDate: input.businessDate,
        targetType: input.targetType,
        targetKey: input.targetKey,
        listingId: input.listingId ?? null,
        listingOptionId: input.listingOptionId ?? null,
        optionId: input.optionId ?? null,
        externalId: input.externalId ?? null,
        externalOptionId: input.externalOptionId ?? null,
        campaignId: input.campaignId ?? null,
        campaignName: input.campaignName ?? null,
        adGroup: input.adGroup ?? null,
        keyword: input.keyword ?? null,
        placement: input.placement ?? null,
        status: input.status ?? null,
        onOff: input.onOff ?? null,
        currentBid: input.currentBid ?? null,
        dailyBudget: input.dailyBudget ?? null,
        rawSnapshotId: input.rawSnapshotId ?? null,
        metaJson: metaJsonForCreate,
        sampleCount: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
        ...metricsCreate,
      },
      update: {
        sampleCount: { increment: 1 },
        lastObservedAt: observedAt,
        ...(input.rawSnapshotId !== undefined
          ? { rawSnapshotId: input.rawSnapshotId }
          : {}),
        ...(input.metaJson !== undefined
          ? {
              metaJson:
                input.metaJson === null ? Prisma.DbNull : input.metaJson,
            }
          : {}),
        ...observedDescriptors,
        ...metricsUpdate,
      },
      select: { id: true },
    });
  }

  /**
   * H2 — upsert account/store-level KPI daily fact (Wing dashboard cards
   * and similar provider KPI surfaces that cannot be attributed to one
   * listing).
   *
   * Idempotent on `(companyId, channel, source, businessDate, kpiType)`.
   * `normalizedJson` is the structured KPI payload reads consume;
   * `rawJson` carries the unmassaged provider blob for audit.
   *
   * On replay both JSON columns are overwritten with the latest scrape
   * values; `sampleCount` increments; `lastObservedAt` advances;
   * `firstObservedAt` is preserved.
   */
  async upsertAccountKpi(
    input: UpsertAccountKpiInput,
  ): Promise<{ id: string }> {
    const observedAt = input.observedAt ?? new Date();
    const rawJsonValue =
      input.rawJson === undefined || input.rawJson === null
        ? Prisma.DbNull
        : input.rawJson;

    return this.prisma.channelAccountDailyKpiSnapshot.upsert({
      where: {
        companyId_channel_source_businessDate_kpiType: {
          companyId: input.companyId,
          channel: input.channel,
          source: input.source,
          businessDate: input.businessDate,
          kpiType: input.kpiType,
        },
      },
      create: {
        companyId: input.companyId,
        channel: input.channel,
        source: input.source,
        kpiType: input.kpiType,
        businessDate: input.businessDate,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        normalizedJson: input.normalizedJson,
        rawJson: rawJsonValue,
        rawSnapshotId: input.rawSnapshotId ?? null,
        sampleCount: 1,
        firstObservedAt: observedAt,
        lastObservedAt: observedAt,
      },
      update: {
        sampleCount: { increment: 1 },
        lastObservedAt: observedAt,
        normalizedJson: input.normalizedJson,
        rawJson: rawJsonValue,
        ...(input.periodStart !== undefined
          ? { periodStart: input.periodStart }
          : {}),
        ...(input.periodEnd !== undefined
          ? { periodEnd: input.periodEnd }
          : {}),
        ...(input.rawSnapshotId !== undefined
          ? { rawSnapshotId: input.rawSnapshotId }
          : {}),
      },
      select: { id: true },
    });
  }
}

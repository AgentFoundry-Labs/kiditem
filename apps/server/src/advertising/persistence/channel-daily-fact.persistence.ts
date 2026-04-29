// Daily-fact persistence helpers for the advertising domain.
//
// Owns the four idempotent upserts on the channels-namespace daily-fact
// tables that advertising dual-writes:
//   - `ChannelListingDailySnapshot` (listing-day state + ad/traffic metrics)
//   - `ChannelListingOptionDailySnapshot` (option-day winner state)
//   - `ChannelAdTargetDailySnapshot` (campaign/keyword/product grain ad facts)
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
//
// metaJson namespacing (audit-data preservation rule):
//   Multiple payloads can land on the same `(companyId, listingId,
//   businessDate)` (or other daily-fact unique key) row — e.g. campaign
//   ingest writes provider ROAS/CTR, then traffic ingest writes provider
//   conversion rate to the same listing-day row. To preserve each caller's
//   audit data without a fetch-merge-update transaction proliferating,
//   callers nest their metaJson under a `source` key:
//     metaJson: { source: 'advertising.campaign', data: {...} }
//   On create the helper writes `{ [source]: data }`. On update the helper
//   applies an atomic Postgres jsonb merge (`meta_json = meta_json || patch`)
//   so independent source keys do not clobber each other even when sync and
//   upload jobs touch the same daily-fact row concurrently. Each logical
//   caller MUST pick a distinct `source` (e.g. `advertising.campaign`,
//   `advertising.raw`, `wing.traffic`, `wing.dashboard`).

import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/** See `ChannelAdTargetDailySnapshot`. */
type AdTargetType = 'campaign' | 'keyword' | 'product';

/**
 * Namespaced metaJson input — the helper merges this under `data.source`
 * so concurrent payloads on the same daily-fact row preserve each other's
 * audit data. See file header "metaJson namespacing".
 *
 * - `undefined` (or omitted) → leave column untouched on update; write
 *   `Prisma.DbNull` on create.
 * - explicit `null` → wipe the metaJson column entirely (rare; reserved
 *   for tests/admin tooling).
 * - `{ source, data }` → write `{ [source]: data }` on create; on update
 *   atomically merge the new source key into the existing object.
 *
 * `data` is `Record<string, unknown>` because it eventually serializes to
 * Postgres jsonb; helpers cast to `Prisma.InputJsonValue` at write time.
 */
interface NamespacedMetaJson {
  source: string;
  data: Record<string, unknown>;
}

type MetaJsonInput = NamespacedMetaJson | null | undefined;

/**
 * Observable listing-level state derived from a single raw row.
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
 * Additive metric block for listing-day. The provider sends a daily total
 * per `(listing, businessDate)`; helpers overwrite the column to that total
 * on replay (no `{ increment }`).
 */
interface ListingDailyAdMetrics {
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

interface ListingDailyMetrics {
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
  metaJson?: MetaJsonInput;
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
  metaJson?: MetaJsonInput;
}

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
  metaJson?: MetaJsonInput;
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

const LISTING_TRAFFIC_METRIC_KEYS: ReadonlyArray<
  keyof ListingDailyTrafficMetrics
> = [
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
 * Convert an `ad`/`traffic` metric block into the shape consumed by the
 * listing-daily upsert. Missing keys → `0` on create (matches the
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

function buildNamespacedMetaPatchJson(input: NamespacedMetaJson): string {
  return JSON.stringify({ [input.source]: input.data });
}

function isNamespacedMetaJson(
  input: MetaJsonInput,
): input is NamespacedMetaJson {
  return input !== undefined && input !== null;
}

/**
 * Build the `metaJson` value for the `create` path of an upsert. Always
 * namespaces under `input.source`. Returns `Prisma.DbNull` when caller
 * passed null/undefined so we never write a non-null empty object.
 */
function buildNamespacedMetaForCreate(
  input: MetaJsonInput,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (input === undefined || input === null) return Prisma.DbNull;
  return {
    [input.source]: input.data,
  } as unknown as Prisma.InputJsonValue;
}

async function mergeNamespacedMetaJson(
  tx: Prisma.TransactionClient,
  table:
    | 'channel_listing_daily_snapshots'
    | 'channel_listing_option_daily_snapshots'
    | 'channel_ad_target_daily_snapshots',
  id: string,
  companyId: string,
  metaJson: MetaJsonInput,
): Promise<void> {
  if (!isNamespacedMetaJson(metaJson)) return;
  const patchJson = buildNamespacedMetaPatchJson(metaJson);
  if (table === 'channel_listing_daily_snapshots') {
    await tx.$executeRaw(Prisma.sql`
      UPDATE channel_listing_daily_snapshots
      SET meta_json = COALESCE(meta_json, '{}'::jsonb) || ${patchJson}::jsonb
      WHERE id = ${id}::uuid
        AND company_id = ${companyId}::uuid
    `);
    return;
  }
  if (table === 'channel_listing_option_daily_snapshots') {
    await tx.$executeRaw(Prisma.sql`
      UPDATE channel_listing_option_daily_snapshots
      SET meta_json = COALESCE(meta_json, '{}'::jsonb) || ${patchJson}::jsonb
      WHERE id = ${id}::uuid
        AND company_id = ${companyId}::uuid
    `);
    return;
  }
  await tx.$executeRaw(Prisma.sql`
    UPDATE channel_ad_target_daily_snapshots
    SET meta_json = COALESCE(meta_json, '{}'::jsonb) || ${patchJson}::jsonb
    WHERE id = ${id}::uuid
      AND company_id = ${companyId}::uuid
  `);
}

/**
 * Upsert listing-level daily state.
 *
 * Idempotent on `(companyId, listingId, businessDate)`. Repeated calls
 * increment `sampleCount`, refresh `lastObservedAt` and `rawSnapshotId`,
 * and overwrite observable fields when the new value is non-null.
 * `firstObservedAt` is preserved across updates.
 *
 * Also accepts an optional `metrics.ad` / `metrics.traffic` block.
 * Metric values use **overwrite-on-replay** semantics: provider sends a
 * daily total per (listing, businessDate) and repeated calls overwrite
 * the column to that same total. They do NOT use `{ increment }`.
 * Missing metric keys mean "not observed in this scrape" and leave any
 * previously written column untouched on update.
 *
 * `metaJson` is namespaced per logical caller (see file header). Pass
 * `{ source: 'advertising.campaign', data: {...} }` and concurrent
 * payloads on the same listing-day preserve each other's audit data.
 */
export async function upsertChannelListingDaily(
  prisma: PrismaService,
  input: ListingDailyUpsertInput,
): Promise<{ id: string }> {
  const observedAt = input.observedAt ?? new Date();
  const observedState = pickObservedFields(input, LISTING_STATE_KEYS);
  const metaJsonForCreate = buildNamespacedMetaForCreate(input.metaJson);
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

  return prisma.$transaction(async (tx) => {
    const row = await tx.channelListingDailySnapshot.upsert({
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
        ...(input.metaJson === null ? { metaJson: Prisma.DbNull } : {}),
        ...observedState,
        ...adMetricsUpdate,
        ...trafficMetricsUpdate,
      },
      select: { id: true },
    });
    await mergeNamespacedMetaJson(
      tx,
      'channel_listing_daily_snapshots',
      row.id,
      input.companyId,
      input.metaJson,
    );
    return row;
  });
}

/**
 * Upsert option-level daily state.
 * Idempotent on `(companyId, listingOptionId, businessDate)`. Same update
 * semantics as `upsertChannelListingDaily`.
 */
export async function upsertChannelOptionDaily(
  prisma: PrismaService,
  input: ListingOptionDailyUpsertInput,
): Promise<{ id: string }> {
  const observedAt = input.observedAt ?? new Date();
  const observedState = pickObservedFields(input, OPTION_STATE_KEYS);
  const metaJsonForCreate = buildNamespacedMetaForCreate(input.metaJson);

  return prisma.$transaction(async (tx) => {
    const row = await tx.channelListingOptionDailySnapshot.upsert({
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
        ...(input.metaJson === null ? { metaJson: Prisma.DbNull } : {}),
        ...(input.optionId !== undefined && input.optionId !== null
          ? { optionId: input.optionId }
          : {}),
        ...observedState,
      },
      select: { id: true },
    });
    await mergeNamespacedMetaJson(
      tx,
      'channel_listing_option_daily_snapshots',
      row.id,
      input.companyId,
      input.metaJson,
    );
    return row;
  });
}

/**
 * Upsert ad target (campaign/keyword/product) daily fact.
 *
 * Idempotent on `(companyId, channel, businessDate, targetType, targetKey)`.
 *
 * Metric semantics (overwrite-on-replay): caller MUST pass a daily total
 * per `(target, businessDate)` row from the provider. Repeated calls
 * overwrite the column to the same total — they do not increment. Missing
 * metric keys leave any previously written column untouched on update.
 * Provider ratios are NOT trusted; if needed, attach them via `metaJson`.
 *
 * `metaJson` is namespaced per logical caller (see file header). Pass
 * `{ source: 'advertising.campaign.target', data: {...} }` and concurrent
 * payloads on the same row preserve each other's audit data.
 *
 * `sampleCount` increments per call; `firstObservedAt` is preserved;
 * `lastObservedAt` advances every call. `rawSnapshotId` updates to the
 * latest observed `ChannelScrapeSnapshot.id` so audit/replay reaches the
 * row.
 */
export async function upsertChannelAdTargetDaily(
  prisma: PrismaService,
  input: UpsertAdTargetDailyInput,
): Promise<{ id: string }> {
  if (!input.targetKey || input.targetKey.trim().length === 0) {
    throw new Error(
      'upsertChannelAdTargetDaily: targetKey must be a non-empty deterministic string',
    );
  }
  const observedAt = input.observedAt ?? new Date();
  const metaJsonForCreate = buildNamespacedMetaForCreate(input.metaJson);
  const metricsCreate = spreadMetricsForCreate(input, AD_TARGET_METRIC_KEYS);
  const metricsUpdate = spreadMetricsForUpdate(input, AD_TARGET_METRIC_KEYS);
  const observedDescriptors = pickObservedFields(
    input,
    AD_TARGET_DESCRIPTOR_KEYS,
  );

  return prisma.$transaction(async (tx) => {
    const row = await tx.channelAdTargetDailySnapshot.upsert({
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
        ...(input.metaJson === null ? { metaJson: Prisma.DbNull } : {}),
        ...observedDescriptors,
        ...metricsUpdate,
      },
      select: { id: true },
    });
    await mergeNamespacedMetaJson(
      tx,
      'channel_ad_target_daily_snapshots',
      row.id,
      input.companyId,
      input.metaJson,
    );
    return row;
  });
}

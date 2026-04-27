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

export interface ListingDailyUpsertInput extends ListingDailyState {
  companyId: string;
  listingId: string;
  channel: string;
  externalId: string;
  businessDate: Date;
  observedAt?: Date;
  rawSnapshotId?: string | null;
  metaJson?: Prisma.InputJsonValue | null;
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
   * Idempotent on `(companyId, listingId, businessDate)`. Repeated calls
   * increment `sampleCount`, refresh `lastObservedAt` and `rawSnapshotId`,
   * and overwrite observable fields when the new value is non-null.
   * `firstObservedAt` is preserved across updates.
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
}

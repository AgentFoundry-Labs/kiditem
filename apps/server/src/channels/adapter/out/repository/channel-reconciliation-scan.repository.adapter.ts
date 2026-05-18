import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ReconciliationScanResponse } from '@kiditem/shared/channel-reconciliation';
import {
  CHANNEL_RECONCILIATION_MATCHER_PORT,
  type ChannelReconciliationMatcherPort,
  type ChannelReconciliationScanRepositoryPort,
  type OptionLinkBackfillResult,
  RECONCILIATION_CHANNEL,
  type ReconciliationRowInput,
} from '../../../application/port/out/channel-reconciliation.repository.port';

/**
 * Coupang ↔ KidItem catalog reconciliation queue (issue #199).
 *
 * Owner domain = `channels`. Reconciliation reads/writes never auto-create
 * `MasterProduct` records — the queue captures unmatched/conflict rows for
 * the user to triage on `/product-hub/matching`.
 *
 * Matching rules (in order):
 *   1. Active `ChannelListing` (org, channel='coupang', externalId, isDeleted=false)
 *      exists → linked, resolutionSource='existing_external_id'.
 *   2. Otherwise, exactly one active `ProductOption` shares the row's
 *      `legacyCode` → needs_review until channel-account identity is proven.
 *   3. The existing listing master and the legacyCode candidate disagree
 *      → conflict (no auto-fix).
 *   4. No match → needs_review.
 *   5. Manual user link → manual.
 *   6. User ignore → ignored.
 *
 * Tenant scope: every read/write binds `organizationId` from
 * `@CurrentOrganization()`. Single-resource access uses
 * `findFirst({ where: { id, organizationId } })` — no bare-id `findUnique`.
 */
@Injectable()
export class ChannelReconciliationScanRepositoryAdapter
  implements ChannelReconciliationScanRepositoryPort
{
  private readonly logger = new Logger(ChannelReconciliationScanRepositoryAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_RECONCILIATION_MATCHER_PORT)
    private readonly matcher: ChannelReconciliationMatcherPort,
  ) {}

  /**
   * Replay Coupang Wing rows through the matching rules.
   *
   * Each row is processed inside its own transaction so a single bad row
   * does not poison the whole batch (continue-on-error). Counters live on
   * the run row and become the visible "last scan" summary.
   */
  async scanFromRows(
    organizationId: string,
    rows: ReconciliationRowInput[],
    source:
      | 'coupang_image_sync'
      | 'wing_inventory'
      | 'seller_products'
      | 'manual' = 'coupang_image_sync',
  ): Promise<ReconciliationScanResponse> {
    if (rows.length === 0) {
      throw new BadRequestException('rows must contain at least one entry');
    }

    const run = await this.prisma.channelReconciliationRun.create({
      data: {
        organizationId,
        channel: RECONCILIATION_CHANNEL,
        source,
        status: 'running',
      },
    });

    let alreadyLinkedCount = 0;
    let autoLinkedCount = 0;
    let needsReviewCount = 0;
    let conflictCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      try {
        const outcome = await this.prisma.$transaction(
          (tx) => this.processRow(tx, organizationId, run.id, row, source),
          { timeout: 15_000 },
        );
        if (outcome === 'already_linked') alreadyLinkedCount += 1;
        if (outcome === 'auto_linked') autoLinkedCount += 1;
        if (outcome === 'needs_review') needsReviewCount += 1;
        if (outcome === 'conflict') conflictCount += 1;
      } catch (error: unknown) {
        errorCount += 1;
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Reconciliation row ${row.externalId}/${row.externalOptionId ?? '-'} failed: ${message}`,
        );
      }
    }

    const totalCount = rows.length;
    await this.prisma.channelReconciliationRun.update({
      where: { id: run.id },
      data: {
        status: errorCount > 0 ? 'completed' : 'completed',
        totalCount,
        alreadyLinkedCount,
        autoLinkedCount,
        needsReviewCount,
        conflictCount,
        errorCount,
        finishedAt: new Date(),
      },
    });

    return {
      runId: run.id,
      totalCount,
      alreadyLinkedCount,
      autoLinkedCount,
      needsReviewCount,
      conflictCount,
      errorCount,
      optionLinkedCount: 0,
      optionLinkAmbiguousCount: 0,
      optionLinkNoCandidateCount: 0,
    } satisfies ReconciliationScanResponse;
  }

  /**
   * Rebuild the queue from the source we intentionally keep after cleanup:
   * active Coupang listings whose master has an image imported by Coupang image
   * sync (`MasterProductImage.source = 'coupang-wing'`).
   */
  async syncFromImageSyncedListings(
    organizationId: string,
  ): Promise<ReconciliationScanResponse> {
    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        channel: RECONCILIATION_CHANNEL,
        isDeleted: false,
        master: {
          isDeleted: false,
          images: {
            some: {
              organizationId,
              isDeleted: false,
              source: 'coupang-wing',
            },
          },
        },
      },
      select: {
        id: true,
        masterId: true,
        externalId: true,
        channelName: true,
        status: true,
        master: {
          select: {
            name: true,
            legacyCode: true,
            images: {
              where: {
                organizationId,
                isDeleted: false,
                source: 'coupang-wing',
              },
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
              select: { url: true },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    const optionBackfill = await this.backfillListingOptionLinksFromSingleInventoryOption(
      organizationId,
      listings.map((listing) => ({ id: listing.id, masterId: listing.masterId })),
    );

    const rows: ReconciliationRowInput[] = listings
      .filter((listing) => listing.externalId.trim())
      .map((listing) => ({
        externalId: listing.externalId,
        legacyCode: listing.master.legacyCode,
        channelProductName: listing.channelName ?? listing.master.name,
        channelImageUrl: listing.master.images[0]?.url ?? null,
        channelStatus: listing.status,
      }));
    const unresolvedOptionRows =
      await this.buildUnresolvedImageSyncedListingOptionRows(organizationId, listings);
    rows.push(...unresolvedOptionRows);

    if (rows.length === 0) {
      throw new BadRequestException('coupang image-synced listings not found');
    }

    const scan = await this.scanFromRows(organizationId, rows, 'coupang_image_sync');
    return { ...scan, ...optionBackfill } satisfies ReconciliationScanResponse;
  }

  private async buildUnresolvedImageSyncedListingOptionRows(
    organizationId: string,
    listings: Array<{
      id: string;
      externalId: string;
      channelName: string | null;
      status: string | null;
      master: {
        name: string;
        images: Array<{ url: string }>;
      };
    }>,
  ): Promise<ReconciliationRowInput[]> {
    if (listings.length === 0) return [];

    const listingById = new Map(listings.map((listing) => [listing.id, listing]));
    const listingOptions = await this.prisma.channelListingOption.findMany({
      where: {
        organizationId,
        listingId: { in: [...listingById.keys()] },
        optionId: null,
        isActive: true,
      },
      select: {
        listingId: true,
        externalOptionId: true,
        itemName: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    const rows: ReconciliationRowInput[] = [];
    for (const listingOption of listingOptions) {
      const listing = listingById.get(listingOption.listingId);
      if (!listing?.externalId.trim() || !listingOption.externalOptionId.trim()) continue;
      rows.push({
        externalId: listing.externalId,
        externalOptionId: listingOption.externalOptionId,
        // Product-level legacyCode is not a safe option-level discriminator.
        legacyCode: null,
        channelProductName: listing.channelName ?? listing.master.name,
        channelOptionName: listingOption.itemName,
        channelImageUrl: listing.master.images[0]?.url ?? null,
        channelStatus: listing.status,
      });
    }
    return rows;
  }

  private async backfillListingOptionLinksFromSingleInventoryOption(
    organizationId: string,
    listings: Array<{ id: string; masterId: string }>,
  ): Promise<OptionLinkBackfillResult> {
    const result: OptionLinkBackfillResult = {
      optionLinkedCount: 0,
      optionLinkAmbiguousCount: 0,
      optionLinkNoCandidateCount: 0,
    };
    if (listings.length === 0) return result;

    const listingById = new Map(listings.map((listing) => [listing.id, listing]));
    const listingOptions = await this.prisma.channelListingOption.findMany({
      where: {
        organizationId,
        listingId: { in: [...listingById.keys()] },
        optionId: null,
        isActive: true,
      },
      select: { id: true, listingId: true },
    });
    if (listingOptions.length === 0) return result;

    const mastersWithMissingOptions = new Set(
      listingOptions
        .map((listingOption) => listingById.get(listingOption.listingId)?.masterId)
        .filter((masterId): masterId is string => Boolean(masterId)),
    );
    const productOptions = await this.prisma.productOption.findMany({
      where: {
        organizationId,
        masterId: { in: [...mastersWithMissingOptions] },
        isActive: true,
        isDeleted: false,
        inventory: { isNot: null },
      },
      select: { id: true, masterId: true },
    });

    const optionsByMasterId = new Map<string, Array<{ id: string; masterId: string }>>();
    for (const option of productOptions) {
      const bucket = optionsByMasterId.get(option.masterId) ?? [];
      bucket.push(option);
      optionsByMasterId.set(option.masterId, bucket);
    }

    for (const listingOption of listingOptions) {
      const listing = listingById.get(listingOption.listingId);
      if (!listing) continue;
      const candidates = optionsByMasterId.get(listing.masterId) ?? [];
      if (candidates.length === 0) {
        result.optionLinkNoCandidateCount += 1;
        continue;
      }
      if (candidates.length > 1) {
        result.optionLinkAmbiguousCount += 1;
        continue;
      }

      const updated = await this.prisma.channelListingOption.updateMany({
        where: {
          id: listingOption.id,
          organizationId,
          listingId: listingOption.listingId,
          optionId: null,
        },
        data: { optionId: candidates[0].id, isUnmatched: false },
      });
      result.optionLinkedCount += updated.count;
    }

    return result;
  }

  private async processRow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    runId: string,
    row: ReconciliationRowInput,
    source: string,
  ): Promise<'already_linked' | 'auto_linked' | 'needs_review' | 'conflict' | 'ignored'> {
    const externalId = row.externalId.trim();
    if (!externalId) {
      throw new BadRequestException('row.externalId is required');
    }
    const externalOptionId = row.externalOptionId?.trim() || null;
    const legacyCode = row.legacyCode?.trim() || null;
    const itemKey = externalOptionId
      ? `option:${externalId}:${externalOptionId}`
      : `listing:${externalId}`;
    const itemType = externalOptionId ? 'channel_option' : 'channel_listing';

    const existing = await tx.channelReconciliationItem.findFirst({
      where: {
        organizationId,
        channel: RECONCILIATION_CHANNEL,
        source,
        itemKey,
      },
      select: { id: true, status: true, ignoredReason: true },
    });

    // User has already ignored this row — keep it ignored, just refresh
    // observation timestamps so the user sees the run as covering it.
    if (existing?.status === 'ignored') {
      await tx.channelReconciliationItem.update({
        where: {
          organizationId_channel_source_itemKey: {
            organizationId,
            channel: RECONCILIATION_CHANNEL,
            source,
            itemKey,
          },
        },
        data: {
          lastSeenRunId: runId,
          lastObservedAt: new Date(),
          channelProductName: row.channelProductName ?? null,
          channelOptionName: row.channelOptionName ?? null,
          channelImageUrl: row.channelImageUrl ?? null,
          channelUrl: row.channelUrl ?? null,
          channelStatus: row.channelStatus ?? null,
          legacyCode,
          rawJson: row as unknown as Prisma.InputJsonValue,
        },
      });
      return 'ignored';
    }

    const outcome = await this.matcher.evaluateRow(
      tx,
      organizationId,
      externalId,
      externalOptionId,
      legacyCode,
    );
    const resolved = outcome.status === 'linked';

    const data = {
      organizationId,
      lastSeenRunId: runId,
      channel: RECONCILIATION_CHANNEL,
      source,
      itemType,
      itemKey,
      status: outcome.status,
      externalId,
      externalOptionId,
      legacyCode,
      channelProductName: row.channelProductName ?? null,
      channelOptionName: row.channelOptionName ?? null,
      channelImageUrl: row.channelImageUrl ?? null,
      channelUrl: row.channelUrl ?? null,
      channelStatus: row.channelStatus ?? null,
      linkedListingId: outcome.linkedListingId,
      linkedListingOptionId: outcome.linkedListingOptionId,
      linkedMasterProductId: outcome.linkedMasterProductId,
      linkedProductOptionId: outcome.linkedProductOptionId,
      matchReason: outcome.matchReason,
      resolutionSource: outcome.resolutionSource,
      confidence: outcome.confidence,
      rawJson: row as unknown as Prisma.InputJsonValue,
      conflictJson: outcome.conflictJson ?? Prisma.JsonNull,
      resolvedAt: resolved ? new Date() : null,
      lastObservedAt: new Date(),
    };

    if (existing) {
      await tx.channelReconciliationItem.update({
        where: {
          organizationId_channel_source_itemKey: {
            organizationId,
            channel: RECONCILIATION_CHANNEL,
            source,
            itemKey,
          },
        },
        data,
      });
    } else {
      await tx.channelReconciliationItem.create({
        data: {
          ...data,
          firstObservedAt: new Date(),
        },
      });
    }

    if (outcome.status === 'linked') {
      return outcome.resolutionSource === 'existing_external_id'
        ? 'already_linked'
        : 'auto_linked';
    }
    if (outcome.status === 'conflict') return 'conflict';
    return 'needs_review';
  }

}

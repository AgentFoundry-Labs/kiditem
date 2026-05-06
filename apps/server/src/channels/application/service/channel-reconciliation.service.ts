import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ReconciliationItem,
  ReconciliationItemListResponse,
  ReconciliationItemStatus,
  ReconciliationMatchReason,
  ReconciliationResolutionSource,
  ReconciliationScanResponse,
  ReconciliationSummary,
} from '@kiditem/shared/channel-reconciliation';

export interface ReconciliationRowInput {
  externalId: string;
  externalOptionId?: string | null;
  legacyCode?: string | null;
  channelProductName?: string | null;
  channelOptionName?: string | null;
  channelImageUrl?: string | null;
  channelUrl?: string | null;
  channelStatus?: string | null;
}

interface MatchOutcome {
  status: ReconciliationItemStatus;
  matchReason: ReconciliationMatchReason;
  resolutionSource: ReconciliationResolutionSource | null;
  confidence: number | null;
  linkedListingId: string | null;
  linkedListingOptionId: string | null;
  linkedMasterProductId: string | null;
  linkedProductOptionId: string | null;
  conflictJson: Prisma.InputJsonValue | null;
}

interface ProductOptionCandidate {
  id: string;
  masterId: string;
}

interface ChannelListingHandle {
  id: string;
  masterId: string;
}

interface ChannelListingOptionHandle {
  id: string;
  optionId: string | null;
}

interface OptionLinkBackfillResult {
  optionLinkedCount: number;
  optionLinkAmbiguousCount: number;
  optionLinkNoCandidateCount: number;
}

type Tx = Prisma.TransactionClient;

type PrismaLike = PrismaClient | PrismaService;

const RECONCILIATION_CHANNEL = 'coupang';
const DEFAULT_LIMIT = 50;
const MAX_PAGE = 200;
const LINKED_RESOLUTION_SOURCES = [
  'existing_external_id',
  'auto_legacy_code',
  'manual',
  'ignored',
] as const satisfies ReconciliationResolutionSource[];

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
 *      `legacyCode` → linked, resolutionSource='auto_legacy_code', and the
 *      missing `ChannelListing` (+ option, when externalOptionId present)
 *      is created.
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
export class ChannelReconciliationService {
  private readonly logger = new Logger(ChannelReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    tx: Tx,
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

    const outcome = await this.evaluateRow(tx, organizationId, externalId, externalOptionId, legacyCode);
    const resolved = outcome.status === 'linked';
    const isAutoLinked = resolved && outcome.resolutionSource !== 'manual';

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

  /**
   * Apply the matching rules to a single row. Pure-ish: side effects are
   * limited to creating a `ChannelListing`/`ChannelListingOption` when
   * `legacyCode` resolves to exactly one active option AND no listing yet
   * exists (rule 2).
   */
  private async evaluateRow(
    tx: Tx,
    organizationId: string,
    externalId: string,
    externalOptionId: string | null,
    legacyCode: string | null,
  ): Promise<MatchOutcome> {
    const listing = await this.findActiveListing(tx, organizationId, externalId);

    if (listing) {
      // Rule 1: existing ChannelListing — listing-level link is established.
      let listingOption: ChannelListingOptionHandle | null = null;
      let linkedProductOptionId: string | null = null;
      if (externalOptionId) {
        listingOption = await tx.channelListingOption.findFirst({
          where: {
            organizationId,
            listingId: listing.id,
            externalOptionId,
          },
          select: { id: true, optionId: true },
        });
        linkedProductOptionId = listingOption?.optionId ?? null;
      }

      // Rule 4: existing listing master vs legacyCode candidate disagreement.
      let legacyCandidates: ProductOptionCandidate[] = [];
      if (legacyCode) {
        legacyCandidates = await this.findActiveOptionsByLegacyCode(tx, organizationId, legacyCode);
        const masterMismatch = legacyCandidates.find((c) => c.masterId !== listing.masterId);
        if (masterMismatch) {
          return {
            status: 'conflict',
            matchReason: 'conflict',
            resolutionSource: null,
            confidence: 60,
            linkedListingId: listing.id,
            linkedListingOptionId: listingOption?.id ?? null,
            linkedMasterProductId: listing.masterId,
            linkedProductOptionId,
            conflictJson: {
              kind: 'existing_listing_vs_legacy_code',
              listingMasterId: listing.masterId,
              legacyCodeCandidateMasterIds: legacyCandidates.map((c) => c.masterId),
              candidateOptionIds: legacyCandidates.map((c) => c.id),
            } satisfies Prisma.InputJsonValue,
          };
        }
      }

      if (externalOptionId && !listingOption) {
        const candidate =
          legacyCandidates.length === 1 && legacyCandidates[0].masterId === listing.masterId
            ? legacyCandidates[0]
            : null;
        listingOption = await this.createListingOption(
          tx,
          organizationId,
          listing.id,
          externalOptionId,
          candidate?.id ?? null,
        );
        linkedProductOptionId = listingOption.optionId;
      }

      if (externalOptionId && listingOption && !linkedProductOptionId) {
        const candidate =
          legacyCandidates.length === 1 && legacyCandidates[0].masterId === listing.masterId
            ? legacyCandidates[0]
            : null;
        if (candidate) {
          const updated = await tx.channelListingOption.updateMany({
            where: {
              id: listingOption.id,
              organizationId,
              listingId: listing.id,
              optionId: null,
            },
            data: { optionId: candidate.id, isUnmatched: false },
          });
          if (updated.count > 0) {
            linkedProductOptionId = candidate.id;
          }
        } else if (legacyCandidates.length > 1) {
          return {
            status: 'conflict',
            matchReason: 'conflict',
            resolutionSource: null,
            confidence: 40,
            linkedListingId: listing.id,
            linkedListingOptionId: listingOption.id,
            linkedMasterProductId: listing.masterId,
            linkedProductOptionId: null,
            conflictJson: {
              kind: 'multiple_legacy_code_matches_for_existing_listing_option',
              listingMasterId: listing.masterId,
              legacyCode,
              candidateOptionIds: legacyCandidates.map((c) => c.id),
              candidateMasterIds: legacyCandidates.map((c) => c.masterId),
            } satisfies Prisma.InputJsonValue,
          };
        } else {
          return {
            status: 'needs_review',
            matchReason: 'none',
            resolutionSource: null,
            confidence: null,
            linkedListingId: listing.id,
            linkedListingOptionId: listingOption.id,
            linkedMasterProductId: listing.masterId,
            linkedProductOptionId: null,
            conflictJson: null,
          };
        }
      }

      return {
        status: 'linked',
        matchReason: 'external_id',
        resolutionSource: 'existing_external_id',
        confidence: 100,
        linkedListingId: listing.id,
        linkedListingOptionId: listingOption?.id ?? null,
        linkedMasterProductId: listing.masterId,
        linkedProductOptionId,
        conflictJson: null,
      };
    }

    // Rules 2/5/6: no existing listing — try legacyCode exact match.
    if (legacyCode) {
      const candidates = await this.findActiveOptionsByLegacyCode(tx, organizationId, legacyCode);
      if (candidates.length === 1) {
        const candidate = candidates[0];
        const created = await this.createListingForCandidate(
          tx,
          organizationId,
          candidate,
          externalId,
          externalOptionId,
        );
        return {
          status: 'linked',
          matchReason: 'legacy_code_exact',
          resolutionSource: 'auto_legacy_code',
          confidence: 90,
          linkedListingId: created.listingId,
          linkedListingOptionId: created.listingOptionId,
          linkedMasterProductId: candidate.masterId,
          linkedProductOptionId: candidate.id,
          conflictJson: null,
        };
      }
      if (candidates.length > 1) {
        // Rule 3 variant: legacyCode is ambiguous on the KidItem side.
        return {
          status: 'conflict',
          matchReason: 'conflict',
          resolutionSource: null,
          confidence: 40,
          linkedListingId: null,
          linkedListingOptionId: null,
          linkedMasterProductId: null,
          linkedProductOptionId: null,
          conflictJson: {
            kind: 'multiple_legacy_code_matches',
            legacyCode,
            candidateOptionIds: candidates.map((c) => c.id),
            candidateMasterIds: candidates.map((c) => c.masterId),
          } satisfies Prisma.InputJsonValue,
        };
      }
    }

    return {
      status: 'needs_review',
      matchReason: 'none',
      resolutionSource: null,
      confidence: null,
      linkedListingId: null,
      linkedListingOptionId: null,
      linkedMasterProductId: null,
      linkedProductOptionId: null,
      conflictJson: null,
    };
  }

  private async findActiveListing(
    tx: Tx,
    organizationId: string,
    externalId: string,
  ): Promise<ChannelListingHandle | null> {
    return tx.channelListing.findFirst({
      where: {
        organizationId,
        channel: RECONCILIATION_CHANNEL,
        externalId,
        isDeleted: false,
      },
      select: { id: true, masterId: true },
    });
  }

  private async findActiveOptionsByLegacyCode(
    tx: Tx,
    organizationId: string,
    legacyCode: string,
  ): Promise<ProductOptionCandidate[]> {
    const options = await tx.productOption.findMany({
      where: {
        organizationId,
        legacyCode,
        isActive: true,
        isDeleted: false,
        master: { isDeleted: false },
      },
      select: { id: true, masterId: true },
    });
    return options;
  }

  private async createListingForCandidate(
    tx: Tx,
    organizationId: string,
    candidate: ProductOptionCandidate,
    externalId: string,
    externalOptionId: string | null,
  ): Promise<{ listingId: string; listingOptionId: string | null }> {
    const listing = await tx.channelListing.create({
      data: {
        organizationId,
        masterId: candidate.masterId,
        channel: RECONCILIATION_CHANNEL,
        externalId,
        status: 'draft',
      },
      select: { id: true },
    });
    let listingOptionId: string | null = null;
    if (externalOptionId) {
      const option = await this.createListingOption(
        tx,
        organizationId,
        listing.id,
        externalOptionId,
        candidate.id,
      );
      listingOptionId = option.id;
    }
    return { listingId: listing.id, listingOptionId };
  }

  private async createListingOption(
    tx: Tx,
    organizationId: string,
    listingId: string,
    externalOptionId: string,
    optionId: string | null,
  ): Promise<ChannelListingOptionHandle> {
    const option = await tx.channelListingOption.create({
      data: {
        organizationId,
        listingId,
        externalOptionId,
        optionId,
        isActive: true,
      },
      select: { id: true, optionId: true },
    });
    return option;
  }

  /**
   * Latest run + counters for the matching center summary cards.
   */
  async getSummary(organizationId: string): Promise<ReconciliationSummary> {
    const [
      totalCount,
      linkedCount,
      autoLinkedCount,
      needsReviewCount,
      conflictCount,
      ignoredCount,
      lastRun,
    ] = await Promise.all([
      this.prisma.channelReconciliationItem.count({
        where: { organizationId, channel: RECONCILIATION_CHANNEL },
      }),
      this.prisma.channelReconciliationItem.count({
        where: { organizationId, channel: RECONCILIATION_CHANNEL, status: 'linked' },
      }),
      this.prisma.channelReconciliationItem.count({
        where: {
          organizationId,
          channel: RECONCILIATION_CHANNEL,
          status: 'linked',
          resolutionSource: 'auto_legacy_code',
        },
      }),
      this.prisma.channelReconciliationItem.count({
        where: { organizationId, channel: RECONCILIATION_CHANNEL, status: 'needs_review' },
      }),
      this.prisma.channelReconciliationItem.count({
        where: { organizationId, channel: RECONCILIATION_CHANNEL, status: 'conflict' },
      }),
      this.prisma.channelReconciliationItem.count({
        where: { organizationId, channel: RECONCILIATION_CHANNEL, status: 'ignored' },
      }),
      this.prisma.channelReconciliationRun.findFirst({
        where: { organizationId, channel: RECONCILIATION_CHANNEL },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          status: true,
          source: true,
          totalCount: true,
          autoLinkedCount: true,
          needsReviewCount: true,
          conflictCount: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
    ]);

    return {
      total: totalCount,
      linked: linkedCount,
      autoLinked: autoLinkedCount,
      needsReview: needsReviewCount,
      conflict: conflictCount,
      ignored: ignoredCount,
      lastRun: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            source: lastRun.source,
            totalCount: lastRun.totalCount,
            autoLinkedCount: lastRun.autoLinkedCount,
            needsReviewCount: lastRun.needsReviewCount,
            conflictCount: lastRun.conflictCount,
            startedAt: lastRun.startedAt,
            finishedAt: lastRun.finishedAt,
          }
        : null,
    } satisfies ReconciliationSummary;
  }

  async listItems(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      resolutionSource?: string;
      search?: string;
    },
  ): Promise<ReconciliationItemListResponse> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(MAX_PAGE, Math.max(1, params.limit ?? DEFAULT_LIMIT));

    const where: Prisma.ChannelReconciliationItemWhereInput = {
      organizationId,
      channel: RECONCILIATION_CHANNEL,
    };
    if (params.status && params.status !== 'all') {
      where.status = params.status;
    }
    if (
      params.resolutionSource &&
      LINKED_RESOLUTION_SOURCES.includes(
        params.resolutionSource as ReconciliationResolutionSource,
      )
    ) {
      where.resolutionSource = params.resolutionSource;
    }
    if (params.search) {
      const trimmed = params.search.trim();
      if (trimmed.length > 0) {
        where.OR = [
          { externalId: { contains: trimmed, mode: 'insensitive' } },
          { externalOptionId: { contains: trimmed, mode: 'insensitive' } },
          { legacyCode: { contains: trimmed, mode: 'insensitive' } },
          { channelProductName: { contains: trimmed, mode: 'insensitive' } },
          { channelOptionName: { contains: trimmed, mode: 'insensitive' } },
        ];
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.channelReconciliationItem.count({ where }),
      this.prisma.channelReconciliationItem.findMany({
        where,
        orderBy: [{ status: 'asc' }, { lastObservedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = await this.attachLinkedDetails(organizationId, rows);

    return {
      items,
      total,
      page,
      limit,
    } satisfies ReconciliationItemListResponse;
  }

  /**
   * Hydrate linked KidItem master/option names for the table view.
   * One bounded `IN (...)` per kind — never N+1.
   */
  private async attachLinkedDetails(
    organizationId: string,
    rows: Awaited<ReturnType<PrismaService['channelReconciliationItem']['findMany']>>,
  ): Promise<ReconciliationItem[]> {
    const masterIds = collectIds(rows.map((r) => r.linkedMasterProductId));
    const optionIds = collectIds(rows.map((r) => r.linkedProductOptionId));

    const [masters, options] = await Promise.all([
      masterIds.length > 0
        ? this.prisma.masterProduct.findMany({
            where: { organizationId, id: { in: masterIds } },
            select: { id: true, name: true, code: true },
          })
        : Promise.resolve([]),
      optionIds.length > 0
        ? this.prisma.productOption.findMany({
            where: { organizationId, id: { in: optionIds } },
            select: {
              id: true,
              optionName: true,
              sku: true,
              legacyCode: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const masterById = new Map(masters.map((m) => [m.id, m]));
    const optionById = new Map(options.map((o) => [o.id, o]));

    return rows.map((row) => {
      const master = row.linkedMasterProductId
        ? masterById.get(row.linkedMasterProductId)
        : undefined;
      const option = row.linkedProductOptionId
        ? optionById.get(row.linkedProductOptionId)
        : undefined;

      return {
        id: row.id,
        channel: 'coupang' as const,
        source: row.source,
        itemType: row.itemType as ReconciliationItem['itemType'],
        status: row.status as ReconciliationItem['status'],
        externalId: row.externalId,
        externalOptionId: row.externalOptionId,
        legacyCode: row.legacyCode,
        channelProductName: row.channelProductName,
        channelOptionName: row.channelOptionName,
        channelImageUrl: row.channelImageUrl,
        channelUrl: row.channelUrl,
        channelStatus: row.channelStatus,
        matchReason: (row.matchReason ?? null) as ReconciliationItem['matchReason'],
        resolutionSource: (row.resolutionSource ?? null) as ReconciliationItem['resolutionSource'],
        confidence: row.confidence ?? null,
        linkedListingId: row.linkedListingId,
        linkedListingOptionId: row.linkedListingOptionId,
        linked: {
          masterProductId: row.linkedMasterProductId,
          masterProductName: master?.name ?? null,
          masterProductCode: master?.code ?? null,
          productOptionId: row.linkedProductOptionId,
          productOptionName: option?.optionName ?? null,
          productOptionSku: option?.sku ?? null,
          productOptionLegacyCode: option?.legacyCode ?? null,
        },
        ignoredReason: row.ignoredReason,
        resolvedAt: row.resolvedAt,
        firstObservedAt: row.firstObservedAt,
        lastObservedAt: row.lastObservedAt,
        updatedAt: row.updatedAt,
      } satisfies ReconciliationItem;
    });
  }

  /**
   * Manual link — user picked a `ProductOption` in the matching UI.
   * Auto-creates `ChannelListing` (and option) if not present.
   */
  async linkItem(
    itemId: string,
    organizationId: string,
    body: { productOptionId: string },
  ): Promise<ReconciliationItem> {
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const item = await tx.channelReconciliationItem.findFirst({
          where: { id: itemId, organizationId, channel: RECONCILIATION_CHANNEL },
        });
        if (!item) throw new NotFoundException('reconciliation item not found');
        if (!item.externalId) {
          throw new BadRequestException('item has no externalId — cannot link');
        }

        const option = await tx.productOption.findFirst({
          where: {
            id: body.productOptionId,
            organizationId,
            isActive: true,
            isDeleted: false,
            master: { isDeleted: false },
          },
          select: { id: true, masterId: true },
        });
        if (!option) {
          throw new BadRequestException(
            'productOptionId is not active in this organization',
          );
        }

        let listingId = item.linkedListingId;
        let listingOptionId = item.linkedListingOptionId;

        const existingListing = await tx.channelListing.findFirst({
          where: {
            organizationId,
            channel: RECONCILIATION_CHANNEL,
            externalId: item.externalId,
            isDeleted: false,
          },
          select: { id: true, masterId: true },
        });

        if (existingListing) {
          listingId = existingListing.id;
          if (existingListing.masterId !== option.masterId) {
            const retargeted = await tx.channelListing.updateMany({
              where: {
                id: existingListing.id,
                organizationId,
                channel: RECONCILIATION_CHANNEL,
                externalId: item.externalId,
                isDeleted: false,
              },
              data: { masterId: option.masterId },
            });
            if (retargeted.count !== 1) {
              throw new BadRequestException('existing ChannelListing disappeared during relink');
            }
          }
        } else {
          const created = await tx.channelListing.create({
            data: {
              organizationId,
              masterId: option.masterId,
              channel: RECONCILIATION_CHANNEL,
              externalId: item.externalId,
              status: 'draft',
            },
            select: { id: true },
          });
          listingId = created.id;
        }

        if (item.externalOptionId) {
          const existingOpt = await tx.channelListingOption.findFirst({
            where: {
              organizationId,
              listingId,
              externalOptionId: item.externalOptionId,
            },
            select: { id: true },
          });
          if (existingOpt) {
            const updatedOpt = await tx.channelListingOption.updateMany({
              where: {
                id: existingOpt.id,
                organizationId,
                listingId,
                externalOptionId: item.externalOptionId,
              },
              data: { optionId: option.id, isActive: true },
            });
            if (updatedOpt.count !== 1) {
              throw new BadRequestException('existing ChannelListingOption disappeared during relink');
            }
            listingOptionId = existingOpt.id;
          } else {
            const createdOpt = await tx.channelListingOption.create({
              data: {
                organizationId,
                listingId,
                externalOptionId: item.externalOptionId,
                optionId: option.id,
                isActive: true,
              },
              select: { id: true },
            });
            listingOptionId = createdOpt.id;
          }
        }

        return tx.channelReconciliationItem.update({
          where: {
            organizationId_channel_source_itemKey: {
              organizationId,
              channel: RECONCILIATION_CHANNEL,
              source: item.source,
              itemKey: item.itemKey,
            },
          },
          data: {
            status: 'linked',
            matchReason: 'manual',
            resolutionSource: 'manual',
            linkedListingId: listingId,
            linkedListingOptionId: listingOptionId,
            linkedMasterProductId: option.masterId,
            linkedProductOptionId: option.id,
            confidence: 100,
            resolvedAt: new Date(),
            ignoredReason: null,
            conflictJson: Prisma.JsonNull,
          },
        });
      },
      { timeout: 15_000 },
    );

    const [hydrated] = await this.attachLinkedDetails(organizationId, [updated]);
    return hydrated;
  }

  async ignoreItem(
    itemId: string,
    organizationId: string,
    body: { reason?: string | null },
  ): Promise<ReconciliationItem> {
    const item = await this.prisma.channelReconciliationItem.findFirst({
      where: { id: itemId, organizationId, channel: RECONCILIATION_CHANNEL },
      select: { id: true, source: true, itemKey: true },
    });
    if (!item) throw new NotFoundException('reconciliation item not found');

    const updated = await this.prisma.channelReconciliationItem.update({
      where: {
        organizationId_channel_source_itemKey: {
          organizationId,
          channel: RECONCILIATION_CHANNEL,
          source: item.source,
          itemKey: item.itemKey,
        },
      },
      data: {
        status: 'ignored',
        resolutionSource: 'ignored',
        ignoredReason: body.reason ?? null,
        resolvedAt: new Date(),
      },
    });

    const [hydrated] = await this.attachLinkedDetails(organizationId, [updated]);
    return hydrated;
  }
}

function collectIds(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v) set.add(v);
  }
  return [...set];
}

export type { PrismaLike };

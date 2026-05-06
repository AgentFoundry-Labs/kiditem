import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ReconciliationItemStatus,
  ReconciliationMatchReason,
  ReconciliationResolutionSource,
  ReconciliationScanResponse,
} from '@kiditem/shared/channel-reconciliation';

const RECONCILIATION_CHANNEL = 'coupang';
export const CATALOG_RECONCILIATION_SOURCE = 'catalog_inventory';
const CATALOG_SYNC_LIMIT = 10_000;

interface CatalogListingOption {
  id: string;
  externalOptionId: string;
  optionId: string | null;
  itemName: string | null;
}

interface CatalogListing {
  id: string;
  externalId: string;
  channelName: string | null;
  options: CatalogListingOption[];
}

interface CatalogOption {
  id: string;
  sku: string;
  legacyCode: string | null;
  optionName: string | null;
  availableStock: number | null;
  inventory: {
    currentStock: number;
    reservedStock: number;
    safetyStock: number;
  } | null;
  master: {
    id: string;
    name: string;
    code: string | null;
    legacyCode: string | null;
    thumbnailUrl: string | null;
    imageUrl: string | null;
    listings: CatalogListing[];
  };
}

interface CatalogItemData {
  itemKey: string;
  status: ReconciliationItemStatus;
  externalId: string | null;
  externalOptionId: string | null;
  legacyCode: string | null;
  channelProductName: string | null;
  channelOptionName: string | null;
  channelImageUrl: string | null;
  linkedListingId: string | null;
  linkedListingOptionId: string | null;
  linkedMasterProductId: string;
  linkedProductOptionId: string;
  matchReason: ReconciliationMatchReason;
  resolutionSource: ReconciliationResolutionSource | null;
  confidence: number | null;
  rawJson: Prisma.InputJsonValue;
  resolvedAt: Date | null;
}

@Injectable()
export class ChannelReconciliationCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async syncCatalogCoverage(organizationId: string): Promise<ReconciliationScanResponse> {
    const run = await this.prisma.channelReconciliationRun.create({
      data: {
        organizationId,
        channel: RECONCILIATION_CHANNEL,
        source: CATALOG_RECONCILIATION_SOURCE,
        status: 'running',
        metaJson: {
          scope: 'active_product_options',
          itemType: 'kiditem_option',
        },
      },
    });

    let totalCount = 0;
    let alreadyLinkedCount = 0;
    let needsReviewCount = 0;
    let ignoredCount = 0;

    try {
      const options = (await this.prisma.productOption.findMany({
        where: {
          organizationId,
          isDeleted: false,
          isActive: true,
          master: { isDeleted: false, pipelineStep: null },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: CATALOG_SYNC_LIMIT,
        select: {
          id: true,
          sku: true,
          legacyCode: true,
          optionName: true,
          availableStock: true,
          inventory: {
            select: {
              currentStock: true,
              reservedStock: true,
              safetyStock: true,
            },
          },
          master: {
            select: {
              id: true,
              name: true,
              code: true,
              legacyCode: true,
              thumbnailUrl: true,
              imageUrl: true,
              listings: {
                where: {
                  organizationId,
                  channel: RECONCILIATION_CHANNEL,
                  isDeleted: false,
                },
                select: {
                  id: true,
                  externalId: true,
                  channelName: true,
                  options: {
                    where: {
                      organizationId,
                      isActive: true,
                    },
                    select: {
                      id: true,
                      externalOptionId: true,
                      optionId: true,
                      itemName: true,
                    },
                  },
                },
              },
            },
          },
        },
      })) as CatalogOption[];

      totalCount = options.length;

      for (const option of options) {
        const data = toCatalogItemData(option);
        const existing = await this.prisma.channelReconciliationItem.findFirst({
          where: {
            organizationId,
            channel: RECONCILIATION_CHANNEL,
            source: CATALOG_RECONCILIATION_SOURCE,
            itemKey: data.itemKey,
          },
          select: { id: true, status: true },
        });

        if (existing?.status === 'ignored') {
          ignoredCount += 1;
          await this.prisma.channelReconciliationItem.update({
            where: {
              organizationId_channel_source_itemKey: {
                organizationId,
                channel: RECONCILIATION_CHANNEL,
                source: CATALOG_RECONCILIATION_SOURCE,
                itemKey: data.itemKey,
              },
            },
            data: {
              lastSeenRunId: run.id,
              externalId: data.externalId,
              externalOptionId: data.externalOptionId,
              legacyCode: data.legacyCode,
              channelProductName: data.channelProductName,
              channelOptionName: data.channelOptionName,
              channelImageUrl: data.channelImageUrl,
              linkedListingId: data.linkedListingId,
              linkedListingOptionId: data.linkedListingOptionId,
              linkedMasterProductId: data.linkedMasterProductId,
              linkedProductOptionId: data.linkedProductOptionId,
              rawJson: data.rawJson,
              lastObservedAt: new Date(),
            },
          });
          continue;
        }

        if (data.status === 'linked') alreadyLinkedCount += 1;
        if (data.status === 'needs_review') needsReviewCount += 1;

        const now = new Date();
        await this.prisma.channelReconciliationItem.upsert({
          where: {
            organizationId_channel_source_itemKey: {
              organizationId,
              channel: RECONCILIATION_CHANNEL,
              source: CATALOG_RECONCILIATION_SOURCE,
              itemKey: data.itemKey,
            },
          },
          create: {
            organizationId,
            channel: RECONCILIATION_CHANNEL,
            source: CATALOG_RECONCILIATION_SOURCE,
            itemType: 'kiditem_option',
            itemKey: data.itemKey,
            status: data.status,
            externalId: data.externalId,
            externalOptionId: data.externalOptionId,
            legacyCode: data.legacyCode,
            channelProductName: data.channelProductName,
            channelOptionName: data.channelOptionName,
            channelImageUrl: data.channelImageUrl,
            channelUrl: null,
            channelStatus: null,
            linkedListingId: data.linkedListingId,
            linkedListingOptionId: data.linkedListingOptionId,
            linkedMasterProductId: data.linkedMasterProductId,
            linkedProductOptionId: data.linkedProductOptionId,
            matchReason: data.matchReason,
            resolutionSource: data.resolutionSource,
            confidence: data.confidence,
            rawJson: data.rawJson,
            conflictJson: Prisma.JsonNull,
            resolvedAt: data.resolvedAt,
            firstObservedAt: now,
            lastObservedAt: now,
            lastSeenRunId: run.id,
          },
          update: {
            status: data.status,
            externalId: data.externalId,
            externalOptionId: data.externalOptionId,
            legacyCode: data.legacyCode,
            channelProductName: data.channelProductName,
            channelOptionName: data.channelOptionName,
            channelImageUrl: data.channelImageUrl,
            channelUrl: null,
            channelStatus: null,
            linkedListingId: data.linkedListingId,
            linkedListingOptionId: data.linkedListingOptionId,
            linkedMasterProductId: data.linkedMasterProductId,
            linkedProductOptionId: data.linkedProductOptionId,
            matchReason: data.matchReason,
            resolutionSource: data.resolutionSource,
            confidence: data.confidence,
            rawJson: data.rawJson,
            conflictJson: Prisma.JsonNull,
            resolvedAt: data.resolvedAt,
            ignoredReason: null,
            lastObservedAt: now,
            lastSeenRunId: run.id,
          },
        });
      }

      await this.prisma.channelReconciliationRun.updateMany({
        where: { id: run.id, organizationId },
        data: {
          status: 'completed',
          totalCount,
          alreadyLinkedCount,
          autoLinkedCount: 0,
          needsReviewCount,
          conflictCount: 0,
          ignoredCount,
          errorCount: 0,
          finishedAt: new Date(),
        },
      });

      return {
        runId: run.id,
        totalCount,
        alreadyLinkedCount,
        autoLinkedCount: 0,
        needsReviewCount,
        conflictCount: 0,
        errorCount: 0,
      } satisfies ReconciliationScanResponse;
    } catch (error) {
      await this.prisma.channelReconciliationRun.updateMany({
        where: { id: run.id, organizationId },
        data: {
          status: 'failed',
          totalCount,
          alreadyLinkedCount,
          autoLinkedCount: 0,
          needsReviewCount,
          conflictCount: 0,
          ignoredCount,
          errorCount: 1,
          finishedAt: new Date(),
          errorJson: serializeError(error),
        },
      });
      throw error;
    }
  }
}

function toCatalogItemData(option: CatalogOption): CatalogItemData {
  const linked = findLinkedListingOption(option);
  const fallbackListing = option.master.listings[0] ?? null;
  const listing = linked?.listing ?? fallbackListing;
  const listingOption = linked?.listingOption ?? null;
  const isLinked = Boolean(linked);

  return {
    itemKey: `kiditem_option:${option.id}`,
    status: isLinked ? 'linked' : 'needs_review',
    externalId: listing?.externalId ?? null,
    externalOptionId: listingOption?.externalOptionId ?? null,
    legacyCode: option.legacyCode ?? option.master.legacyCode,
    channelProductName: listing?.channelName ?? null,
    channelOptionName: listingOption?.itemName ?? null,
    channelImageUrl: null,
    linkedListingId: listing?.id ?? null,
    linkedListingOptionId: listingOption?.id ?? null,
    linkedMasterProductId: option.master.id,
    linkedProductOptionId: option.id,
    matchReason: isLinked ? 'external_id' : 'none',
    resolutionSource: isLinked ? 'existing_external_id' : null,
    confidence: isLinked ? 100 : null,
    rawJson: toRawJson(option, Boolean(fallbackListing), Boolean(linked)),
    resolvedAt: isLinked ? new Date() : null,
  };
}

function findLinkedListingOption(option: CatalogOption): {
  listing: CatalogListing;
  listingOption: CatalogListingOption;
} | null {
  for (const listing of option.master.listings) {
    for (const listingOption of listing.options) {
      if (listingOption.optionId === option.id) {
        return { listing, listingOption };
      }
    }
  }
  return null;
}

function toRawJson(
  option: CatalogOption,
  hasCoupangListing: boolean,
  hasCoupangOptionMapping: boolean,
): Prisma.InputJsonValue {
  return {
    source: CATALOG_RECONCILIATION_SOURCE,
    masterProduct: {
      id: option.master.id,
      name: option.master.name,
      code: option.master.code,
      legacyCode: option.master.legacyCode,
      imageUrl: option.master.thumbnailUrl ?? option.master.imageUrl,
    },
    productOption: {
      id: option.id,
      sku: option.sku,
      legacyCode: option.legacyCode,
      optionName: option.optionName,
      availableStock: option.availableStock,
    },
    inventory: option.inventory
      ? {
          currentStock: option.inventory.currentStock,
          reservedStock: option.inventory.reservedStock,
          safetyStock: option.inventory.safetyStock,
        }
      : null,
    coverage: {
      hasCoupangListing,
      hasCoupangOptionMapping,
    },
  };
}

function serializeError(error: unknown): Prisma.InputJsonValue {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: String(error) };
}

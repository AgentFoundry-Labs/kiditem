import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ReconciliationItem,
  ReconciliationItemListResponse,
  ReconciliationResolutionSource,
  ReconciliationSummary,
} from '@kiditem/shared/channel-reconciliation';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type ChannelReconciliationQueryRepositoryPort,
  type ReconciliationRepositoryItemRow,
  DEFAULT_LIMIT,
  LINKED_RESOLUTION_SOURCES,
  MAX_PAGE,
  RECONCILIATION_CHANNEL,
} from '../../../application/port/out/repository/channel-reconciliation.repository.port';

@Injectable()
export class ChannelReconciliationQueryRepositoryAdapter
  implements ChannelReconciliationQueryRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

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

    const items = await this.hydrateItems(organizationId, rows);

    return {
      items,
      total,
      page,
      limit,
    } satisfies ReconciliationItemListResponse;
  }

  /**
   * Hydrate linked KidItem master/option names for the table view.
   * One bounded `IN (...)` per kind, avoiding N+1 reads.
   */
  async hydrateItems(
    organizationId: string,
    rows: ReconciliationRepositoryItemRow[],
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
}

function collectIds(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    if (value) set.add(value);
  }
  return [...set];
}

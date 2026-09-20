import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelListingDeletionTarget,
  ChannelListingDeletionOperationLookup,
  ChannelListingDeletionOperationStatus,
  ChannelListingDeletionUnresolvedInput,
  ChannelListingDeletionUnresolvedResult,
  ChannelListingListResult,
  ChannelListingQuery,
  ChannelListingRepositoryPort,
  ChannelListingSummary,
  ChannelListingProviderDetail,
} from '../../../application/port/out/repository/channel-listing.repository.port';
import { lockChannelListingRow } from './channel-listing-row-lock';

const listingSelect = {
  id: true,
  externalId: true,
  channelName: true,
  displayName: true,
  category: true,
  brand: true,
  manufacturer: true,
  sourceCandidateId: true,
  masterProductId: true,
  status: true,
  exposureStatus: true,
  channelAccountId: true,
  createdAt: true,
  updatedAt: true,
  channelAccount: {
    select: { id: true, channel: true, name: true },
  },
  options: {
    where: { isActive: true },
    select: {
      salePrice: true,
      inventoryComponents: {
        select: { sellpiaInventorySkuId: true },
      },
    },
  },
  contentWorkspaces: {
    where: { status: 'active', isDeleted: false },
    take: 1,
    select: {
      id: true,
      currentDetailPageArtifactId: true,
      currentDetailPageRevisionId: true,
      currentThumbnailSelection: {
        select: { contentAsset: { select: { url: true } } },
      },
    },
  },
  thumbnails: {
    where: { status: 'active' },
    orderBy: { updatedAt: 'desc' as const },
    take: 1,
    select: { imageUrl: true },
  },
} satisfies Prisma.ChannelListingSelect;

const workspaceSelect = {
  ...listingSelect,
  rawJson: true,
  contentWorkspaces: {
    where: { status: 'active', isDeleted: false, ownerType: 'channel_listing' },
    take: 1,
    select: {
      id: true,
      currentDetailPageArtifactId: true,
      currentDetailPageRevisionId: true,
      currentThumbnailSelection: {
        select: { contentAsset: { select: { url: true } } },
      },
      contentGenerationGroups: {
        where: { groupType: 'workspace_assets' },
        select: {
          originatingAssets: {
            where: {
              assetType: 'image',
              role: { in: ['primary', 'detail', 'option'] },
              isDeleted: false,
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              url: true,
              role: true,
              sortOrder: true,
              metadata: true,
            },
          },
        },
      },
    },
  },
  options: {
    where: { isActive: true },
    select: {
      externalOptionId: true,
      itemName: true,
      salePrice: true,
      sellerSku: true,
      barcode: true,
      modelNumber: true,
      status: true,
      attributesJson: true,
      rawJson: true,
      inventoryComponents: {
        select: { sellpiaInventorySkuId: true },
      },
    },
  },
} satisfies Prisma.ChannelListingSelect;

type ListingRow = Prisma.ChannelListingGetPayload<{ select: typeof listingSelect }>;
type WorkspaceListingRow = Prisma.ChannelListingGetPayload<{ select: typeof workspaceSelect }>;

function parseQueryDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
@Injectable()
export class ChannelListingRepositoryAdapter implements ChannelListingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    organizationId: string,
    query: ChannelListingQuery = {},
  ): Promise<ChannelListingListResult> {
    const page = positiveInteger(query.page, 1);
    const limit = Math.min(100, positiveInteger(query.limit, 20));
    const search = query.search?.trim();
    const includeInactive = query.includeDeleted ?? query.tab === 'deleted';
    const createdSince = parseQueryDate(query.createdSince);
    const where: Prisma.ChannelListingWhereInput = {
      organizationId,
      isActive: !includeInactive,
      ...(query.channel
        ? { channelAccount: { is: { organizationId, channel: query.channel } } }
        : {}),
      ...(query.channelAccountId ? { channelAccountId: query.channelAccountId } : {}),
      ...(createdSince ? { createdAt: { gte: createdSince } } : {}),
      ...(search
        ? {
            OR: [
              { externalId: contains(search) },
              { channelName: contains(search) },
              { displayName: contains(search) },
              { options: { some: { itemName: contains(search) } } },
              { options: { some: { sellerSku: contains(search) } } },
            ],
          }
        : {}),
    };
    /**
     * 등록 최신순은 `createdAt` 기준이다.
     *
     * 예전에는 `updatedAt` 으로 정렬했는데, 카탈로그 재수집(`channel-catalog-identity-upsert`)이
     * 배치 전체의 `updated_at` 을 NOW() 로 갱신한다. 그래서 새로 등록한 상품이 없어도
     * 목록 순서가 통째로 뒤섞였고, "최종 등록일 최신순" 이라는 라벨과도 맞지 않았다.
     * 등록 시점은 `createdAt` 만이 안정적으로 보존한다.
     */
    const orderBy: Prisma.ChannelListingOrderByWithRelationInput[] =
      query.sort === 'oldest'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : query.sort === 'name_asc'
          ? [{ displayName: 'asc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];

    const [total, rows, groupedCounts, accounts] = await this.prisma.$transaction([
      this.prisma.channelListing.count({ where }),
      this.prisma.channelListing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: listingSelect,
      }),
      this.prisma.channelListing.groupBy({
        by: ['channelAccountId'],
        where: { organizationId, isActive: !includeInactive },
        orderBy: { channelAccountId: 'asc' },
        _count: { id: true },
      }),
      this.prisma.channelAccount.findMany({
        where: { organizationId },
        select: { id: true, channel: true, name: true },
      }),
    ]);
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    return {
      items: rows.map((row) => toSummary(row)),
      total,
      page,
      limit,
      marketCounts: groupedCounts.map((group) => {
        const account = accountById.get(group.channelAccountId);
        return {
          channel: account?.channel ?? 'unknown',
          channelAccountId: group.channelAccountId,
          channelAccountName: account?.name ?? null,
          count: typeof group._count === 'object' && group._count
            ? group._count.id ?? 0
            : 0,
        };
      }),
    };
  }

  async getWorkspace(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingSummary> {
    const row = await this.prisma.channelListing.findFirst({
      where: { id: listingId, organizationId, isActive: true },
      select: workspaceSelect,
    });
    if (!row) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
    return toSummary(row, true);
  }

  async findDeletionTarget(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingDeletionTarget | null> {
    // 단일 리소스 읽기는 { id, organizationId } 스코프다. id 만으로 찾으면 IDOR 이다.
    const row = await this.prisma.channelListing.findFirst({
      where: { id: listingId, organizationId },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        channelName: true,
        channelAccountId: true,
        sourceCandidateId: true,
        isActive: true,
        channelAccount: { select: { channel: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      externalId: row.externalId,
      displayName: row.displayName ?? row.channelName,
      channel: row.channelAccount.channel,
      channelAccountId: row.channelAccountId,
      sourceCandidateId: row.sourceCandidateId,
      isActive: row.isActive,
    };
  }

  async markDeletionUnresolved(
    input: ChannelListingDeletionUnresolvedInput,
  ): Promise<ChannelListingDeletionUnresolvedResult> {
    return this.prisma.$transaction(async (tx) => {
      await assertLockedListing(tx, input.organizationId, input.listingId);
      await lockDeletionOperation(tx, input.organizationId, input.operationId);
      const operation = await tx.channelListingDeletionOperation.findFirst({
        where: { id: input.operationId, organizationId: input.organizationId, channelListingId: input.listingId },
      });
      if (!operation) throw new NotFoundException('Deletion operation not found.');
      assertOperationActor(operation.requestedByUserId, input.userId);
      if (operation.status === 'succeeded') {
        return { operationId: operation.id, status: 'succeeded', providerOutcome: 'succeeded' };
      }
      if (!['executing', 'reconciling'].includes(operation.status)) {
        throw new ConflictException('Deletion operation cannot be reconciled from its current state.');
      }
      await tx.channelListingDeletionOperation.update({
        where: { id: operation.id },
        data: {
          status: 'reconciling',
          providerOutcome: 'uncertain',
          lastErrorCode: input.reason,
          lastErrorMessage: 'Provider deletion outcome requires reconciliation.',
        },
      });
      return { operationId: operation.id, status: 'reconciling', providerOutcome: 'uncertain' };
    });
  }

  async getDeletionOperation(
    input: ChannelListingDeletionOperationLookup,
  ): Promise<ChannelListingDeletionOperationStatus | null> {
    const operation = await this.prisma.channelListingDeletionOperation.findFirst({
      where: {
        id: input.operationId,
        organizationId: input.organizationId,
        channelListingId: input.listingId,
        requestedByUserId: input.userId,
      },
    });
    if (!operation) return null;
    return {
      operationId: operation.id,
      listingId: operation.channelListingId,
      channelAccountId: operation.channelAccountId,
      expectedVendorId: operation.expectedProviderAccountId,
      externalId: operation.externalListingId,
      status: operation.status,
      providerOutcome: operation.providerOutcome,
      completedAt: operation.completedAt?.toISOString() ?? null,
      lastErrorCode: operation.lastErrorCode,
    };
  }


}

async function assertLockedListing(tx: Prisma.TransactionClient, organizationId: string, listingId: string) {
  const listing = await lockChannelListingRow(tx, {
    organizationId,
    channelListingId: listingId,
    activeOnly: false,
  });
  if (!listing) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
}

async function lockDeletionOperation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  operationId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM channel_listing_deletion_operations
    WHERE id = ${operationId}::uuid AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
}

function assertOperationActor(requestedByUserId: string | null, userId: string): void {
  if (!requestedByUserId || requestedByUserId !== userId) {
    throw new ForbiddenException('Deletion operation belongs to another actor.');
  }
}

function toSummary(
  row: ListingRow | WorkspaceListingRow,
  includeProviderDetail = false,
): ChannelListingSummary {
  const workspace = row.contentWorkspaces[0] ?? null;
  const listingName = row.displayName ?? row.channelName ?? row.externalId;
  return {
    id: row.id,
    listingName,
    thumbnailUrl:
      workspace?.currentThumbnailSelection?.contentAsset.url
      ?? row.thumbnails[0]?.imageUrl
      ?? null,
    detailPageArtifactId: workspace?.currentDetailPageArtifactId ?? null,
    detailPageRevisionId: workspace?.currentDetailPageRevisionId ?? null,
    channel: row.channelAccount.channel,
    channelAccountId: row.channelAccountId,
    channelAccountName: row.channelAccount.name,
    externalId: row.externalId,
    channelName: row.channelName,
    category: row.category,
    brand: row.brand,
    manufacturer: row.manufacturer,
    channelPrice: firstPrice(row.options),
    sourceCandidateId: row.sourceCandidateId,
    contentWorkspaceId: workspace?.id ?? null,
    status: row.status,
    exposureStatus: row.exposureStatus,
    optionCount: row.options.length,
    mappingStatus: aggregateMappingStatus(row.masterProductId, row.options),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(includeProviderDetail ? { providerDetail: buildProviderDetail(row as WorkspaceListingRow) } : {}),
  };
}

function buildProviderDetail(row: WorkspaceListingRow): ChannelListingProviderDetail {
  const listingRaw = jsonRecord(row.rawJson);
  const detailDocuments = detailDocumentsFromRaw(listingRaw);
  const optionDocumentRefs = row.options.map((option) => ({
    externalOptionId: option.externalOptionId,
    documentIds: detailDocumentIdsFromRaw(option.rawJson),
  }));
  const hasDetailEvidence = hasOwn(listingRaw, 'detailDocuments')
    || row.options.some((option) => hasOwn(jsonRecord(option.rawJson), 'detailDocumentIds'));
  const sourceDetail = hasDetailEvidence
    ? { documents: detailDocuments, options: optionDocumentRefs }
    : null;
  return {
    category: row.category,
    brand: row.brand,
    manufacturer: row.manufacturer,
    sourceDetail,
    options: row.options.map((option) => {
      const raw = jsonRecord(option.rawJson);
      return {
        externalOptionId: option.externalOptionId,
        itemName: option.itemName,
        vendorItemId: nullableString(raw?.vendorItemId),
        sellerProductItemId: nullableString(raw?.sellerProductItemId),
        salePrice: option.salePrice,
        sellerSku: option.sellerSku,
        barcode: option.barcode,
        modelNumber: option.modelNumber,
        status: option.status,
        attributes: option.attributesJson ?? null,
      };
    }),
    media: providerMediaFromWorkspace(row),
  };
}

function detailDocumentsFromRaw(raw: Record<string, unknown> | null): Array<Record<string, unknown>> {
  return Array.isArray(raw?.detailDocuments)
    ? raw.detailDocuments.flatMap((value) => {
        const document = jsonRecord(value);
        return document && typeof document.id === 'string' && typeof document.kind === 'string'
          && hasOwn(document, 'value')
          ? [document]
          : [];
      })
    : [];
}

function detailDocumentIdsFromRaw(rawValue: unknown): string[] {
  const raw = jsonRecord(rawValue);
  return Array.isArray(raw?.detailDocumentIds)
    ? raw.detailDocumentIds.filter((value): value is string =>
        typeof value === 'string' && value.trim().length > 0)
    : [];
}

function hasOwn(value: Record<string, unknown> | null, key: string): boolean {
  return value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

function providerMediaFromWorkspace(row: WorkspaceListingRow): ChannelListingProviderDetail['media'] {
  const workspace = row.contentWorkspaces[0];
  if (!workspace) return [];
  return workspace.contentGenerationGroups.flatMap((group) =>
    group.originatingAssets.flatMap((asset) => {
      const metadata = jsonRecord(asset.metadata);
      const sourceUrl = stringValue(asset.url);
      if (
        !sourceUrl
        || metadata?.active === false
        || !isChannelProviderMetadata(metadata, row.channelAccount.channel)
      ) return [];
      return [{
        sourceUrl,
        role: stringValue(asset.role) ?? 'detail',
        sortOrder: asset.sortOrder,
        externalOptionIds: optionIdsFromMetadata(metadata),
      }];
    }),
  );
}

function isChannelProviderMetadata(
  metadata: Record<string, unknown> | null,
  channel: string,
): boolean {
  if (metadata?.sourceType === 'coupang_catalog') return channel === 'coupang';
  return metadata?.sourceType === 'channel_catalog'
    && stringValue(metadata.channel) === channel;
}

function optionIdsFromMetadata(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const arrayValue = Array.isArray(metadata.externalOptionIds)
    ? metadata.externalOptionIds
    : [];
  return [...new Set([
    ...arrayValue,
    metadata.externalOptionId,
  ].filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableString(value: unknown): string | null {
  return stringValue(value);
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : fallback;
}

function contains(value: string) {
  return { contains: value, mode: Prisma.QueryMode.insensitive } as const;
}

function firstPrice(options: Array<{ salePrice: number | null }>): number | null {
  return options.find((option) => option.salePrice !== null)?.salePrice ?? null;
}

function aggregateMappingStatus(
  _masterProductId: string | null,
  options: Array<{
    inventoryComponents: Array<{ sellpiaInventorySkuId: string }>;
  }>,
): 'matched' | 'unmatched' | 'needs_review' {
  if (options.length === 0 || options.every((option) => option.inventoryComponents.length === 0)) {
    return 'unmatched';
  }
  if (options.some((option) => option.inventoryComponents.length === 0)) {
    return 'needs_review';
  }
  return 'matched';
}

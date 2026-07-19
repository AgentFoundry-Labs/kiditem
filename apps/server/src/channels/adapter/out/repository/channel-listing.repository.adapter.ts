import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelListingDeletionTarget,
  ChannelListingListResult,
  ChannelListingQuery,
  ChannelListingRepositoryPort,
  ChannelListingSummary,
} from '../../../application/port/out/repository/channel-listing.repository.port';

const listingInclude = {
  channelAccount: {
    select: { id: true, channel: true, name: true },
  },
  options: {
    where: { isActive: true },
    select: {
      productVariantId: true,
      salePrice: true,
      productVariant: {
        select: {
          components: {
            select: { sellpiaInventorySku: { select: { isActive: true } } },
          },
        },
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
} satisfies Prisma.ChannelListingInclude;

type ListingRow = Prisma.ChannelListingGetPayload<{ include: typeof listingInclude }>;

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
        include: listingInclude,
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
      items: rows.map(toSummary),
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
      include: listingInclude,
    });
    if (!row) throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
    return toSummary(row);
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

  async deactivate(organizationId: string, listingId: string): Promise<void> {
    // 하드 삭제하지 않는다. 주문/정산/광고가 이 리스팅을 참조하고 있고,
    // 기존 '삭제됨' 탭이 isActive=false 를 그대로 읽는다.
    const result = await this.prisma.channelListing.updateMany({
      where: { id: listingId, organizationId },
      data: { isActive: false, status: 'deleted' },
    });
    if (result.count !== 1) {
      throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
    }
  }
}

function toSummary(row: ListingRow): ChannelListingSummary {
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
    channelPrice: firstPrice(row.options),
    sourceCandidateId: row.sourceCandidateId,
    contentWorkspaceId: workspace?.id ?? null,
    status: row.status,
    exposureStatus: row.exposureStatus,
    optionCount: row.options.length,
    mappingStatus: aggregateMappingStatus(row.masterProductId, row.options),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
  masterProductId: string | null,
  options: Array<{
    productVariantId: string | null;
    productVariant: null | {
      components: Array<{ sellpiaInventorySku: { isActive: boolean } }>;
    };
  }>,
): 'matched' | 'unmatched' | 'needs_review' {
  if (!masterProductId) return 'unmatched';
  if (options.length === 0) return 'needs_review';
  if (options.some((option) => !option.productVariantId || !option.productVariant)) {
    return 'needs_review';
  }
  if (options.some((option) =>
    option.productVariant!.components.length === 0
    || option.productVariant!.components.some(
      (component) => !component.sellpiaInventorySku.isActive,
    ))) {
    return 'needs_review';
  }
  return 'matched';
}

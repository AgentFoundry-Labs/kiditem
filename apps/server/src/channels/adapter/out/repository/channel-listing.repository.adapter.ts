import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelListingGroupResult,
  ChannelListingListResult,
  ChannelListingQuery,
  ChannelListingRepositoryPort,
  ChannelListingSummary,
} from '../../../application/port/out/repository/channel-listing.repository.port';

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
    const page = Number.isFinite(query.page) && query.page && query.page > 0
      ? Math.floor(query.page)
      : 1;
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(query.limit) && query.limit ? Math.floor(query.limit) : 20),
    );
    const search = query.search?.trim();
    const includeDeleted = query.includeDeleted ?? query.tab === 'deleted';
    const createdSince = parseQueryDate(query.createdSince);
    const where: Prisma.ChannelListingWhereInput = {
      organizationId,
      isDeleted: includeDeleted,
      masterId: { not: null },
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.channelAccountId ? { channelAccountId: query.channelAccountId } : {}),
      ...(createdSince ? { createdAt: { gte: createdSince } } : {}),
      ...(search
        ? {
            OR: [
              { externalId: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { channelName: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { master: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
              { master: { code: { contains: search, mode: Prisma.QueryMode.insensitive } } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ChannelListingOrderByWithRelationInput[] =
      query.sort === 'oldest' ? [{ updatedAt: 'asc' as const }, { id: 'asc' as const }] :
      query.sort === 'name_asc' ? [{ master: { name: 'asc' as const } }, { updatedAt: 'desc' as const }] :
      [{ updatedAt: 'desc' as const }, { id: 'desc' as const }];

    const total = await this.prisma.channelListing.count({ where });
    const rows = await this.prisma.channelListing.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        master: {
          select: {
            id: true,
            code: true,
            name: true,
            thumbnailUrl: true,
            imageUrl: true,
            productPreparations: {
              where: {
                organizationId,
                isCurrentForMaster: true,
                isDeleted: false,
              },
              take: 1,
              select: {
                sourceCandidateId: true,
                contentWorkspaceId: true,
              },
            },
          },
        },
        channelAccount: {
          select: {
            id: true,
            channel: true,
            name: true,
            externalAccountId: true,
            vendorId: true,
            sellerId: true,
            isPrimary: true,
          },
        },
        _count: { select: { options: true } },
      },
    });
    const groupedCounts = await this.prisma.channelListing.groupBy({
      by: ['channel', 'channelAccountId'],
      where: { organizationId, isDeleted: includeDeleted, masterId: { not: null } },
      orderBy: [{ channel: 'asc' }, { channelAccountId: 'asc' }],
      _count: { id: true },
    });
    const accounts = await this.prisma.channelAccount.findMany({
      where: { organizationId },
      select: {
        id: true,
        channel: true,
        name: true,
        externalAccountId: true,
        vendorId: true,
        sellerId: true,
        isPrimary: true,
      },
    });

    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const items: ChannelListingListResult['items'] = [];
    for (const row of rows) {
      if (!row.master || !row.masterId) continue;
      const preparation = row.master.productPreparations[0] ?? null;
      items.push({
        id: row.id,
        masterId: row.masterId,
        masterCode: row.master.code,
        masterName: row.master.name,
        thumbnailUrl: row.master.thumbnailUrl ?? row.master.imageUrl ?? null,
        channel: row.channel,
        channelAccountId: row.channelAccountId,
        channelAccountName: row.channelAccount?.name ?? null,
        externalId: row.externalId,
        channelName: row.channelName,
        channelPrice: row.channelPrice,
        sourceCandidateId: preparation?.sourceCandidateId ?? null,
        contentWorkspaceId: preparation?.contentWorkspaceId ?? null,
        status: row.status,
        exposureStatus: row.exposureStatus,
        optionCount: row._count.options,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return {
      items,
      total,
      page,
      limit,
      marketCounts: groupedCounts.map((group) => {
        const account = group.channelAccountId ? accountById.get(group.channelAccountId) : null;
        const count = typeof group._count === 'object' && group._count
          ? group._count.id ?? 0
          : 0;
        return {
          channel: group.channel,
          channelAccountId: group.channelAccountId,
          channelAccountName: account?.name ?? null,
          count,
        };
      }),
    };
  }

  async listGrouped(
    organizationId: string,
    query: ChannelListingQuery = {},
  ): Promise<ChannelListingGroupResult> {
    const page = Number.isFinite(query.page) && query.page && query.page > 0
      ? Math.floor(query.page)
      : 1;
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(query.limit) && query.limit ? Math.floor(query.limit) : 20),
    );
    const search = query.search?.trim();
    const includeDeleted = query.includeDeleted ?? query.tab === 'deleted';
    const createdSince = parseQueryDate(query.createdSince);
    const listingWhere: Prisma.ChannelListingWhereInput = {
      organizationId,
      isDeleted: includeDeleted,
      masterId: { not: null },
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.channelAccountId ? { channelAccountId: query.channelAccountId } : {}),
      ...(createdSince ? { createdAt: { gte: createdSince } } : {}),
    };
    const masterWhere: Prisma.MasterProductWhereInput = {
      organizationId,
      listings: { some: listingWhere },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { code: { contains: search, mode: Prisma.QueryMode.insensitive } },
              {
                listings: {
                  some: {
                    ...listingWhere,
                    OR: [
                      { externalId: { contains: search, mode: Prisma.QueryMode.insensitive } },
                      { channelName: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.MasterProductOrderByWithRelationInput[] =
      query.sort === 'oldest' ? [{ updatedAt: 'asc' as const }, { id: 'asc' as const }] :
      query.sort === 'name_asc' ? [{ name: 'asc' as const }, { id: 'asc' as const }] :
      [{ updatedAt: 'desc' as const }, { id: 'desc' as const }];
    const [total, masters, groupedCounts, accounts] = await this.prisma.$transaction([
      this.prisma.masterProduct.count({ where: masterWhere }),
      this.prisma.masterProduct.findMany({
        where: masterWhere,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          code: true,
          name: true,
          thumbnailUrl: true,
          imageUrl: true,
          listings: {
            where: listingWhere,
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            include: {
              channelAccount: {
                select: {
                  id: true,
                  channel: true,
                  name: true,
                  externalAccountId: true,
                  vendorId: true,
                  sellerId: true,
                  isPrimary: true,
                },
              },
              _count: { select: { options: true } },
            },
          },
          productPreparations: {
            where: {
              organizationId,
              isCurrentForMaster: true,
              isDeleted: false,
            },
            take: 1,
            select: {
              sourceCandidateId: true,
              contentWorkspaceId: true,
            },
          },
        },
      }),
      this.prisma.channelListing.groupBy({
        by: ['channel', 'channelAccountId'],
        where: listingWhere,
        orderBy: [{ channel: 'asc' }, { channelAccountId: 'asc' }],
        _count: { id: true },
      }),
      this.prisma.channelAccount.findMany({
        where: { organizationId },
        select: {
          id: true,
          channel: true,
          name: true,
          externalAccountId: true,
          vendorId: true,
          sellerId: true,
          isPrimary: true,
        },
      }),
    ]);

    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const items = masters.map((master) => {
      const preparation = master.productPreparations[0] ?? null;
      const listings = master.listings.map((row) => ({
        id: row.id,
        masterId: master.id,
        masterCode: master.code,
        masterName: master.name,
        thumbnailUrl: master.thumbnailUrl ?? master.imageUrl ?? null,
        channel: row.channel,
        channelAccountId: row.channelAccountId,
        channelAccountName: row.channelAccount?.name ?? null,
        externalId: row.externalId,
        channelName: row.channelName,
        channelPrice: row.channelPrice,
        sourceCandidateId: preparation?.sourceCandidateId ?? null,
        contentWorkspaceId: preparation?.contentWorkspaceId ?? null,
        status: row.status,
        exposureStatus: row.exposureStatus,
        optionCount: row._count.options,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));
      return {
        masterId: master.id,
        masterCode: master.code,
        masterName: master.name,
        thumbnailUrl: master.thumbnailUrl ?? master.imageUrl ?? null,
        listingCount: listings.length,
        listings,
        updatedAt: listings[0]?.updatedAt ?? '',
      };
    });

    return {
      items,
      total,
      page,
      limit,
      marketCounts: groupedCounts.map((group) => {
        const account = group.channelAccountId ? accountById.get(group.channelAccountId) : null;
        const count = typeof group._count === 'object' && group._count
          ? group._count.id ?? 0
          : 0;
        return {
          channel: group.channel,
          channelAccountId: group.channelAccountId,
          channelAccountName: account?.name ?? null,
          count,
        };
      }),
    };
  }

  async getWorkspace(
    organizationId: string,
    listingId: string,
  ): Promise<ChannelListingSummary> {
    const row = await this.prisma.channelListing.findFirst({
      where: {
        id: listingId,
        organizationId,
        isDeleted: false,
        masterId: { not: null },
      },
      include: {
        master: {
          select: {
            id: true,
            code: true,
            name: true,
            thumbnailUrl: true,
            imageUrl: true,
            productPreparations: {
              where: {
                organizationId,
                isCurrentForMaster: true,
                isDeleted: false,
              },
              take: 1,
              select: {
                sourceCandidateId: true,
                contentWorkspaceId: true,
              },
            },
          },
        },
        channelAccount: {
          select: {
            id: true,
            channel: true,
            name: true,
            externalAccountId: true,
            vendorId: true,
            sellerId: true,
            isPrimary: true,
          },
        },
        _count: { select: { options: true } },
      },
    });

    if (!row || !row.master || !row.masterId) {
      throw new NotFoundException('등록 상품을 찾을 수 없습니다.');
    }

    const preparation = row.master.productPreparations[0] ?? null;
    return {
      id: row.id,
      masterId: row.masterId,
      masterCode: row.master.code,
      masterName: row.master.name,
      thumbnailUrl: row.master.thumbnailUrl ?? row.master.imageUrl ?? null,
      channel: row.channel,
      channelAccountId: row.channelAccountId,
      channelAccountName: row.channelAccount?.name ?? null,
      externalId: row.externalId,
      channelName: row.channelName,
      channelPrice: row.channelPrice,
      sourceCandidateId: preparation?.sourceCandidateId ?? null,
      contentWorkspaceId: preparation?.contentWorkspaceId ?? null,
      status: row.status,
      exposureStatus: row.exposureStatus,
      optionCount: row._count.options,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

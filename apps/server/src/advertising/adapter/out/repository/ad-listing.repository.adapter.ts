// Listing-owned advertising metadata and the Coupang extension-sync listing
// map. The outward read model keeps its historical `masterProduct` key, but
// every value now comes from ChannelListing.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AdListingRepositoryPort,
  AdSyncListingMap,
  ScopedAdListingReadModel,
} from '../../../application/port/out/repository/ad-listing.repository.port';

@Injectable()
export class AdListingRepositoryAdapter implements AdListingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findScopedAdListings(
    organizationId: string,
    listingIds: Array<string | null | undefined>,
  ): Promise<Map<string, ScopedAdListingReadModel>> {
    const ids = Array.from(
      new Set(listingIds.filter((id): id is string => Boolean(id))),
    );
    if (ids.length === 0) return new Map();

    const listings = await this.prisma.channelListing.findMany({
      where: {
        id: { in: ids },
        organizationId,
        isActive: true,
      },
      select: {
        id: true,
        externalId: true,
        channelName: true,
        displayName: true,
        abcGrade: true,
        adTier: true,
        healthScore: true,
      },
    });
    const out = new Map<string, ScopedAdListingReadModel>();
    for (const listing of listings) {
      out.set(listing.id, {
        id: listing.id,
        externalId: listing.externalId,
        channelName: listing.channelName,
        masterProduct: {
          id: listing.id,
          code: listing.externalId,
          name:
            listing.displayName ??
            listing.channelName ??
            listing.externalId,
          abcGrade: listing.abcGrade,
          adTier: listing.adTier,
          healthScore: listing.healthScore,
        },
      });
    }
    return out;
  }

  async verifyListingOwnership(
    listingId: string,
    organizationId: string,
  ): Promise<boolean> {
    const row = await this.prisma.channelListing.findFirst({
      where: { id: listingId, organizationId, isActive: true },
      select: { id: true },
    });
    return row != null;
  }

  async changeAdTier(
    listingId: string,
    organizationId: string,
    nextTier: string | null,
  ): Promise<boolean> {
    const updated = await this.prisma.channelListing.updateMany({
      where: { id: listingId, organizationId, isActive: true },
      data: { adTier: nextTier },
    });
    return updated.count === 1;
  }

  async buildAdSyncListingMap(
    organizationId: string,
  ): Promise<AdSyncListingMap> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { organizationId, channel: 'coupang', status: 'active' },
      orderBy: [
        { isPrimary: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('활성 쿠팡 채널 계정을 찾을 수 없습니다.');
    }

    const [options, listings] = await Promise.all([
      this.prisma.channelListingOption.findMany({
        where: {
          organizationId,
          isActive: true,
          listing: {
            organizationId,
            channelAccountId: account.id,
            isActive: true,
          },
        },
        select: {
          id: true,
          externalOptionId: true,
          listingId: true,
        },
      }),
      this.prisma.channelListing.findMany({
        where: {
          organizationId,
          channelAccountId: account.id,
          isActive: true,
        },
        select: { id: true, externalId: true },
      }),
    ]);

    const listingMap = new Map(
      listings.map((listing) => [listing.id, listing]),
    );
    const externalOptionIdMap: AdSyncListingMap['externalOptionIdMap'] =
      new Map();
    for (const option of options) {
      if (!option.externalOptionId) continue;
      const listing = listingMap.get(option.listingId);
      if (!listing) continue;
      externalOptionIdMap.set(option.externalOptionId, {
        listingId: option.listingId,
        listingOptionId: option.id,
        externalId: listing.externalId,
      });
    }

    const externalIdMap = new Map<string, { listingId: string }>();
    for (const listing of listings) {
      externalIdMap.set(listing.externalId, { listingId: listing.id });
    }

    return {
      channelAccountId: account.id,
      externalOptionIdMap,
      externalIdMap,
    };
  }
}

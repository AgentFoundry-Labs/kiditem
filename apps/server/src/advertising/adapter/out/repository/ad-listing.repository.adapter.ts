// Listing + master hydrated read model and the Coupang extension-sync
// listing map. Sole owner of the `ChannelListing` + `MasterProduct` join
// shape used by hub / campaign / benchmark / action read models.

import { Injectable } from '@nestjs/common';
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
        isDeleted: false,
        masterId: { not: null },
      },
      select: { id: true, externalId: true, channelName: true, masterId: true },
    });
    const linkedListings = listings.filter(
      (listing): listing is (typeof listings)[number] & { masterId: string } =>
        listing.masterId !== null,
    );
    const masterIds = Array.from(
      new Set(linkedListings.map((listing) => listing.masterId)),
    );
    const masters =
      masterIds.length > 0
        ? await this.prisma.masterProduct.findMany({
            where: { id: { in: masterIds }, organizationId },
            select: {
              id: true,
              code: true,
              name: true,
              abcGrade: true,
              adTier: true,
              healthScore: true,
            },
          })
        : [];

    const masterMap = new Map(masters.map((master) => [master.id, master]));
    const out = new Map<string, ScopedAdListingReadModel>();
    for (const listing of linkedListings) {
      if (!listing.masterId) continue;
      const master = masterMap.get(listing.masterId);
      if (!master) continue;
      out.set(listing.id, {
        id: listing.id,
        externalId: listing.externalId,
        channelName: listing.channelName,
        masterProduct: master,
      });
    }
    return out;
  }

  async verifyListingOwnership(
    listingId: string,
    organizationId: string,
  ): Promise<boolean> {
    const row = await this.prisma.channelListing.findFirst({
      where: { id: listingId, organizationId, isDeleted: false },
      select: { id: true },
    });
    return row != null;
  }

  async changeAdTier(
    listingId: string,
    organizationId: string,
    nextTier: string | null,
  ): Promise<boolean> {
    const listing = await this.prisma.channelListing.findFirst({
      where: {
        id: listingId,
        organizationId,
        isDeleted: false,
        masterId: { not: null },
      },
      select: { masterId: true },
    });
    if (!listing?.masterId) return false;
    const updated = await this.prisma.masterProduct.updateMany({
      where: { id: listing.masterId, organizationId },
      data: { adTier: nextTier },
    });
    return updated.count === 1;
  }

  async buildAdSyncListingMap(
    organizationId: string,
  ): Promise<AdSyncListingMap> {
    const [options, listings] = await Promise.all([
      this.prisma.channelListingOption.findMany({
        where: {
          organizationId,
          isActive: true,
          listing: { organizationId, channel: 'coupang', isDeleted: false },
        },
        select: {
          id: true,
          externalOptionId: true,
          listingId: true,
          optionId: true,
        },
      }),
      this.prisma.channelListing.findMany({
        where: { organizationId, isDeleted: false, channel: 'coupang' },
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
        optionId: option.optionId ?? null,
        externalId: listing.externalId,
      });
    }

    const externalIdMap = new Map<string, { listingId: string }>();
    for (const listing of listings) {
      externalIdMap.set(listing.externalId, { listingId: listing.id });
    }

    return { externalOptionIdMap, externalIdMap };
  }
}

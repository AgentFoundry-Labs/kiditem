import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ListingMap } from '../../../domain/listing-match';

export async function buildAdSyncListingMap(
  prisma: PrismaService,
  organizationId: string,
): Promise<ListingMap> {
  const [options, listings] = await Promise.all([
    prisma.channelListingOption.findMany({
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
    prisma.channelListing.findMany({
      where: { organizationId, isDeleted: false, channel: 'coupang' },
      select: { id: true, externalId: true },
    }),
  ]);

  const listingMap = new Map(listings.map((listing) => [listing.id, listing]));
  const externalOptionIdMap: ListingMap['externalOptionIdMap'] = new Map();
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

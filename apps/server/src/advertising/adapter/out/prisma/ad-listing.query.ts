import type { PrismaService } from '../../../../prisma/prisma.service';
import type { AdListingSummary } from '@kiditem/shared/advertising';

export interface ScopedAdListingReadModel {
  id: string;
  externalId: string;
  channelName: string | null;
  masterProduct: {
    id: string;
    code: string;
    name: string;
    abcGrade: string | null;
    adTier: string | null;
    healthScore: number | null;
  };
}

export interface ScopedAdListingSummary extends AdListingSummary {
  masterProduct: AdListingSummary['masterProduct'] & {
    abcGrade: string | null;
    adTier: string | null;
    healthScore: number | null;
  };
}

/**
 * Listing-id list → tenant-scoped {listing + master meta} map.
 * `organizationId` is bound on every read; soft-deleted listings are excluded.
 *
 * Sole owner of the `ChannelListing` + `MasterProduct` join shape used by
 * hub / campaign / benchmark / action read models. Mappers (`mappers/`) build
 * `AdListingSummary`-shaped values from these rows.
 */
export async function findScopedAdListings(
  prisma: PrismaService,
  organizationId: string,
  listingIds: Array<string | null | undefined>,
): Promise<Map<string, ScopedAdListingReadModel>> {
  const ids = Array.from(
    new Set(listingIds.filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) return new Map();

  const listings = await prisma.channelListing.findMany({
    where: { id: { in: ids }, organizationId, isDeleted: false },
    select: { id: true, externalId: true, channelName: true, masterId: true },
  });
  const masterIds = Array.from(new Set(listings.map((listing) => listing.masterId)));
  const masters = masterIds.length > 0
    ? await prisma.masterProduct.findMany({
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
  for (const listing of listings) {
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

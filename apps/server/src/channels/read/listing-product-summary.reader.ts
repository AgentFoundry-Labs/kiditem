import type { Prisma } from '@prisma/client';
import { listingProductIdFromRecipes } from '../domain/listing/listing-product-summary';

/** Read a derived summary; the recipe rows are its only stored authority. */
export async function readListingProductIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; listingIds: readonly string[] },
): Promise<Map<string, string | null>> {
  if (input.listingIds.length === 0) return new Map();
  const listings = await tx.channelListing.findMany({
    where: { organizationId: input.organizationId, id: { in: [...input.listingIds] } },
    select: {
      id: true,
      options: {
        where: { organizationId: input.organizationId },
        select: {
          inventoryComponents: {
            where: { organizationId: input.organizationId },
            select: { masterProductId: true },
          },
        },
      },
    },
  });
  return new Map(listings.map((listing) => [listing.id, listingProductIdFromRecipes(listing.options)]));
}

import type { Prisma } from '@prisma/client';

/**
 * Raw source markers only a catalog owner publication writes on an option: the
 * basics or details terminal of a browser import. `coupang_catalog_browser`
 * remains on rows the removed full stage wrote.
 */
const PUBLISHED_CATALOG_OPTION_SOURCES = [
  'coupang_catalog_browser',
  'coupang_catalog_basics',
  'coupang_catalog_details',
] as const;

/**
 * The one rule for a listing whose catalog identity is published, for matching
 * availability, Sellpia alias candidates, the matching row lock and readiness:
 * an operation wrote it (`lastOperationId`). Operations write ledger rows only
 * inside their finish transaction (ADR-0025), so a listing carrying one was
 * published by a finished operation. A listing only an old import run wrote is
 * not published (KID-365, ADR-0010).
 */
export const PUBLISHED_CATALOG_LISTING_WHERE = {
  lastOperationId: { not: null },
} as const satisfies Prisma.ChannelListingWhereInput;

/**
 * An active option carrying a catalog owner publication marker. It admits a
 * listing as catalog identity for matching availability, Sellpia alias
 * candidates, and the matching row lock even when no operation wrote the
 * listing.
 */
export function publishedCatalogOptionWhere(
  organizationId: string,
): Prisma.ChannelListingOptionWhereInput {
  return {
    organizationId,
    isActive: true,
    OR: PUBLISHED_CATALOG_OPTION_SOURCES.map((source) => ({
      rawJson: { path: ['source'], equals: source },
    })),
  };
}

/** Counts an account's active listings whose catalog identity is published. */
export async function countPublishedCatalogListings(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; channelAccountId: string },
): Promise<number> {
  return tx.channelListing.count({
    where: {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      isActive: true,
      ...PUBLISHED_CATALOG_LISTING_WHERE,
    },
  });
}

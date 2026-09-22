import type { Prisma } from '@prisma/client';
import type { ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';

export interface ListingWorkspaceSource {
  displayName: string | null;
  channelName: string | null;
  externalId: string;
  category: string | null;
  thumbnails: Array<{ imageUrl: string }>;
}

/** Combine Channels display facts with AI-owned thumbnail history in the caller snapshot. */
export async function readListingWorkspaceSources(
  tx: Prisma.TransactionClient,
  listings: ChannelListingQueryPort,
  organizationId: string,
  listingIds: readonly string[],
): Promise<Map<string, ListingWorkspaceSource>> {
  if (listingIds.length === 0) return new Map();
  const [facts, thumbnails] = await Promise.all([
    listings.readDisplayFacts(ownerTransaction(tx), { organizationId, listingIds }),
    tx.thumbnail.findMany({
      where: { organizationId, listingId: { in: [...listingIds] }, status: 'active' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], distinct: ['listingId'],
      select: { listingId: true, imageUrl: true },
    }),
  ]);
  const thumbnailByListing = new Map(thumbnails.map(row => [row.listingId, row.imageUrl]));
  return new Map(facts.map(row => [row.id, {
    displayName: row.displayName, channelName: row.channelName, externalId: row.externalId, category: row.category,
    thumbnails: thumbnailByListing.has(row.id) ? [{ imageUrl: thumbnailByListing.get(row.id)! }] : [],
  }]));
}

import type { Prisma } from '@prisma/client';
import type { ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { ownerTransaction } from '../../../../prisma/owner-transaction';

export interface ListingWorkspaceSource {
  displayName: string | null;
  channelName: string | null;
  externalId: string;
  category: string | null;
}

/**
 * Channels display facts for listing-owned workspaces in the caller snapshot. The listing's representative
 * image is the workspace's own current asset (KID-313 W3a); the old `thumbnails` table is gone.
 */
export async function readListingWorkspaceSources(
  tx: Prisma.TransactionClient,
  listings: ChannelListingQueryPort,
  organizationId: string,
  listingIds: readonly string[],
): Promise<Map<string, ListingWorkspaceSource>> {
  if (listingIds.length === 0) return new Map();
  const facts = await listings.readDisplayFacts(ownerTransaction(tx), { organizationId, listingIds });
  return new Map(facts.map(row => [row.id, {
    displayName: row.displayName, channelName: row.channelName, externalId: row.externalId, category: row.category,
  }]));
}

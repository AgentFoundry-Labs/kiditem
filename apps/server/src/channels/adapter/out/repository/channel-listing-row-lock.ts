import type { Prisma } from '@prisma/client';

export type LockedChannelListingRow = Readonly<{
  id: string;
  masterProductId: string | null;
}>;

export async function lockChannelListingRow(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelListingId: string;
    activeOnly: boolean;
  },
): Promise<LockedChannelListingRow | null> {
  const [listing] = await tx.$queryRaw<LockedChannelListingRow[]>`
    SELECT
      id,
      master_product_id AS "masterProductId"
    FROM channel_listings
    WHERE id = ${input.channelListingId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND (${input.activeOnly} = FALSE OR is_active = TRUE)
    FOR UPDATE
  `;
  if (!listing) return null;
  return { id: listing.id, masterProductId: listing.masterProductId };
}

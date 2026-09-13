import type { Prisma } from '@prisma/client';
import {
  completedCatalogRunWhere,
  publishedCatalogOptionWhere,
} from '../../../read/completed-catalog-run';

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
    catalogMatchingEligibleOnly: boolean;
  },
): Promise<LockedChannelListingRow | null> {
  const [listing] = await tx.$queryRaw<Array<LockedChannelListingRow & {
    channelAccountId: string;
  }>>`
    SELECT
      id,
      master_product_id AS "masterProductId",
      channel_account_id AS "channelAccountId"
    FROM channel_listings
    WHERE id = ${input.channelListingId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND (${input.activeOnly} = FALSE OR is_active = TRUE)
    FOR UPDATE
  `;
  if (!listing) return null;
  if (
    input.catalogMatchingEligibleOnly &&
    !(await isCatalogIdentity(tx, input.organizationId, listing))
  ) {
    return null;
  }
  return { id: listing.id, masterProductId: listing.masterProductId };
}

/**
 * Checked after the row lock, so a concurrent catalog publication cannot move
 * the listing's import run between this check and the caller's mutation.
 */
async function isCatalogIdentity(
  tx: Prisma.TransactionClient,
  organizationId: string,
  listing: { id: string; channelAccountId: string },
): Promise<boolean> {
  const eligible = await tx.channelListing.findFirst({
    where: {
      id: listing.id,
      organizationId,
      OR: [
        {
          lastImportRun: {
            is: completedCatalogRunWhere(organizationId, listing.channelAccountId),
          },
        },
        {
          options: {
            some: publishedCatalogOptionWhere(organizationId),
          },
        },
      ],
    },
    select: { id: true },
  });
  return eligible !== null;
}

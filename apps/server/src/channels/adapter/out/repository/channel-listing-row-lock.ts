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
    completedCatalogOnly: boolean;
  },
): Promise<LockedChannelListingRow | null> {
  const [listing] = await tx.$queryRaw<LockedChannelListingRow[]>`
    SELECT id, master_product_id AS "masterProductId"
    FROM channel_listings
    WHERE id = ${input.channelListingId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND (${input.activeOnly} = FALSE OR is_active = TRUE)
      AND (
        ${input.completedCatalogOnly} = FALSE
        OR last_import_run_id IN (
          SELECT id
          FROM source_import_runs
          WHERE organization_id = ${input.organizationId}::uuid
            AND status = 'completed'
            AND source_type IN ('coupang_wing_catalog', 'coupang_rocket_po_catalog')
        )
      )
    FOR UPDATE
  `;
  return listing ?? null;
}

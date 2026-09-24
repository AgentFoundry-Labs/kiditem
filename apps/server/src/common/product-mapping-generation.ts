import { Prisma } from '@prisma/client';

const PRODUCT_MAPPING_LOCK_PREFIX = 'kiditem.product-mapping:';

/**
 * Serializes every canonical product/Sellpia mapping identity or recipe
 * mutation for one organization. Sellpia profitability publication acquires
 * this same lock before it snapshots mappingGeneration.
 */
export async function lockProductMapping(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const lockKey = `${PRODUCT_MAPPING_LOCK_PREFIX}${organizationId}`;
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped mapping fence; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${lockKey}, 0)
    )::text AS "lock"
  `);
}

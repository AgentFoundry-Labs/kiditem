import { Prisma } from '@prisma/client';

const PRODUCT_MAPPING_LOCK_PREFIX = 'kiditem.product-mapping:';

/**
 * Serializes every canonical product/Sellpia mapping identity or recipe
 * mutation for one organization, in the caller's transaction. Products owns
 * the mapping generation; other owners take this lock before a mapping change
 * and advance the generation only through `PRODUCT_MAPPING_GENERATION_PORT`
 * (KID-111). Sellpia profitability publication takes the same key before it
 * snapshots `mappingGeneration`, so the key is a contract.
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

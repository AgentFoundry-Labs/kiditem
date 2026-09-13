import { Prisma } from '@prisma/client';

type Transaction = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Serializes this source's begin, terminal, and expiry transitions per org. */
export async function lockCompetitorCatalogSource(
  tx: Transaction,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped competitor catalog owner lock.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`kiditem.coupang-competitor-catalog:${organizationId}`}, 0)
    )::text AS "lock"
  `);
}

import { Prisma } from '@prisma/client';

type Transaction = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Serializes every mutation that can change the tracked-Wing collection
 * target. Tracker CRUD and source terminal publication intentionally share
 * this exact source-specific lock.
 */
export async function lockWingTrackedProductsSource(
  tx: Transaction,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped tracked Wing owner lock.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`kiditem.coupang-wing-tracked-products:${organizationId}`}, 0)
    )::text AS "lock"
  `);
}

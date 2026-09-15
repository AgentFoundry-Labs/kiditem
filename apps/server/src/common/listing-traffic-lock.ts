import { Prisma } from '@prisma/client';

/**
 * Serializes every writer of an organization's listing-day traffic.
 *
 * The Wing traffic source owner holds it for each attempt transition. Its
 * terminal publication reads which listing-days another writer owns before it
 * resets or zero-fills the rest, so the traffic CSV upload holds it while it
 * writes: an upload can no longer commit between that read and the
 * publication's write and be overwritten. The key is the Wing traffic owner's
 * attempt lock, and it is organization-scoped.
 */
export async function lockListingTraffic(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${organizationId}:coupang_wing_traffic`}, 0)
    )::text AS "lock"
  `);
}

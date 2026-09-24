import { Prisma } from '@prisma/client';

/**
 * Serializes every writer of an organization's listing-day traffic.
 *
 * The Wing traffic source owner holds it for each attempt transition. Its
 * terminal publication reads which listing-days another writer owns before it
 * resets or zero-fills the rest; any other writer of listing-day traffic must
 * hold it while it writes, so it cannot commit between that read and the
 * publication's write. The traffic CSV upload that used to be that writer is
 * retired (KID-110). The key is the Wing traffic owner's attempt lock, and it
 * is organization-scoped.
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

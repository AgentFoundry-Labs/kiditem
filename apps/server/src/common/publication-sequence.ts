import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Allocates the next organization/source publication generation inside the
 * caller's transaction. The advisory lock and published row must commit in
 * the same transaction, so callers retain ownership of terminal publication.
 */
export async function allocatePublicationSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceType: string,
): Promise<bigint> {
  const lockKey = `publication-sequence:${organizationId}:${sourceType}`;
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization/source-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
  const rows = await tx.$queryRaw<Array<{ publicationSequence: bigint }>>`
    SELECT COALESCE(MAX(publication_sequence), 0::bigint) + 1 AS "publicationSequence"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${sourceType}
  `;
  const sequence = rows[0]?.publicationSequence;
  if (sequence === undefined) {
    throw new ConflictException('Could not allocate publication sequence');
  }
  return sequence;
}

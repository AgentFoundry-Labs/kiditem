import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import type { Prisma } from '@prisma/client';

/**
 * Reads completion provenance from Core's shared import history. This is the
 * last completed import, not proof that a source's current facts cover a period.
 * Each source owner retains its publication and current-generation policy.
 */
export async function readLastCompletedSourceImports(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<ReadonlyMap<string, Date>> {
  const rows = await tx.sourceImportRun.groupBy({
    by: ['sourceType'],
    where: { organizationId, status: SOURCE_IMPORT_RUN_COMPLETED_STATUS, importedAt: { not: null } },
    _max: { importedAt: true },
  });
  return new Map(rows.flatMap((row) =>
    row._max.importedAt === null ? [] : [[row.sourceType, row._max.importedAt] as const],
  ));
}

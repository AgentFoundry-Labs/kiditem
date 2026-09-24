import type { Prisma } from '@prisma/client';

/**
 * Advances the Products-owned mapping-evidence generation in the caller's
 * transaction.
 * An absent state is initialized without selecting a formula or publishing
 * any ABC output. Callers must invoke this only after a canonical mapping
 * mutation has succeeded.
 */
export async function advanceProductMappingGeneration(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const state = await tx.masterProductAbcFormulaState.upsert({
    where: { organizationId },
    create: {
      organizationId,
      mappingGeneration: 1n,
    },
    update: {
      mappingGeneration: { increment: 1 },
    },
    select: { mappingGeneration: true },
  });
  return state.mappingGeneration;
}

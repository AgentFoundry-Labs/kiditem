import type { Prisma } from '@prisma/client';

export function readCurrentLaunchCandidates(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    supplierOfferSkuSnapshotIds?: string[];
    productConceptVersionKey?: string;
    limit?: number;
  },
) {
  return tx.sourcingLaunchCandidate.findMany({
    where: {
      organizationId: input.organizationId,
      supersededByLaunchCandidate: null,
      ...(input.supplierOfferSkuSnapshotIds
        ? { supplierOfferSkuSnapshotId: { in: input.supplierOfferSkuSnapshotIds } }
        : {}),
      ...(input.productConceptVersionKey
        ? { productConceptVersionKey: input.productConceptVersionKey }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit,
  });
}

export function readExactLaunchCandidatesByIds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; ids: string[] },
) {
  if (input.ids.length === 0) return Promise.resolve([]);
  return tx.sourcingLaunchCandidate.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: input.ids },
    },
  });
}

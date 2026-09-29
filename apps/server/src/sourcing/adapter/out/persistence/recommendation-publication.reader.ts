import type { Prisma } from '@prisma/client';

export const recommendationGraphInclude = {
  items: {
    orderBy: [{ rank: 'asc' }, { itemKey: 'asc' }],
    include: {
      evidence: {
        orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
        select: { evidenceObservationId: true },
      },
    },
  },
} satisfies Prisma.SourcingRecommendationRunInclude;

export function readExactRecommendationRun(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; id: string },
) {
  return tx.sourcingRecommendationRun.findFirst({
    where: input,
    include: recommendationGraphInclude,
  });
}

export function readCurrentRecommendationRun(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; now: Date },
) {
  return tx.sourcingRecommendationRun.findFirst({
    where: {
      organizationId: input.organizationId,
      status: { in: ['complete', 'partial'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
    },
    orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    include: recommendationGraphInclude,
  });
}

export function readRecommendationRunByManifest(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    policyKey: string;
    policyVersion: string;
    modelVersion: string;
    calculationVersion: string;
    inputManifestHash: string;
  },
) {
  return tx.sourcingRecommendationRun.findFirst({
    where: input,
    include: recommendationGraphInclude,
  });
}

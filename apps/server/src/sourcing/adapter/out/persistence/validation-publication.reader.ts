import type { Prisma } from '@prisma/client';

export const validationEpisodeViewInclude = {
  recommendationItem: {
    select: {
      itemKey: true,
      displayName: true,
      sourceSnapshot: true,
    },
  },
  checks: {
    orderBy: [{ checkKey: 'asc' }, { id: 'asc' }],
    select: {
      checkKey: true,
      status: true,
      summary: true,
    },
  },
} satisfies Prisma.SourcingValidationEpisodeInclude;

export function readValidationEpisodePage(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    recommendationRunId: string;
    limit: number;
    cursor?: { updatedAt: Date; id: string } | null;
  },
) {
  return tx.sourcingValidationEpisode.findMany({
    where: {
      organizationId: input.organizationId,
      recommendationRunId: input.recommendationRunId,
      ...(input.cursor && {
        OR: [
          { updatedAt: { lt: input.cursor.updatedAt } },
          { updatedAt: input.cursor.updatedAt, id: { lt: input.cursor.id } },
        ],
      }),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
    include: validationEpisodeViewInclude,
  });
}

export function readValidationEpisodesForReviewItems(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    recommendationRunId: string;
    recommendationItemIds: string[];
  },
) {
  if (input.recommendationItemIds.length === 0) return Promise.resolve([]);
  return tx.sourcingValidationEpisode.findMany({
    where: {
      organizationId: input.organizationId,
      recommendationRunId: input.recommendationRunId,
      recommendationItemId: { in: input.recommendationItemIds },
    },
    select: { id: true, recommendationItemId: true },
  });
}

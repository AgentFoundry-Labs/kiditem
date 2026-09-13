import type { Prisma } from '@prisma/client';

export const decisionItemInclude = {
  evidence: {
    orderBy: [{ ordinal: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.SourcingDecisionBatchItemInclude;

export const decisionItemWithBatchInclude = {
  ...decisionItemInclude,
  decisionBatch: {
    select: { status: true, expiresAt: true },
  },
} satisfies Prisma.SourcingDecisionBatchItemInclude;

export const decisionBatchInclude = {
  items: {
    orderBy: [{ rank: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.SourcingDecisionBatchInclude;

export function readDecisionBatchByIdempotencyKey(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; idempotencyKey: string },
) {
  return tx.sourcingDecisionBatch.findUnique({
    where: { organizationId_idempotencyKey: input },
    include: decisionBatchInclude,
  });
}

export function readExactDecisionBatch(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; id: string },
) {
  return tx.sourcingDecisionBatch.findFirst({
    where: input,
    include: decisionBatchInclude,
  });
}

export function readLatestDecisionBatch(
  tx: Prisma.TransactionClient,
  input: { organizationId: string },
) {
  return tx.sourcingDecisionBatch.findFirst({
    where: input,
    orderBy: [{ decisionAt: 'desc' }, { createdAt: 'desc' }],
    include: decisionBatchInclude,
  });
}

export function readExactDecisionBatchItem(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; id: string },
) {
  return tx.sourcingDecisionBatchItem.findFirst({
    where: input,
    include: decisionItemWithBatchInclude,
  });
}

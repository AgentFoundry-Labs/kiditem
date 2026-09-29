import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { MALL_ORDERS_KIND } from '@kiditem/shared/orders-operations';

// Operation rows are written only by common/operation in production (ADR-0025); tests seed them here.

/**
 * A succeeded `orders.mall_orders` operation as the operation contract leaves
 * it, declaring that the mall showed every order of [startDate, endDate]
 * (`result.coverage`). Tests may write operation rows; owner code may not.
 */
export async function seedMallOrderCoverageOperation(
  prisma: Pick<PrismaClient, 'operation'>,
  opts: {
    organizationId: string;
    channelAccountId: string;
    mallKey: string;
    startDate: string;
    endDate: string;
  },
): Promise<string> {
  const finishedAt = new Date(`${opts.endDate}T15:00:00.000Z`);
  const operation = await prisma.operation.create({
    data: {
      organizationId: opts.organizationId,
      kind: MALL_ORDERS_KIND,
      status: 'succeeded',
      token: randomUUID(),
      expiresAt: finishedAt,
      startedAt: finishedAt,
      finishedAt,
      attempts: 1,
      plan: { channelAccountId: opts.channelAccountId, mallKey: opts.mallKey },
      result: {
        rowCount: 0,
        mallKey: opts.mallKey,
        captured: 0,
        coverage: { startDate: opts.startDate, endDate: opts.endDate },
      },
      windowStart: new Date(`${opts.startDate}T00:00:00.000Z`),
      windowEnd: new Date(`${opts.endDate}T00:00:00.000Z`),
    },
    select: { id: true },
  });
  return operation.id;
}

/** Narrow a seeded mall order coverage operation so it no longer covers the days before `startDate`. */
export async function narrowMallOrderCoverageStart(
  prisma: Pick<PrismaClient, 'operation'>,
  input: { organizationId: string; operationId: string; startDate: string },
): Promise<void> {
  const operation = await prisma.operation.findFirstOrThrow({
    where: { id: input.operationId, organizationId: input.organizationId },
    select: { result: true },
  });
  const result = operation.result as { coverage: { startDate: string; endDate: string } } & Record<string, unknown>;
  await prisma.operation.update({
    where: { id: input.operationId },
    data: {
      result: { ...result, coverage: { ...result.coverage, startDate: input.startDate } },
      windowStart: new Date(`${input.startDate}T00:00:00.000Z`),
    },
  });
}

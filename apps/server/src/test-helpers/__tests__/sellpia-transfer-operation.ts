import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { SELLPIA_ORDER_TRANSFER_KIND } from '@kiditem/shared/orders-action-operations';

// Operation rows are written only by common/operation in production (ADR-0025); tests seed them here.

/**
 * An `orders.sellpia_order_transfer` operation for one source file, as the operation contract leaves it.
 * `executing` stays leased for an hour after `startedAt`; a terminal status carries `finishedAt`.
 */
export async function seedSellpiaTransferOperation(
  prisma: Pick<PrismaClient, 'operation'>,
  opts: {
    organizationId: string;
    sourceOperationId: string;
    transport: 'SHIPMENT' | 'MILKRUN' | null;
    status: 'executing' | 'reconciling' | 'succeeded' | 'failed' | 'cancelled';
    startedAt: Date;
    /** 성공 result의 접수 번호(기본 `['1001']`). */
    acceptedOrderNumbers?: string[];
  },
): Promise<string> {
  const terminal = opts.status !== 'executing';
  const finishedAt = terminal ? new Date(opts.startedAt.getTime() + 60_000) : null;
  const operation = await prisma.operation.create({
    data: {
      organizationId: opts.organizationId,
      kind: SELLPIA_ORDER_TRANSFER_KIND,
      status: opts.status,
      token: randomUUID(),
      expiresAt: new Date(opts.startedAt.getTime() + 60 * 60_000),
      startedAt: opts.startedAt,
      finishedAt,
      attempts: 1,
      plan: {
        sourceOperationId: opts.sourceOperationId,
        shopName: '쿠팡 로켓',
        transport: opts.transport,
        resendOf: null,
        fileName: 'transfer.xlsx',
        targetOrderNumbers: ['1001'],
      },
      result: opts.status === 'succeeded'
        ? { outcome: 'submitted', acceptedOrderNumbers: opts.acceptedOrderNumbers ?? ['1001'], targetOrderCount: (opts.acceptedOrderNumbers ?? ['1001']).length }
        : undefined,
    },
    select: { id: true },
  });
  return operation.id;
}

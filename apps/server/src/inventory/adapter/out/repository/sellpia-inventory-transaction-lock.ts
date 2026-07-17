import { Prisma } from '@prisma/client';

const SELLPIA_INVENTORY_SOURCE_TYPE = 'sellpia_inventory';

export async function lockSellpiaInventoryTransaction(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const lockKey = `inventory-sellpia:${organizationId}:${SELLPIA_INVENTORY_SOURCE_TYPE}`;
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
}

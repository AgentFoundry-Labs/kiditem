import type { Prisma } from '@prisma/client';

// Inventory's Sellpia advisory lock. Snapshot publication, import attempts,
// freshness changes and every availability read serialize on it. The caller
// takes it inside its own transaction; readers only receive the evidence.

const SELLPIA_INVENTORY_SOURCE_TYPE = 'sellpia_inventory';

declare const sellpiaInventoryLockBrand: unique symbol;

/**
 * Evidence that `tx` holds the Sellpia inventory lock of `organizationId`.
 * Only `lockSellpiaInventory` issues it.
 */
export type SellpiaInventoryLock = Readonly<{
  [sellpiaInventoryLockBrand]: true;
  tx: Prisma.TransactionClient;
  organizationId: string;
}>;

/** Takes the lock for the rest of `tx` and returns the evidence of it. */
export async function lockSellpiaInventory(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<SellpiaInventoryLock> {
  const lockKey = `inventory-sellpia:${organizationId}:${SELLPIA_INVENTORY_SOURCE_TYPE}`;
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
  return Object.freeze({ tx, organizationId }) as SellpiaInventoryLock;
}

/** Throws unless `lock` was taken in this very transaction for this organization. */
export function assertSellpiaInventoryLockCovers(
  lock: SellpiaInventoryLock,
  tx: Prisma.TransactionClient,
  organizationId: string,
): void {
  if (lock.tx !== tx) {
    throw new Error('Sellpia inventory lock was taken in another transaction');
  }
  if (lock.organizationId !== organizationId) {
    throw new Error('Sellpia inventory lock was taken for another organization');
  }
}

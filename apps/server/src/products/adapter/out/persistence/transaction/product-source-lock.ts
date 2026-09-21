import type { Prisma } from '@prisma/client';

// Inventory's Sellpia advisory lock. Snapshot publication, import attempts,
// freshness changes and every availability read serialize on it. The caller
// takes it inside its own transaction; readers only receive the evidence.

const PRODUCT_SOURCE_TYPE = 'sellpia_inventory';

/**
 * Evidence that `tx` holds the Product source lock of `organizationId`.
 * Only `lockProductSource` issues it. The class is not exported and its
 * private brand does not survive a spread, so a copy is neither assignable to
 * this type nor accepted at run time.
 */
class ProductSourceLock {
  readonly #issuedByLockSellpiaInventory = true;

  constructor(
    readonly tx: Prisma.TransactionClient,
    readonly organizationId: string,
  ) {
    Object.freeze(this);
  }
}

export type { ProductSourceLock };

const issuedLocks = new WeakSet<ProductSourceLock>();

/**
 * Takes the lock for the rest of `tx` and returns the evidence of it. `tx`
 * must be an interactive transaction client: on the root client the advisory
 * lock ends with its own statement, so a client that still has `$connect` is
 * refused before the lock is requested.
 * The evidence belongs to the transaction client that took it, so a nested
 * transaction takes its own.
 */
export async function lockProductSource(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<ProductSourceLock> {
  // `typeof`, not `in`: the `in` check can throw on Prisma's client proxies.
  if (typeof (tx as { $connect?: unknown }).$connect === 'function') {
    throw new Error(
      "lockProductSource needs the caller's interactive transaction client; a root client releases the advisory lock immediately.",
    );
  }
  const lockKey = `products-sellpia:${organizationId}:${PRODUCT_SOURCE_TYPE}`;
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
  `;
  const lock = new ProductSourceLock(tx, organizationId);
  issuedLocks.add(lock);
  return lock;
}

/**
 * Throws unless `lock` is evidence `lockProductSource` issued, taken in
 * this very transaction for this organization.
 */
export function assertProductSourceLockCovers(
  lock: ProductSourceLock,
  tx: Prisma.TransactionClient,
  organizationId: string,
): void {
  if (!issuedLocks.has(lock)) {
    throw new Error('Product source lock evidence was not issued by lockProductSource');
  }
  if (lock.tx !== tx) {
    throw new Error('Product source lock was taken in another transaction');
  }
  if (lock.organizationId !== organizationId) {
    throw new Error('Product source lock was taken for another organization');
  }
}

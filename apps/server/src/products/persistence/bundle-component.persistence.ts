// apps/server/src/products/persistence/bundle-component.persistence.ts
import { BundleComponent, Prisma } from '@prisma/client';

/**
 * Tenant-scoped persistence helpers for `BundleComponent` rows. The
 * row-lock helper lives in `bundle-stock.persistence.ts` (canonical owner
 * per ADR-0014) and is re-exported here for ergonomic import in the
 * component CRUD orchestration.
 */
export { lockBundleOptionRow } from './bundle-stock.persistence';

export async function findBundleComponentForTenant(
  tx: Prisma.TransactionClient,
  id: string,
  companyId: string,
): Promise<BundleComponent | null> {
  return tx.bundleComponent.findFirst({ where: { id, companyId } });
}

export async function createBundleComponent(
  tx: Prisma.TransactionClient,
  data: {
    bundleOptionId: string;
    componentOptionId: string;
    qty: number;
    /**
     * Always derived from `bundleOption.companyId` (3-way invariant), not
     * the auth caller's companyId.
     */
    companyId: string;
  },
): Promise<BundleComponent> {
  return tx.bundleComponent.create({ data });
}

/**
 * Scoped qty update. Returns row count so the caller can map a 0-count to
 * `NotFoundException` (cross-tenant attempt or row already gone).
 */
export async function updateBundleComponentQty(
  tx: Prisma.TransactionClient,
  id: string,
  companyId: string,
  qty: number,
): Promise<number> {
  const { count } = await tx.bundleComponent.updateMany({
    where: { id, companyId },
    data: { qty },
  });
  return count;
}

export async function deleteBundleComponentScoped(
  tx: Prisma.TransactionClient,
  id: string,
  companyId: string,
): Promise<number> {
  const { count } = await tx.bundleComponent.deleteMany({
    where: { id, companyId },
  });
  return count;
}

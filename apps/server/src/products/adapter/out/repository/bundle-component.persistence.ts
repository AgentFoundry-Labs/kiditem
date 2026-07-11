// apps/server/src/products/adapter/out/repository/bundle-component.persistence.ts
import { BundleComponent, Prisma } from '@prisma/client';

/**
 * Tenant-scoped persistence helpers for `BundleComponent` rows.
 */

export async function lockBundleOptionRow(
  tx: Prisma.TransactionClient,
  bundleOptionId: string,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM product_options
    WHERE id = ${bundleOptionId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
}

export async function findBundleComponentForTenant(
  tx: Prisma.TransactionClient,
  id: string,
  organizationId: string,
): Promise<BundleComponent | null> {
  return tx.bundleComponent.findFirst({ where: { id, organizationId } });
}

export async function createBundleComponent(
  tx: Prisma.TransactionClient,
  data: {
    bundleOptionId: string;
    componentOptionId: string;
    qty: number;
    /**
     * Always derived from `bundleOption.organizationId` (3-way invariant), not
     * the auth caller's organizationId.
     */
    organizationId: string;
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
  organizationId: string,
  qty: number,
): Promise<number> {
  const { count } = await tx.bundleComponent.updateMany({
    where: { id, organizationId },
    data: { qty },
  });
  return count;
}

export async function deleteBundleComponentScoped(
  tx: Prisma.TransactionClient,
  id: string,
  organizationId: string,
): Promise<number> {
  const { count } = await tx.bundleComponent.deleteMany({
    where: { id, organizationId },
  });
  return count;
}

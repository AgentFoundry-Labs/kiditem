// apps/server/src/products/adapter/out/prisma/bundle-stock.persistence.ts
import { Prisma } from '@prisma/client';

/**
 * Tenant-scoped persistence helpers for the bundle option row and its
 * derived `availableStock`. ADR-0014 names `BundleStockService` as the only
 * writer of `availableStock`; these helpers are the canonical home for the
 * row-lock SQL and the scoped writes that enforce that invariant.
 *
 * All helpers take a `Prisma.TransactionClient` (or a base client typed as
 * one in tests) so the row-lock + read + write window stays inside a single
 * transaction.
 */

/**
 * Acquire a row-level lock on the bundle's `product_options` row. Must run
 * inside a `$transaction` — a bare `$queryRaw` on a non-transactional client
 * auto-commits and releases the lock immediately, defeating the
 * serialization guarantee.
 *
 * Tenant predicate `organization_id = ${organizationId}::uuid` is bound, satisfying
 * the raw-SQL tenant predicate rule (apps/server/AGENTS.md "Reconstruction
 * Guardrails").
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

export async function findBundleOptionId(
  tx: Prisma.TransactionClient,
  bundleOptionId: string,
  organizationId: string,
): Promise<{ id: string } | null> {
  return tx.productOption.findFirst({
    where: { id: bundleOptionId, organizationId, isDeleted: false },
    select: { id: true },
  });
}

export interface ActiveBundleComponentRow {
  id: string;
  qty: number;
  componentOption: {
    isDeleted: boolean;
    inventory: { currentStock: number } | null;
  };
}

export async function listActiveBundleComponentsWithStock(
  tx: Prisma.TransactionClient,
  bundleOptionId: string,
  organizationId: string,
): Promise<ActiveBundleComponentRow[]> {
  return tx.bundleComponent.findMany({
    where: {
      organizationId,
      bundleOptionId,
      componentOption: { isDeleted: false },
    },
    include: { componentOption: { include: { inventory: true } } },
  }) as unknown as Promise<ActiveBundleComponentRow[]>;
}

/**
 * Scoped write of the materialized `availableStock`. Returns `count` so the
 * caller can surface a 404 when the bundle row vanished mid-transaction.
 */
export async function writeBundleAvailableStock(
  tx: Prisma.TransactionClient,
  bundleOptionId: string,
  organizationId: string,
  capacity: number,
): Promise<number> {
  const { count } = await tx.productOption.updateMany({
    where: { id: bundleOptionId, organizationId },
    data: { availableStock: capacity },
  });
  return count;
}

/**
 * Reverse lookup for fan-out: every bundle that references this option as a
 * component. Soft-deleted component rows are excluded by relation filter.
 */
export async function listBundlesUsingComponent(
  tx: Prisma.TransactionClient,
  componentOptionId: string,
  organizationId: string,
): Promise<{ bundleOptionId: string }[]> {
  return tx.bundleComponent.findMany({
    where: {
      organizationId,
      componentOptionId,
      componentOption: { isDeleted: false },
    },
    select: { bundleOptionId: true },
  });
}

// apps/server/src/products/application/service/bundle-stock.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeBundleCapacity } from '../../domain/service/bundle-stock-capacity';
import {
  findBundleOptionId,
  listActiveBundleComponentsWithStock,
  listBundlesUsingComponent,
  lockBundleOptionRow,
  writeBundleAvailableStock,
} from '../../adapter/out/prisma/bundle-stock.persistence';

/**
 * Recompute the materialized `availableStock` for a bundle option.
 *
 * Invariant (ADR-0014): `availableStock` is **only** written here.
 * `OptionsService.update` strips it from its payload (SYSTEM_FIELDS) and
 * the persistence helpers in `bundle-stock.persistence.ts` are used by no
 * other service.
 *
 * Algorithm (orchestration only — domain math + Prisma calls live in helpers):
 *   1. Acquire row-level lock on the bundle option (serialize concurrent recompute).
 *   2. Confirm the bundle option exists for this tenant (404 otherwise).
 *   3. Load active (non-soft-deleted) bundle components + inventory.
 *   4. Pure capacity calculation in `computeBundleCapacity`.
 *   5. Scoped write of `availableStock`.
 *
 * Compose-able: accepts optional outer transaction (Plan B2 bundle component
 * CRUD calls this inside its own `$transaction`). When no `outerTx` is given
 * we wrap the body in a fresh `$transaction` so the `SELECT … FOR UPDATE`
 * row lock is actually held while we read components + write
 * `availableStock` — a bare `$queryRaw` on a non-transactional client
 * auto-commits and releases the lock immediately, defeating the
 * serialization guarantee.
 */
@Injectable()
export class BundleStockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param organizationId      - tenant that owns the bundle option.
   * @param bundleOptionId - bundle option row whose `availableStock` to materialize.
   * @param outerTx        - optional outer transaction (Plan B2 compose). Caller
   *                         must supply `{ timeout: >= 15000 }` on the outer
   *                         `$transaction` so cold-cache writes don't time out.
   */
  async recompute(
    organizationId: string,
    bundleOptionId: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<number> {
    const exec = async (tx: Prisma.TransactionClient): Promise<number> => {
      await lockBundleOptionRow(tx, bundleOptionId, organizationId);
      const bundle = await findBundleOptionId(tx, bundleOptionId, organizationId);
      if (!bundle) throw new NotFoundException('bundle option not found');
      const components = await listActiveBundleComponentsWithStock(
        tx,
        bundleOptionId,
        organizationId,
      );
      const capacity = computeBundleCapacity(
        components.map((c) => ({
          qty: c.qty,
          currentStock: c.componentOption.inventory?.currentStock ?? null,
        })),
      );
      const count = await writeBundleAvailableStock(
        tx,
        bundleOptionId,
        organizationId,
        capacity,
      );
      if (count === 0) throw new NotFoundException('bundle option not found');
      return capacity;
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  /**
   * Fan-out: every active bundle that uses this option as a component gets a
   * recompute. Returns the affected bundle option ids.
   *
   * - `BundleComponent` is hard-deleted (no `isDeleted` field on the row).
   * - `componentOption.isDeleted = true` is excluded by relation filter.
   * - Nested bundles are forbidden by `BundleComponentsService.create`,
   *   so the fan-out is non-recursive and terminates.
   *
   * ADR-0014: `InventoryService` is the sole external caller. No other
   * module is allowed to invoke this method.
   */
  async recomputeForComponent(
    organizationId: string,
    componentOptionId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string[]> {
    const components = await listBundlesUsingComponent(
      tx,
      componentOptionId,
      organizationId,
    );
    for (const { bundleOptionId } of components) {
      await this.recompute(organizationId, bundleOptionId, tx);
    }
    return components.map((c) => c.bundleOptionId);
  }
}

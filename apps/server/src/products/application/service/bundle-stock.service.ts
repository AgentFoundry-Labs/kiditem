// apps/server/src/products/application/service/bundle-stock.service.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { computeBundleCapacity } from '../../domain/service/bundle-stock-capacity';
import type { ProductBundleStockPort } from '../port/in/bundle-stock.port';
import {
  PRODUCT_BUNDLE_REPOSITORY_PORT,
  type ProductBundleRepositoryPort,
} from '../port/out/repository/product-bundle.repository.port';
import {
  PRODUCTS_TRANSACTION_PORT,
  type ProductsRepositoryTransaction,
  type ProductsTransactionPort,
} from '../port/out/transaction/products-transaction.port';

/**
 * Recompute the materialized `availableStock` for a bundle option.
 *
 * Invariant: `availableStock` is **only** written here.
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
export class BundleStockService implements ProductBundleStockPort {
  constructor(
    @Inject(PRODUCT_BUNDLE_REPOSITORY_PORT)
    private readonly bundles: ProductBundleRepositoryPort,
    @Inject(PRODUCTS_TRANSACTION_PORT)
    private readonly transactions: ProductsTransactionPort,
  ) {}

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
    outerTx?: ProductsRepositoryTransaction,
  ): Promise<number> {
    const exec = async (tx: ProductsRepositoryTransaction): Promise<number> => {
      await this.bundles.lockBundleOptionRow(tx, bundleOptionId, organizationId);
      const bundle = await this.bundles.findBundleOptionId(tx, bundleOptionId, organizationId);
      if (!bundle) throw new NotFoundException('bundle option not found');
      const components = await this.bundles.listActiveBundleComponentsWithStock(
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
      const count = await this.bundles.writeBundleAvailableStock(
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
      : this.transactions.run(exec, { timeout: 15000 });
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
   * `InventoryService` is the sole external caller. No other
   * module is allowed to invoke this method.
   */
  async recomputeForComponent(
    organizationId: string,
    componentOptionId: string,
    tx: ProductsRepositoryTransaction,
  ): Promise<string[]> {
    const components = await this.bundles.listBundlesUsingComponent(
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

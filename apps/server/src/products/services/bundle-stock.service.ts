// apps/server/src/products/services/bundle-stock.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Recompute the materialized `availableStock` for a bundle option.
 *
 * Invariant: `availableStock` is **only** written here. `OptionsService.update`
 * explicitly strips `availableStock` from its payload (SYSTEM_FIELDS).
 *
 * Algorithm:
 *   1. Acquire row-level lock on the bundle option (serialize concurrent recompute).
 *   2. Fetch active (non-soft-deleted) bundle components + their inventory.
 *   3. Empty / all-soft-deleted → capacity = 0. Else → min(floor(stock / qty)).
 *   4. Update product_options.available_stock.
 *
 * Compose-able: accepts optional outer transaction (Plan B2 bundle component CRUD
 * calls this inside its own `$transaction`). **When no `outerTx` is given we wrap
 * the body in a fresh `$transaction` so the `SELECT ... FOR UPDATE` row lock is
 * actually held while we read components + write `availableStock` — a bare
 * `$queryRaw` on a non-transactional client auto-commits and releases the lock
 * immediately, defeating the serialization guarantee (quality-reviewer CRITICAL).**
 */
@Injectable()
export class BundleStockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param bundleOptionId - bundle option row whose `availableStock` to materialize.
   * @param outerTx        - optional outer transaction (Plan B2 compose). Caller is
   *                         responsible for supplying `{ timeout: >= 15000 }` on the
   *                         outer `$transaction` so cold-cache writes don't time out.
   */
  async recompute(
    bundleOptionId: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<number> {
    const exec = async (tx: Prisma.TransactionClient): Promise<number> => {
      // Row-level lock — serializes concurrent recompute on the same bundle.
      // Must run inside a transaction; otherwise auto-commit releases the lock
      // before the subsequent findMany/update and we lose the serialization.
      await tx.$queryRaw`SELECT id FROM product_options WHERE id = ${bundleOptionId}::uuid FOR UPDATE`;
      const components = await tx.bundleComponent.findMany({
        where: {
          bundleOptionId,
          componentOption: { isDeleted: false },
        },
        include: { componentOption: { include: { inventory: true } } },
      });
      const capacity = components.length === 0
        ? 0
        : Math.min(
            ...components.map(c => {
              const stock = c.componentOption.inventory?.currentStock ?? 0;
              return Math.floor(stock / c.qty);
            }),
          );
      await tx.productOption.update({
        where: { id: bundleOptionId },
        data: { availableStock: capacity },
      });
      return capacity;
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }
}

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
 *   3. Empty / all-soft-deleted → 0. Else → min(floor(inventory.currentStock / qty)).
 *   4. Update product_options.available_stock.
 *
 * Compose-able: accepts optional outer transaction (Plan B2 bundle component CRUD
 * calls this inside its own `$transaction`).
 */
@Injectable()
export class BundleStockService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(
    bundleOptionId: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = outerTx ?? this.prisma;
    // Row-level lock — serializes concurrent recompute on the same bundle.
    await db.$queryRaw`SELECT id FROM product_options WHERE id = ${bundleOptionId}::uuid FOR UPDATE`;
    const components = await db.bundleComponent.findMany({
      where: {
        bundleOptionId,
        componentOption: { isDeleted: false },
      },
      include: { componentOption: { include: { inventory: true } } },
    });
    if (components.length === 0) {
      await db.productOption.update({
        where: { id: bundleOptionId },
        data: { availableStock: 0 },
      });
      return 0;
    }
    const capacity = Math.min(
      ...components.map(c => {
        const stock = c.componentOption.inventory?.currentStock ?? 0;
        return Math.floor(stock / c.qty);
      }),
    );
    await db.productOption.update({
      where: { id: bundleOptionId },
      data: { availableStock: capacity },
    });
    return capacity;
  }
}

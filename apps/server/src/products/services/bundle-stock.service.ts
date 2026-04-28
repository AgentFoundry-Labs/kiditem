// apps/server/src/products/services/bundle-stock.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
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
   * @param companyId      - tenant that owns the bundle option.
   * @param bundleOptionId - bundle option row whose `availableStock` to materialize.
   * @param outerTx        - optional outer transaction (Plan B2 compose). Caller is
   *                         responsible for supplying `{ timeout: >= 15000 }` on the
   *                         outer `$transaction` so cold-cache writes don't time out.
   */
  async recompute(
    companyId: string,
    bundleOptionId: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<number> {
    const exec = async (tx: Prisma.TransactionClient): Promise<number> => {
      // Row-level lock — serializes concurrent recompute on the same bundle.
      // Must run inside a transaction; otherwise auto-commit releases the lock
      // before the subsequent findMany/update and we lose the serialization.
      await tx.$queryRaw`
        SELECT id FROM product_options
        WHERE id = ${bundleOptionId}::uuid
          AND company_id = ${companyId}::uuid
        FOR UPDATE
      `;
      const bundle = await tx.productOption.findFirst({
        where: { id: bundleOptionId, companyId, isDeleted: false },
        select: { id: true },
      });
      if (!bundle) throw new NotFoundException('bundle option not found');
      const components = await tx.bundleComponent.findMany({
        where: {
          companyId,
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
      const { count } = await tx.productOption.updateMany({
        where: { id: bundleOptionId, companyId },
        data: { availableStock: capacity },
      });
      if (count === 0) throw new NotFoundException('bundle option not found');
      return capacity;
    };
    return outerTx
      ? exec(outerTx)
      : this.prisma.$transaction(exec, { timeout: 15000 });
  }

  /**
   * 이 option 을 component 로 쓰는 모든 활성 bundle option 에 대해
   * recompute(companyId, bundleOptionId, tx) 를 호출. 반환값은 갱신된 bundle option id 리스트.
   *
   * - BundleComponent 는 hard-delete (isDeleted 필드 없음)
   * - componentOption soft-delete 는 fan-out 에서 제외
   * - nested bundle 금지 (BundleComponentsService.create 차단) → 비재귀 종료 보장
   *
   * ADR-0014: InventoryService 전용. 다른 모듈은 호출 금지.
   */
  async recomputeForComponent(
    companyId: string,
    componentOptionId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string[]> {
    const components = await tx.bundleComponent.findMany({
      where: {
        companyId,
        componentOptionId,
        componentOption: { isDeleted: false },
      },
      select: { bundleOptionId: true },
    });
    for (const { bundleOptionId } of components) {
      await this.recompute(companyId, bundleOptionId, tx);
    }
    return components.map((c) => c.bundleOptionId);
  }
}

// apps/server/src/products/__tests__/bundle-stock.service.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { BundleStockService } from '../application/service/bundle-stock.service';

/**
 * Mock shape mirrors what bundle-stock.service.ts touches:
 *   - `$queryRaw` for the row-level lock (result discarded).
 *   - `bundleComponent.findMany` returning rows with { qty, componentOption: { isDeleted, inventory? } }.
 *   - `productOption.updateMany` to materialize availableStock under organization scope.
 */
function makePrismaMock(
  components: Array<{ qty: number; currentStock: number | null }>,
  bundleRow: { id: string } | null = { id: 'bundle-1' },
) {
  const mock: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    bundleComponent: {
      findMany: vi.fn().mockResolvedValue(
        components.map((c, i) => ({
          id: `c${i}`,
          qty: c.qty,
          componentOption: {
            isDeleted: false,
            inventory: c.currentStock !== null ? { currentStock: c.currentStock } : null,
          },
        })),
      ),
    },
    productOption: {
      findFirst: vi.fn().mockResolvedValue(bundleRow),
      updateMany: vi.fn().mockResolvedValue({ count: bundleRow ? 1 : 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  // BundleStockService.recompute auto-wraps in `$transaction` when no outerTx
  // is supplied (quality-reviewer CRITICAL fix: row-lock must be held across
  // findMany + update). Mock the $transaction to just invoke the callback with
  // the same mock acting as the TransactionClient.
  mock.$transaction = vi.fn((cb: (tx: any) => Promise<any>) => cb(mock));
  return mock;
}

describe('BundleStockService', () => {
  it('sets availableStock=0 when no components', async () => {
    const prisma = makePrismaMock([]);
    const svc = new BundleStockService(prisma);
    const result = await svc.recompute('organization-1', 'bundle-1');
    expect(result).toBe(0);
    expect(prisma.productOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'bundle-1', organizationId: 'organization-1', isDeleted: false },
      select: { id: true },
    });
    expect(prisma.productOption.updateMany).toHaveBeenCalledWith({
      where: { id: 'bundle-1', organizationId: 'organization-1' },
      data: { availableStock: 0 },
    });
  });

  it('computes min(floor(stock/qty)) across components', async () => {
    const prisma = makePrismaMock([
      { qty: 1, currentStock: 10 },
      { qty: 2, currentStock: 5 },
    ]);
    const svc = new BundleStockService(prisma);
    expect(await svc.recompute('organization-1', 'b')).toBe(2);
  });

  it('treats missing inventory as stock=0 (capacity=0)', async () => {
    const prisma = makePrismaMock([
      { qty: 1, currentStock: 10 },
      { qty: 1, currentStock: null },
    ]);
    const svc = new BundleStockService(prisma);
    expect(await svc.recompute('organization-1', 'b')).toBe(0);
  });

  it('excludes soft-deleted components via where filter', async () => {
    const prisma = makePrismaMock([{ qty: 1, currentStock: 5 }]);
    const svc = new BundleStockService(prisma);
    await svc.recompute('organization-1', 'b');
    const arg = (prisma.bundleComponent.findMany as any).mock.calls[0][0];
    expect(arg.where.componentOption).toEqual({ isDeleted: false });
  });

  it('wrong organization bundle option → NotFound, no stock write', async () => {
    const prisma = makePrismaMock([{ qty: 1, currentStock: 5 }], null);
    const svc = new BundleStockService(prisma);

    await expect(svc.recompute('organization-1', 'bundle-1')).rejects.toThrow(NotFoundException);

    expect(prisma.bundleComponent.findMany).not.toHaveBeenCalled();
    expect(prisma.productOption.updateMany).not.toHaveBeenCalled();
    expect(prisma.productOption.update).not.toHaveBeenCalled();
  });
});

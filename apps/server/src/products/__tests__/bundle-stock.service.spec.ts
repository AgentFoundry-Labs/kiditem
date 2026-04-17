// apps/server/src/products/__tests__/bundle-stock.service.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { BundleStockService } from '../services/bundle-stock.service';

/**
 * Mock shape mirrors what bundle-stock.service.ts touches:
 *   - `$queryRaw` for the row-level lock (result discarded).
 *   - `bundleComponent.findMany` returning rows with { qty, componentOption: { isDeleted, inventory? } }.
 *   - `productOption.update` to materialize availableStock.
 */
function makePrismaMock(components: Array<{ qty: number; currentStock: number | null }>) {
  return {
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
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('BundleStockService', () => {
  it('sets availableStock=0 when no components', async () => {
    const prisma = makePrismaMock([]);
    const svc = new BundleStockService(prisma);
    const result = await svc.recompute('bundle-1');
    expect(result).toBe(0);
    expect(prisma.productOption.update).toHaveBeenCalledWith({
      where: { id: 'bundle-1' },
      data: { availableStock: 0 },
    });
  });

  it('computes min(floor(stock/qty)) across components', async () => {
    const prisma = makePrismaMock([
      { qty: 1, currentStock: 10 },
      { qty: 2, currentStock: 5 },
    ]);
    const svc = new BundleStockService(prisma);
    expect(await svc.recompute('b')).toBe(2);
  });

  it('treats missing inventory as stock=0 (capacity=0)', async () => {
    const prisma = makePrismaMock([
      { qty: 1, currentStock: 10 },
      { qty: 1, currentStock: null },
    ]);
    const svc = new BundleStockService(prisma);
    expect(await svc.recompute('b')).toBe(0);
  });

  it('excludes soft-deleted components via where filter', async () => {
    const prisma = makePrismaMock([{ qty: 1, currentStock: 5 }]);
    const svc = new BundleStockService(prisma);
    await svc.recompute('b');
    const arg = (prisma.bundleComponent.findMany as any).mock.calls[0][0];
    expect(arg.where.componentOption).toEqual({ isDeleted: false });
  });
});

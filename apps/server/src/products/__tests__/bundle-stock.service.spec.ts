import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { BundleStockService } from '../application/service/bundle-stock.service';

function makeBundleRepoMock(
  components: Array<{ qty: number; currentStock: number | null }>,
  bundleRow: { id: string } | null = { id: 'bundle-1' },
) {
  return {
    lockBundleOptionRow: vi.fn().mockResolvedValue(undefined),
    findBundleOptionId: vi.fn().mockResolvedValue(bundleRow),
    listActiveBundleComponentsWithStock: vi.fn().mockResolvedValue(
      components.map((c, i) => ({
        id: `c${i}`,
        qty: c.qty,
        componentOption: {
          isDeleted: false,
          inventory: c.currentStock !== null ? { currentStock: c.currentStock } : null,
        },
      })),
    ),
    writeBundleAvailableStock: vi.fn().mockResolvedValue(bundleRow ? 1 : 0),
  };
}

function makeService(repo: ReturnType<typeof makeBundleRepoMock>) {
  const tx = { tx: true };
  const transactions = {
    run: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  return {
    tx,
    transactions,
    service: new BundleStockService(repo as any, transactions as any),
  };
}

describe('BundleStockService', () => {
  it('sets availableStock=0 when no components', async () => {
    const repo = makeBundleRepoMock([]);
    const { service, tx } = makeService(repo);
    const result = await service.recompute('organization-1', 'bundle-1');

    expect(result).toBe(0);
    expect(repo.lockBundleOptionRow).toHaveBeenCalledWith(tx, 'bundle-1', 'organization-1');
    expect(repo.findBundleOptionId).toHaveBeenCalledWith(tx, 'bundle-1', 'organization-1');
    expect(repo.writeBundleAvailableStock).toHaveBeenCalledWith(tx, 'bundle-1', 'organization-1', 0);
  });

  it('computes min(floor(stock/qty)) across components', async () => {
    const repo = makeBundleRepoMock([
      { qty: 1, currentStock: 10 },
      { qty: 2, currentStock: 5 },
    ]);
    const { service } = makeService(repo);

    expect(await service.recompute('organization-1', 'b')).toBe(2);
  });

  it('treats missing inventory as stock=0 (capacity=0)', async () => {
    const repo = makeBundleRepoMock([
      { qty: 1, currentStock: 10 },
      { qty: 1, currentStock: null },
    ]);
    const { service } = makeService(repo);

    expect(await service.recompute('organization-1', 'b')).toBe(0);
  });

  it('wrong organization bundle option -> NotFound, no stock write', async () => {
    const repo = makeBundleRepoMock([{ qty: 1, currentStock: 5 }], null);
    const { service } = makeService(repo);

    await expect(service.recompute('organization-1', 'bundle-1')).rejects.toThrow(NotFoundException);

    expect(repo.listActiveBundleComponentsWithStock).not.toHaveBeenCalled();
    expect(repo.writeBundleAvailableStock).not.toHaveBeenCalled();
  });
});

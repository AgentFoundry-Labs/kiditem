import { describe, expect, it, vi } from 'vitest';
import { BundleComponentsService } from '../bundle-components.service';

function makeTransactionPrisma(tx: any) {
  return {
    $transaction: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
  };
}

describe('BundleComponentsService tenant boundary internals', () => {
  it('keeps the parent row lock before a scoped updateMany mutation', async () => {
    const row = {
      id: 'bc-1',
      companyId: 'company-1',
      bundleOptionId: 'bundle-1',
      componentOptionId: 'component-1',
      qty: 2,
    };
    const updated = { ...row, qty: 5 };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bundleComponent: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const bundleStock = { recompute: vi.fn().mockResolvedValue(undefined) };
    const svc = new BundleComponentsService(makeTransactionPrisma(tx) as any, bundleStock as any);

    await svc.update('company-1', 'bc-1', { qty: 5 });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.bundleComponent.updateMany).toHaveBeenCalledWith({
      where: { id: 'bc-1', companyId: 'company-1' },
      data: { qty: 5 },
    });
    expect(tx.bundleComponent.update).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.bundleComponent.updateMany.mock.invocationCallOrder[0],
    );
    expect(bundleStock.recompute).toHaveBeenCalledWith('company-1', 'bundle-1', tx);
  });

  it('keeps the parent row lock before a scoped deleteMany mutation', async () => {
    const row = {
      id: 'bc-1',
      companyId: 'company-1',
      bundleOptionId: 'bundle-1',
      componentOptionId: 'component-1',
      qty: 2,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bundleComponent: {
        findFirst: vi.fn().mockResolvedValue(row),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn().mockResolvedValue(row),
      },
    };
    const bundleStock = { recompute: vi.fn().mockResolvedValue(undefined) };
    const svc = new BundleComponentsService(makeTransactionPrisma(tx) as any, bundleStock as any);

    await svc.delete('company-1', 'bc-1');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.bundleComponent.deleteMany).toHaveBeenCalledWith({
      where: { id: 'bc-1', companyId: 'company-1' },
    });
    expect(tx.bundleComponent.delete).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.bundleComponent.deleteMany.mock.invocationCallOrder[0],
    );
    expect(bundleStock.recompute).toHaveBeenCalledWith('company-1', 'bundle-1', tx);
  });
});

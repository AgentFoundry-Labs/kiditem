import { describe, expect, it, vi } from 'vitest';
import { BundleComponentsService } from '../bundle-components.service';

function makeTransactions(tx: any) {
  return { run: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)) };
}

describe('BundleComponentsService tenant boundary internals', () => {
  it('keeps the parent row lock before a scoped updateMany mutation', async () => {
    const row = {
      id: 'bc-1',
      organizationId: 'organization-1',
      bundleOptionId: 'bundle-1',
      componentOptionId: 'component-1',
      qty: 2,
    };
    const updated = { ...row, qty: 5 };
    const tx = { tx: true };
    const bundles = {
      findBundleComponentForTenant: vi.fn()
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(updated),
      lockBundleOptionRow: vi.fn().mockResolvedValue(undefined),
      updateBundleComponentQty: vi.fn().mockResolvedValue(1),
    };
    const svc = new BundleComponentsService(bundles as any, makeTransactions(tx) as any);

    await svc.update('organization-1', 'bc-1', { qty: 5 });

    expect(bundles.lockBundleOptionRow).toHaveBeenCalledWith(tx, 'bundle-1', 'organization-1');
    expect(bundles.updateBundleComponentQty).toHaveBeenCalledWith(tx, 'bc-1', 'organization-1', 5);
    expect(bundles.lockBundleOptionRow.mock.invocationCallOrder[0]).toBeLessThan(
      bundles.updateBundleComponentQty.mock.invocationCallOrder[0],
    );
  });

  it('keeps the parent row lock before a scoped deleteMany mutation', async () => {
    const row = {
      id: 'bc-1',
      organizationId: 'organization-1',
      bundleOptionId: 'bundle-1',
      componentOptionId: 'component-1',
      qty: 2,
    };
    const tx = { tx: true };
    const bundles = {
      findBundleComponentForTenant: vi.fn().mockResolvedValue(row),
      lockBundleOptionRow: vi.fn().mockResolvedValue(undefined),
      deleteBundleComponentScoped: vi.fn().mockResolvedValue(1),
    };
    const svc = new BundleComponentsService(bundles as any, makeTransactions(tx) as any);

    await svc.delete('organization-1', 'bc-1');

    expect(bundles.lockBundleOptionRow).toHaveBeenCalledWith(tx, 'bundle-1', 'organization-1');
    expect(bundles.deleteBundleComponentScoped).toHaveBeenCalledWith(tx, 'bc-1', 'organization-1');
    expect(bundles.lockBundleOptionRow.mock.invocationCallOrder[0]).toBeLessThan(
      bundles.deleteBundleComponentScoped.mock.invocationCallOrder[0],
    );
  });
});

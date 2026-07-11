import { describe, expect, it, vi } from 'vitest';
import { BundleComponentsService } from '../bundle-components.service';
import { OptionsService } from '../options.service';

describe('stock-free product composition', () => {
  it('creates bundle composition without recomputing materialized stock', async () => {
    const tx = { transaction: true };
    const bundles = {
      findBundleRuleOptions: vi.fn().mockResolvedValue({
        bundleOpt: { id: 'bundle-1', organizationId: 'organization-1', isBundle: true },
        compOpt: { id: 'component-1', organizationId: 'organization-1', isBundle: false },
      }),
      lockBundleOptionRow: vi.fn().mockResolvedValue(undefined),
      createBundleComponent: vi.fn().mockResolvedValue({
        id: 'composition-1',
        organizationId: 'organization-1',
        bundleOptionId: 'bundle-1',
        componentOptionId: 'component-1',
        qty: 2,
      }),
    };
    const transactions = {
      run: vi.fn(async (work: (value: unknown) => Promise<unknown>) => work(tx)),
    };
    const bundleStock = { recompute: vi.fn() };
    const service = new (BundleComponentsService as any)(
      bundles,
      transactions,
      bundleStock,
    ) as BundleComponentsService;

    await service.create('organization-1', {
      bundleOptionId: 'bundle-1',
      componentOptionId: 'component-1',
      qty: 2,
    });

    expect(bundleStock.recompute).not.toHaveBeenCalled();
  });

  it('soft-deletes a component option without reverse stock fan-out', async () => {
    const tx = { transaction: true };
    const options = {
      softDeleteOptionRow: vi.fn().mockResolvedValue(undefined),
      findBundleIdsUsingComponent: vi.fn().mockResolvedValue(['bundle-1']),
    };
    const transactions = {
      run: vi.fn(async (work: (value: unknown) => Promise<unknown>) => work(tx)),
    };
    const bundleStock = { recompute: vi.fn() };
    const service = new (OptionsService as any)(
      options,
      transactions,
      bundleStock,
    ) as OptionsService;

    await service.softDelete('organization-1', 'component-1');

    expect(options.findBundleIdsUsingComponent).not.toHaveBeenCalled();
    expect(bundleStock.recompute).not.toHaveBeenCalled();
  });
});

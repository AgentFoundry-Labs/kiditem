import { describe, expect, it, vi } from 'vitest';
import { OptionsService } from '../options.service';

function makeTransactions(tx: any) {
  return { run: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)) };
}

describe('OptionsService tenant boundary internals', () => {
  it('re-reads the incremented master counter with organization scope inside create', async () => {
    const tx = { tx: true };
    const options = {
      incrementMasterOptionCounter: vi.fn().mockResolvedValue({ code: 'M-00000001', optionCounter: 1 }),
      createOptionWithSku: vi.fn().mockResolvedValue({ id: 'option-1', organizationId: 'organization-1' }),
    };
    const svc = new OptionsService(options as any, makeTransactions(tx) as any, {} as any);

    await svc.create('organization-1', { masterId: 'master-1', optionName: 'Red' } as any);

    expect(options.incrementMasterOptionCounter).toHaveBeenCalledWith(tx, 'organization-1', 'master-1');
    expect(options.createOptionWithSku).toHaveBeenCalledWith(
      tx,
      'organization-1',
      'master-1',
      'M-00000001-01',
      { optionName: 'Red' },
    );
  });

  it('scopes bundle-owned relation count by organization when rejecting isBundle=false', async () => {
    const tx = { tx: true };
    const options = {
      findCurrentOption: vi.fn().mockResolvedValue({ id: 'option-1', organizationId: 'organization-1', isBundle: true }),
      assertNoBundleComponents: vi.fn().mockResolvedValue(undefined),
      applyOptionPatch: vi.fn().mockResolvedValue({ id: 'option-1', organizationId: 'organization-1', isBundle: false }),
    };
    const svc = new OptionsService(options as any, makeTransactions(tx) as any, {} as any);

    await svc.update('organization-1', 'option-1', { isBundle: false } as any);

    expect(options.assertNoBundleComponents).toHaveBeenCalledWith(tx, 'organization-1', 'option-1');
  });

  it('scopes component relation count by organization when rejecting isBundle=true', async () => {
    const tx = { tx: true };
    const options = {
      findCurrentOption: vi.fn().mockResolvedValue({ id: 'option-1', organizationId: 'organization-1', isBundle: false }),
      assertNotUsedAsComponent: vi.fn().mockResolvedValue(undefined),
      applyOptionPatch: vi.fn().mockResolvedValue({ id: 'option-1', organizationId: 'organization-1', isBundle: true }),
    };
    const svc = new OptionsService(options as any, makeTransactions(tx) as any, {} as any);

    await svc.update('organization-1', 'option-1', { isBundle: true } as any);

    expect(options.assertNotUsedAsComponent).toHaveBeenCalledWith(tx, 'organization-1', 'option-1');
  });
});

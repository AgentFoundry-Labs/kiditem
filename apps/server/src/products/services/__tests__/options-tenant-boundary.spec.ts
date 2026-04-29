import { describe, expect, it, vi } from 'vitest';
import { OptionsService } from '../options.service';

function makeTransactionPrisma(tx: any) {
  return {
    $transaction: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
  };
}

describe('OptionsService tenant boundary internals', () => {
  it('re-reads the incremented master counter with company scope inside create', async () => {
    const tx = {
      masterProduct: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ code: 'M-00000001', optionCounter: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ code: 'M-00000001', optionCounter: 1 }),
      },
      productOption: {
        create: vi.fn().mockResolvedValue({ id: 'option-1', companyId: 'company-1' }),
      },
    };
    const svc = new OptionsService(makeTransactionPrisma(tx) as any, {} as any);

    await svc.create('company-1', { masterId: 'master-1', optionName: 'Red' } as any);

    expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'master-1', companyId: 'company-1', isDeleted: false },
      select: { code: true, optionCounter: true },
    });
    expect(tx.masterProduct.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('scopes bundle-owned relation count by company when rejecting isBundle=false', async () => {
    const tx = {
      productOption: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'option-1', companyId: 'company-1', isBundle: true })
          .mockResolvedValueOnce({ id: 'option-1', companyId: 'company-1', isBundle: true }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      bundleComponent: {
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const svc = new OptionsService(makeTransactionPrisma(tx) as any, {} as any);

    await svc.update('company-1', 'option-1', { isBundle: false } as any);

    expect(tx.bundleComponent.count).toHaveBeenCalledWith({
      where: { bundleOptionId: 'option-1', companyId: 'company-1' },
    });
  });

  it('scopes component relation count by company when rejecting isBundle=true', async () => {
    const tx = {
      productOption: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'option-1', companyId: 'company-1', isBundle: false })
          .mockResolvedValueOnce({ id: 'option-1', companyId: 'company-1', isBundle: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      bundleComponent: {
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const svc = new OptionsService(makeTransactionPrisma(tx) as any, {} as any);

    await svc.update('company-1', 'option-1', { isBundle: true } as any);

    expect(tx.bundleComponent.count).toHaveBeenCalledWith({
      where: { componentOptionId: 'option-1', companyId: 'company-1' },
    });
  });
});

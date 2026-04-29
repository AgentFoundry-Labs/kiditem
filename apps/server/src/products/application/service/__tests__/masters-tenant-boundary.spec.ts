import { describe, expect, it, vi } from 'vitest';
import { MastersService } from '../masters.service';

describe('MastersService tenant boundary internals', () => {
  it('re-reads a newly created master with company scope inside the transaction', async () => {
    const row = {
      id: 'master-1',
      code: 'M-00000001',
      companyId: 'company-1',
      name: 'Scoped master',
      optionCounter: 0,
      images: [],
    };
    const tx = {
      masterProduct: {
        create: vi.fn().mockResolvedValue(row),
        findFirst: vi.fn().mockResolvedValue(row),
        findUniqueOrThrow: vi.fn().mockResolvedValue(row),
      },
      masterProductImage: {
        createMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((cb: (txArg: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const codeSvc = { generate: vi.fn().mockResolvedValue('M-00000001') };
    const svc = new MastersService(prisma as any, codeSvc as any, {} as any);

    await svc.create('company-1', { name: 'Scoped master' } as any);

    expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'master-1', companyId: 'company-1' },
      include: expect.any(Object),
    });
    expect(tx.masterProduct.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

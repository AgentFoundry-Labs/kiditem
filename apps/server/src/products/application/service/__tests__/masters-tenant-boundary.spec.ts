import { describe, expect, it, vi } from 'vitest';
import { MastersService } from '../masters.service';

describe('MastersService tenant boundary internals', () => {
  it('re-reads a newly created master with organization scope inside the transaction', async () => {
    const row = {
      id: 'master-1',
      code: 'M-00000001',
      organizationId: 'organization-1',
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

    await svc.create('organization-1', { name: 'Scoped master' } as any);

    expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'master-1', organizationId: 'organization-1' },
      include: expect.any(Object),
    });
    expect(tx.masterProduct.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('excludes AI detail-page generations from legacy history', async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'master-1',
          code: 'M-00000001',
          organizationId: 'organization-1',
          name: 'History master',
          optionCounter: 0,
          images: [],
        }),
      },
      contentGeneration: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'bold-1',
            generatedTitle: 'KIDITEM DESIGN',
            status: 'READY',
            detailPageHtml: JSON.stringify({ templateId: 'bold-vertical', result: {} }),
            errorMessage: null,
            createdAt: new Date('2026-05-07T00:00:00.000Z'),
          },
          {
            id: 'legacy-1',
            generatedTitle: 'CA result',
            status: 'READY',
            detailPageHtml: JSON.stringify({ title: 'legacy detail page' }),
            errorMessage: null,
            createdAt: new Date('2026-05-06T00:00:00.000Z'),
          },
        ]),
      },
    };
    const svc = new MastersService(prisma as any, {} as any, {} as any);

    await expect(svc.getGenerationHistory('organization-1', 'master-1', 10)).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-1' }),
    ]);
  });
});

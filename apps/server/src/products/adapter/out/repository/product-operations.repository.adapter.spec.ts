import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsRepositoryAdapter } from './product-operations.repository.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';
const sellingMasterProductId = '00000000-0000-4000-8000-000000000002';

describe('ProductOperationsRepositoryAdapter', () => {
  it('filters the selling view with the same eligible MasterProducts used by ABC', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: sellingMasterProductId }]),
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new ProductOperationsRepositoryAdapter(prisma as never);

    await repository.listProducts(organizationId, {
      page: 1,
      limit: 50,
      periodDays: 30,
      activeStatus: 'active',
      adStatus: 'all',
    });

    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: [sellingMasterProductId] },
      }),
    }));
  });
});

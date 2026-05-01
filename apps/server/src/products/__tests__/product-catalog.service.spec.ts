import { describe, expect, it, vi } from 'vitest';
import { ProductCatalogService } from '../application/service/product-catalog.service';

function makeService(rows: any[]) {
  const prisma = {
    masterProduct: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      findFirst: vi.fn().mockResolvedValue(rows[0] ?? null),
    },
  };
  return { service: new ProductCatalogService(prisma as any), prisma };
}

describe('ProductCatalogService', () => {
  it('maps active options into ranges and total stock', async () => {
    const { service } = makeService([{
      id: 'm1',
      organizationId: 'c1',
      code: 'M-1',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 2,
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      abcGrade: 'A',
      profitTag: null,
      adTier: 'core',
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: 'processed',
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: new Date('2026-04-24T00:00:00.000Z'),
      updatedAt: new Date('2026-04-24T00:00:00.000Z'),
      options: [
        { id: 'o1', masterId: 'm1', organizationId: 'c1', sku: 'M-1-01', barcode: null, legacyCode: null, optionName: 'Red', sortOrder: 0, costPrice: 1000, sellPrice: 2000, commissionRate: null, shippingCost: null, otherCost: 0, isBundle: false, availableStock: null, isDeleted: false, deletedAt: null, isTemporary: false, temporaryReason: null, isActive: true, createdAt: new Date('2026-04-24T00:00:00.000Z'), updatedAt: new Date('2026-04-24T00:00:00.000Z'), inventory: { currentStock: 4 } },
        { id: 'o2', masterId: 'm1', organizationId: 'c1', sku: 'M-1-02', barcode: null, legacyCode: null, optionName: 'Set', sortOrder: 1, costPrice: 3000, sellPrice: 5000, commissionRate: null, shippingCost: null, otherCost: 0, isBundle: true, availableStock: 2, isDeleted: false, deletedAt: null, isTemporary: false, temporaryReason: null, isActive: true, createdAt: new Date('2026-04-24T00:00:00.000Z'), updatedAt: new Date('2026-04-24T00:00:00.000Z'), inventory: null },
      ],
    }]);

    const result = await service.list('c1', { page: 1, limit: 20 });
    expect(result.items[0].representativeSku).toBe('M-1-01');
    expect(result.items[0].priceRange).toEqual({ min: 2000, max: 5000 });
    expect(result.items[0].costRange).toEqual({ min: 1000, max: 3000 });
    expect(result.items[0].totalAvailableStock).toBe(6);
  });

  it('scopes nested option reads by organization in catalog detail', async () => {
    const { service, prisma } = makeService([{
      id: 'm1',
      organizationId: 'c1',
      code: 'M-1',
      legacyCode: null,
      name: 'Toy',
      description: '',
      category: null,
      brand: null,
      tags: [],
      optionCounter: 0,
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
      abcGrade: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: null,
      healthUpdatedAt: null,
      sourceUrl: null,
      sourcePlatform: null,
      costCny: null,
      marginRate: null,
      pipelineStep: null,
      detailPageUrl: null,
      thumbnailStrategy: 'standard',
      isDeleted: false,
      deletedAt: null,
      isTemporary: false,
      temporaryReason: null,
      memo: null,
      createdAt: new Date('2026-04-24T00:00:00.000Z'),
      updatedAt: new Date('2026-04-24T00:00:00.000Z'),
      options: [],
    }]);

    await service.detail('c1', 'm1');

    const select = prisma.masterProduct.findFirst.mock.calls[0][0].select;
    expect(select.options.where).toEqual({
      organizationId: 'c1',
      isDeleted: false,
      isActive: true,
    });
  });
});

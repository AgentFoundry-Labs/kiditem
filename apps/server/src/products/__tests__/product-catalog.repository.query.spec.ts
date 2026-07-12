import { describe, expect, it, vi } from 'vitest';
import {
  buildCatalogMasterSelect,
  buildCatalogWhere,
  findCatalogDetail,
} from '../adapter/out/repository/product-catalog.query';
import { PRODUCTS_OWNED_MASTER_SCOPE } from '../adapter/out/repository/master-product-scope';

describe('product catalog repository query', () => {
  it('scopes nested option reads by organization in the shared catalog select', () => {
    const select = buildCatalogMasterSelect('organization-1');

    expect(select.options.where).toEqual({
      organizationId: 'organization-1',
      isDeleted: false,
      isActive: true,
    });
  });

  it('uses the scoped catalog select for detail reads', async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    await findCatalogDetail(prisma as any, 'organization-1', 'master-1');

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: {
        ...PRODUCTS_OWNED_MASTER_SCOPE,
        id: 'master-1',
        organizationId: 'organization-1',
        isDeleted: false,
      },
      select: buildCatalogMasterSelect('organization-1'),
    });
  });

  it('keeps the products-owned scope when catalog search adds its own AND filters', () => {
    expect(buildCatalogWhere('organization-1', { search: 'master' }))
      .toEqual(expect.objectContaining(PRODUCTS_OWNED_MASTER_SCOPE));
  });
});

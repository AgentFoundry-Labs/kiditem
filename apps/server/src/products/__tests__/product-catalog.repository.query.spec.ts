import { describe, expect, it, vi } from 'vitest';
import {
  buildCatalogMasterSelect,
  findCatalogDetail,
} from '../adapter/out/repository/product-catalog.query';

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
      where: { id: 'master-1', organizationId: 'organization-1', isDeleted: false },
      select: buildCatalogMasterSelect('organization-1'),
    });
  });
});

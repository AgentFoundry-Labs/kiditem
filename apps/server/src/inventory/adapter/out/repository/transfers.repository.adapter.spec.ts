import { describe, expect, it, vi } from 'vitest';
import { TransfersRepositoryAdapter } from './transfers.repository.adapter';

describe('TransfersRepositoryAdapter expand compatibility', () => {
  it('resolves the retained ProductOption identity from the organization-owned Sellpia code', async () => {
    const prisma = {
      inventorySku: {
        findFirst: vi.fn().mockResolvedValue({
          optionName: '파랑',
          sellpiaProductCode: 'SP-001',
        }),
      },
      productOption: {
        findFirst: vi.fn().mockResolvedValue({ id: 'option-1' }),
      },
    };
    const repository = new TransfersRepositoryAdapter(prisma as never);

    await expect(repository.findInventorySkuForTransfer('inventory-sku-1', 'org-1'))
      .resolves.toEqual({ optionName: '파랑', legacyOptionId: 'option-1' });
    expect(prisma.productOption.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        isDeleted: false,
        legacyCode: 'SP-001',
      },
      select: { id: true },
    });
  });
});

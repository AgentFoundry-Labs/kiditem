import { describe, expect, it, vi } from 'vitest';
import { TransfersRepositoryAdapter } from './transfers.repository.adapter';

describe('TransfersRepositoryAdapter', () => {
  it('resolves the organization-owned Sellpia inventory SKU directly', async () => {
    const prisma = {
      sellpiaInventorySku: {
        findFirst: vi.fn().mockResolvedValue({
          optionName: '파랑',
        }),
      },
    };
    const repository = new TransfersRepositoryAdapter(prisma as never);

    await expect(repository.findInventorySkuForTransfer('sku-1', 'org-1'))
      .resolves.toEqual({ optionName: '파랑' });
    expect(prisma.sellpiaInventorySku.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'sku-1',
        organizationId: 'org-1',
        isActive: true,
      },
      select: { optionName: true },
    });
  });
});

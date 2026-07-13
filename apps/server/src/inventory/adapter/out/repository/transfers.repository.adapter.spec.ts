import { describe, expect, it, vi } from 'vitest';
import { TransfersRepositoryAdapter } from './transfers.repository.adapter';

describe('TransfersRepositoryAdapter', () => {
  it('resolves the organization-owned physical Master directly', async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({
          optionName: '파랑',
        }),
      },
    };
    const repository = new TransfersRepositoryAdapter(prisma as never);

    await expect(repository.findMasterProductForTransfer('master-1', 'org-1'))
      .resolves.toEqual({ optionName: '파랑' });
    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'master-1',
        organizationId: 'org-1',
        isActive: true,
      },
      select: { optionName: true },
    });
  });
});

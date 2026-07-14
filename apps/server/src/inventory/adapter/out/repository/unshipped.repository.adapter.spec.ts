import { describe, expect, it, vi } from 'vitest';
import { UnshippedRepositoryAdapter } from './unshipped.repository.adapter';

describe('UnshippedRepositoryAdapter', () => {
  it('scopes items and both counts to the active organization', async () => {
    const items = [{ id: 'unshipped-1' }];
    const prisma = {
      unshippedItem: {
        findMany: vi.fn().mockResolvedValue(items),
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(4),
      },
    };
    const repository = new UnshippedRepositoryAdapter(prisma as never);

    await expect(repository.list('org-1', { minDays: 2, skip: 10, take: 10 }))
      .resolves.toEqual({ items, total: 1, delayedCount: 4 });
    expect(prisma.unshippedItem.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', delayDays: { gte: 2 } },
      orderBy: { delayDays: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(prisma.unshippedItem.count).toHaveBeenNthCalledWith(1, {
      where: { organizationId: 'org-1', delayDays: { gte: 2 } },
    });
    expect(prisma.unshippedItem.count).toHaveBeenNthCalledWith(2, {
      where: { organizationId: 'org-1', delayDays: { gte: 3 } },
    });
  });
});

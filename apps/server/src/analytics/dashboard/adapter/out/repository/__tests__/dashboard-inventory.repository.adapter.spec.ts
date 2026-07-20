import { describe, expect, it, vi } from 'vitest';
import { DashboardInventoryRepositoryAdapter } from '../dashboard-inventory.repository.adapter';

describe('DashboardInventoryRepositoryAdapter listing and physical inventory reads', () => {
  it('counts operational products for tiles and physical Sellpia SKUs for zero stock', async () => {
    const prisma = {
      masterProduct: {
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      sellpiaInventorySku: {
        count: vi.fn().mockResolvedValue(0),
      },
      channelListing: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new DashboardInventoryRepositoryAdapter(prisma as never);

    await repository.countActiveProductsByGrade('org-1');
    await repository.countActiveProducts('org-1');
    await repository.countChannelLinkedProducts('org-1');
    await repository.findAGradeReviewCounts('org-1');
    await repository.countOutOfStockMasterProducts('org-1');

    expect(prisma.masterProduct.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', isActive: true }),
      }),
    );
    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', abcGrade: 'A' }),
      }),
    );
    expect(prisma.masterProduct.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        isActive: true,
      },
    });
    expect(prisma.sellpiaInventorySku.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        isActive: true,
        currentStock: 0,
      },
    });
  });
});

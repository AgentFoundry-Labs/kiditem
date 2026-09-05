import { describe, expect, it, vi } from 'vitest';
import { DashboardInventoryRepositoryAdapter } from '../dashboard-inventory.repository.adapter';

describe('DashboardInventoryRepositoryAdapter', () => {
  it('reads the stored formula and operating-profit contribution evidence', async () => {
    const prisma = {
      masterProduct: { groupBy: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
      masterProductAbcEvaluation: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      masterProductAbcFormulaState: { findUnique: vi.fn().mockResolvedValue(null) },
      sellpiaInventorySku: { count: vi.fn().mockResolvedValue(0) },
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingOption: { count: vi.fn().mockResolvedValue(0) },
    };
    const repository = new DashboardInventoryRepositoryAdapter(prisma as never, undefined as never);

    await repository.countActiveProductsByGrade('org-1');
    await repository.findActiveAbcContributions('org-1');
    await repository.countUnclassifiedActiveProducts('org-1');
    await repository.findAbcFormula('org-1');
    await repository.countActiveProducts('org-1');
    await repository.getSellingChannelMappingSummary('org-1');
    await repository.findAGradeReviewCounts('org-1');
    await repository.countOutOfStockMasterProducts('org-1');


    expect(prisma.masterProductAbcEvaluation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ weightedOperatingProfit: true }),
    }));
    expect(prisma.masterProductAbcFormulaState.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      include: { activeFormulaVersion: { select: { formulaJson: true } } },
    });
    expect(prisma.masterProduct.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', isActive: true, abcGrade: null },
    });
    expect(prisma.channelListing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-1',
        channelAccount: {
          is: expect.objectContaining({ status: 'active' }),
        },
      }),
    }));
  });

  it('reads Products-owned grade history only', async () => {
    const findMany = vi.fn().mockResolvedValue([{ oldGrade: null, newGrade: 'A' }]);
    const repository = new DashboardInventoryRepositoryAdapter({
      masterProductAbcGradeHistory: { findMany },
    } as never, undefined as never);
    const since = new Date('2026-07-17T00:00:00.000Z');
    await repository.findGradeHistory('org-1', since);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', calculatedAt: { gte: since } },
      select: { oldGrade: true, newGrade: true },
    });
  });

  it('counts mapping attention from selling options using the latest channel snapshot', async () => {
    const repository = new DashboardInventoryRepositoryAdapter({
      channelListing: {
        findMany: vi.fn().mockResolvedValue([
          listing('판매중', [{ inventoryComponents: [] }, {
            inventoryComponents: [{
              sellpiaInventorySku: {
                isActive: true,
                currentStock: 1,
                masterProductId: 'master-1',
                masterProduct: { isActive: true },
              },
            }],
          }]),
          listing('판매중지', [{ inventoryComponents: [] }]),
        ]),
      },
      channelListingOption: { count: vi.fn().mockResolvedValue(0) },
    } as never, undefined as never);

    await expect(repository.getSellingChannelMappingSummary('org-1')).resolves.toEqual({
      linkedMasterProductCount: 1,
      mappingStatusRows: [
        { mappingStatus: 'unmatched', count: 1 },
        { mappingStatus: 'needs_review', count: 0 },
        { mappingStatus: 'matched', count: 1 },
      ],
    });
  });
});

function listing(
  snapshotStatus: string,
  options: Array<{ inventoryComponents: Array<{ sellpiaInventorySku: { isActive: boolean; currentStock: number; masterProductId: string | null; masterProduct: { isActive: boolean } | null } }> }>,
) {
  return {
    isActive: true,
    status: 'active',
    rawJson: { saleStatus: '판매중' },
    channelListingDailySnapshots: [{ saleStatus: snapshotStatus }],
    options,
  };
}

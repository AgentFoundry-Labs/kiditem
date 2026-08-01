import { describe, expect, it, vi } from 'vitest';
import { DashboardInventoryRepositoryAdapter } from '../dashboard-inventory.repository.adapter';

describe('DashboardInventoryRepositoryAdapter', () => {
  it('reads automatic ABC status, frozen formula, and contribution evidence', async () => {
    const prisma = {
      masterProduct: { groupBy: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
      masterProductAbcEvaluation: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      masterProductAbcFormulaState: { findUnique: vi.fn().mockResolvedValue(null) },
      sellpiaInventorySku: { count: vi.fn().mockResolvedValue(0) },
      channelListing: { groupBy: vi.fn().mockResolvedValue([]) },
      channelListingOption: { count: vi.fn().mockResolvedValue(0) },
    };
    const repository = new DashboardInventoryRepositoryAdapter(prisma as never);

    await repository.countActiveProductsByGrade('org-1');
    await repository.countActiveProductsByAbcStatus('org-1');
    await repository.findActiveAbcContributions('org-1');
    await repository.countUnclassifiedActiveProducts('org-1');
    await repository.findAbcFormula('org-1');
    await repository.countActiveProducts('org-1');
    await repository.countChannelLinkedProducts('org-1');
    await repository.findAGradeReviewCounts('org-1');
    await repository.countOutOfStockMasterProducts('org-1');

    expect(prisma.masterProductAbcEvaluation.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['calculationStatus'],
      where: expect.objectContaining({ organizationId: 'org-1' }),
    }));
    expect(prisma.masterProductAbcEvaluation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ weightedContributionProfit: true }),
    }));
    expect(prisma.masterProductAbcFormulaState.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      include: { activeFormulaVersion: { select: { formulaJson: true } } },
    });
    expect(prisma.masterProduct.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', isActive: true, abcGrade: null },
    });
  });

  it('reads Products-owned grade history only', async () => {
    const findMany = vi.fn().mockResolvedValue([{ oldGrade: null, newGrade: 'A' }]);
    const repository = new DashboardInventoryRepositoryAdapter({
      masterProductAbcGradeHistory: { findMany },
    } as never);
    const since = new Date('2026-07-17T00:00:00.000Z');
    await repository.findGradeHistory('org-1', since);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', calculatedAt: { gte: since } },
      select: { oldGrade: true, newGrade: true },
    });
  });
});

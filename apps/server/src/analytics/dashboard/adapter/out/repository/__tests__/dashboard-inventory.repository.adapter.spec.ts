import { describe, expect, it, vi } from 'vitest';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../../../../../../common/legacy-family-master-scope';
import { DashboardInventoryRepositoryAdapter } from '../dashboard-inventory.repository.adapter';

describe('DashboardInventoryRepositoryAdapter legacy family reads', () => {
  it('keeps staged Sellpia physical identities out of every family summary query', async () => {
    const prisma = {
      masterProduct: {
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new DashboardInventoryRepositoryAdapter(prisma as never);

    await repository.countActiveProductsByGrade('org-1');
    await repository.countActiveProducts('org-1');
    await repository.countChannelLinkedProducts('org-1');
    await repository.findAGradeReviewCounts('org-1');

    expect(prisma.masterProduct.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(LEGACY_FAMILY_MASTER_SCOPE),
      }),
    );
    for (const [query] of prisma.masterProduct.count.mock.calls) {
      expect(query.where).toEqual(expect.objectContaining(LEGACY_FAMILY_MASTER_SCOPE));
    }
    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(LEGACY_FAMILY_MASTER_SCOPE),
      }),
    );
  });
});

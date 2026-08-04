import { describe, expect, it, vi } from 'vitest';

const modulePath = '../data-migrations/v0.1.30/001_reset_legacy_product_abc_grades.js';
const sourceFreshnessModulePath = '../data-migrations/v0.1.30/002_backfill_profitability_source_freshness.js';

describe('automatic profitability ABC migration', () => {
  it('clears incompatible legacy ABC records before the formula-version schema switch', async () => {
    const { resetLegacyProductAbcGrades } = await import(modulePath);
    const products = [
      { id: 'master-1', abcGrade: 'A' },
      { id: 'master-2', abcGrade: null },
      { id: 'master-3', abcGrade: 'C' },
    ];
    const updateMany = vi.fn().mockImplementation(async () => {
      let count = 0;
      for (const product of products) {
        if (product.abcGrade === null) continue;
        product.abcGrade = null;
        count += 1;
      }
      return { count };
    });
    const executeRaw = vi.fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const queryRaw = vi.fn().mockResolvedValue([{ exists: true }]);
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw, masterProduct: { updateMany } };

    await expect(resetLegacyProductAbcGrades.run(tx as never)).resolves.toEqual({
      affectedRows: 11,
      details: {
        clearedLegacyGradeCount: 2,
        deletedLegacyEvaluationCount: 3,
        deletedLegacyHistoryCount: 4,
        deletedLegacyPolicyCount: 2,
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { abcGrade: { not: null } },
      data: { abcGrade: null },
    });

    await expect(resetLegacyProductAbcGrades.run(tx as never)).resolves.toEqual({
      affectedRows: 0,
      details: {
        clearedLegacyGradeCount: 0,
        deletedLegacyEvaluationCount: 0,
        deletedLegacyHistoryCount: 0,
        deletedLegacyPolicyCount: 0,
      },
    });
  });

  it('skips the legacy evaluation table when an office database never had it', async () => {
    const { resetLegacyProductAbcGrades } = await import(modulePath);
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const executeRaw = vi.fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    const queryRaw = vi.fn().mockResolvedValue([{ exists: false }]);
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw, masterProduct: { updateMany } };

    await expect(resetLegacyProductAbcGrades.run(tx as never)).resolves.toEqual({
      affectedRows: 8,
      details: {
        clearedLegacyGradeCount: 2,
        deletedLegacyEvaluationCount: 0,
        deletedLegacyHistoryCount: 4,
        deletedLegacyPolicyCount: 2,
      },
    });
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('copies legacy shared coverage into Sellpia provenance only', async () => {
    const { backfillProfitabilitySourceFreshness } = await import(sourceFreshnessModulePath);
    const executeRaw = vi.fn().mockResolvedValue(3);

    await expect(backfillProfitabilitySourceFreshness.run({ $executeRaw: executeRaw } as never))
      .resolves.toEqual({
        affectedRows: 3,
        details: { updatedEvaluationCount: 3 },
      });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});

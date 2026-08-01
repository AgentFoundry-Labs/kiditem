import type { DataMigration } from '../types';

/**
 * The prior percentile/cumulative ABC labels have no compatible formula or
 * source evidence under automatic profitability ABC. This must run before the
 * schema switch: the old grade history cannot satisfy a required frozen-formula
 * reference. The first valid Sellpia product-profit ingest creates a new
 * evaluation and immutable history record.
 */
export const resetLegacyProductAbcGrades: DataMigration = {
  id: 'v0.1.30:001_reset_legacy_product_abc_grades',
  releaseVersion: '0.1.30',
  name: 'Reset legacy product ABC grades for automatic profitability evaluation',
  phase: 'pre-schema',
  async run(tx) {
    const [deletedHistories, deletedEvaluations, deletedPolicies] = await Promise.all([
      tx.$executeRaw`DELETE FROM master_product_abc_grade_histories`,
      tx.$executeRaw`DELETE FROM master_product_abc_evaluations`,
      tx.$executeRaw`DELETE FROM master_product_abc_policies`,
    ]);
    const cleared = await tx.masterProduct.updateMany({
      where: { abcGrade: { not: null } },
      data: { abcGrade: null },
    });
    return {
      affectedRows: deletedHistories + deletedEvaluations + deletedPolicies + cleared.count,
      details: {
        clearedLegacyGradeCount: cleared.count,
        deletedLegacyEvaluationCount: deletedEvaluations,
        deletedLegacyHistoryCount: deletedHistories,
        deletedLegacyPolicyCount: deletedPolicies,
      },
    };
  },
};

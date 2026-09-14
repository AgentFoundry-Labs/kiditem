import type { Prisma } from "@prisma/client";
import type { DataMigration } from "../types";

export const resetAbsoluteProductAbc: DataMigration = {
  id: "v0.1.31:001_reset_absolute_product_abc",
  releaseVersion: "0.1.31",
  name: "Reset legacy product ABC persistence before current absolute formula",
  phase: "pre-schema",
  async run(tx) {
    const deletedGradeHistories = await tx.masterProductAbcGradeHistory.deleteMany();
    const deletedEvaluations = await tx.masterProductAbcEvaluation.deleteMany();
    const deletedFormulaStates = await tx.masterProductAbcFormulaState.deleteMany();
    const deletedFormulaVersions = await tx.masterProductAbcFormulaVersion.deleteMany();
    const clearedCachedGradeCount = await clearCachedProductGrades(tx);

    return {
      affectedRows: deletedGradeHistories.count
        + deletedEvaluations.count
        + deletedFormulaStates.count
        + deletedFormulaVersions.count
        + clearedCachedGradeCount,
      details: {
        clearedCachedGradeCount,
        deletedEvaluationCount: deletedEvaluations.count,
        deletedFormulaStateCount: deletedFormulaStates.count,
        deletedFormulaVersionCount: deletedFormulaVersions.count,
        deletedGradeHistoryCount: deletedGradeHistories.count,
      },
    };
  },
};

/**
 * The KID-90 schema step drops the cached `master_products.abc_grade` column,
 * and the Prisma client after it no longer knows the field. Fixed identifiers
 * keep this migration valid on both shapes; a database without the column
 * holds no cached grade to clear.
 */
async function clearCachedProductGrades(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const [column] = await tx.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'master_products'
        AND column_name = 'abc_grade'
    ) AS present
  `;
  if (column?.present !== true) return 0;
  return tx.$executeRaw`
    UPDATE master_products
    SET abc_grade = NULL, updated_at = now()
    WHERE abc_grade IS NOT NULL
  `;
}

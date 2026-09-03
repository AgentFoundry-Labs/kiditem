import type { DataMigration } from "../types";

export const resetAbsoluteProductAbc: DataMigration = {
  id: "v0.1.31:001_reset_absolute_product_abc",
  releaseVersion: "0.1.31",
  name: "Reset legacy product ABC persistence before absolute V1",
  phase: "pre-schema",
  async run(tx) {
    const deletedGradeHistories = await tx.masterProductAbcGradeHistory.deleteMany();
    const deletedEvaluations = await tx.masterProductAbcEvaluation.deleteMany();
    const deletedFormulaStates = await tx.masterProductAbcFormulaState.deleteMany();
    const deletedFormulaVersions = await tx.masterProductAbcFormulaVersion.deleteMany();
    const clearedCachedGrades = await tx.masterProduct.updateMany({
      where: { abcGrade: { not: null } },
      data: { abcGrade: null },
    });

    return {
      affectedRows: deletedGradeHistories.count
        + deletedEvaluations.count
        + deletedFormulaStates.count
        + deletedFormulaVersions.count
        + clearedCachedGrades.count,
      details: {
        clearedCachedGradeCount: clearedCachedGrades.count,
        deletedEvaluationCount: deletedEvaluations.count,
        deletedFormulaStateCount: deletedFormulaStates.count,
        deletedFormulaVersionCount: deletedFormulaVersions.count,
        deletedGradeHistoryCount: deletedGradeHistories.count,
      },
    };
  },
};

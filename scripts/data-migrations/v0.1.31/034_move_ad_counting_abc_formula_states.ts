import { ensureAbsoluteProductAbcFormulaForOrganization } from "../ensure/absolute-product-abc-formula";
import type { DataMigration } from "../types";

const AD_FREE_FORMULA_VERSION = 3;

/**
 * Moves every unpublished formula state that is not on the advertising-free
 * formula (version 3) to it. v0.1.31:016 moved the organizations that existed
 * when it ran; from 2026-09-17 until KID-373 the ensure step still installed
 * version 2 for organizations created later, and recalculation now refuses a
 * formula that counts advertising. The ensure function supplies the version 3
 * row (found by checksum or created) under the server's mapping and ABC locks.
 * A published state is left alone and counted, because moving a published
 * formula needs a reviewed decision. Idempotent: a state on version 3 is
 * skipped.
 */
export const moveAdCountingAbcFormulaStatesMigration: DataMigration = {
  id: "v0.1.31:034_move_ad_counting_abc_formula_states",
  releaseVersion: "0.1.31",
  name: "Move unpublished advertising-counting ABC formula states to version 3",
  phase: "post-schema",
  async run(tx) {
    const states = await tx.masterProductAbcFormulaState.findMany({
      where: {
        activeFormulaVersion: { version: { not: AD_FREE_FORMULA_VERSION } },
      },
      orderBy: { organizationId: "asc" },
      select: { organizationId: true, formulaRevision: true, publishedAt: true },
    });
    let createdFormulaVersionCount = 0;
    let movedFormulaStateCount = 0;
    let publishedStateLeftCount = 0;

    for (const state of states) {
      if (state.publishedAt !== null) {
        publishedStateLeftCount += 1;
        continue;
      }
      const formula = await ensureAbsoluteProductAbcFormulaForOrganization(tx, state.organizationId);
      if (formula.createdFormulaVersion) createdFormulaVersionCount += 1;
      await tx.masterProductAbcFormulaState.update({
        where: { organizationId: state.organizationId },
        data: {
          activeFormulaVersionId: formula.formulaVersionId,
          formulaRevision: state.formulaRevision + 1,
        },
      });
      movedFormulaStateCount += 1;
    }

    return {
      affectedRows: createdFormulaVersionCount + movedFormulaStateCount,
      details: { createdFormulaVersionCount, movedFormulaStateCount, publishedStateLeftCount },
    };
  },
};

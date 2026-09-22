import {
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH,
} from "@kiditem/shared/product-abc";
import type { DataMigration } from "../types";

const FORMULA_KEY = "PRODUCT_ABC_ABSOLUTE";
const FORMULA_VERSION = 3;

/**
 * Activates the advertising-free ABC formula (version 3) wherever a formula
 * state exists. Owner decision 2026-09-18: grade on Sellpia sales and purchase
 * cost now — no advertising generation had ever been collected, so version 2
 * could never publish. Idempotent: a state already on version 3 is left alone,
 * and the formula row is found by its immutable checksum before it is created.
 */
export const activateAdFreeProductAbcFormula: DataMigration = {
  id: "v0.1.31:016_activate_ad_free_product_abc_formula",
  releaseVersion: "0.1.31",
  name: "Activate the advertising-free product ABC formula (version 3)",
  phase: "post-schema",
  async run(tx) {
    const states = await tx.masterProductAbcFormulaState.findMany({
      select: { organizationId: true, activeFormulaVersionId: true, formulaRevision: true },
    });
    let createdFormulaVersionCount = 0;
    let activatedFormulaStateCount = 0;

    for (const state of states) {
      const formula = await findOrCreateFormula(tx, state.organizationId);
      if (formula.created) createdFormulaVersionCount += 1;
      if (state.activeFormulaVersionId === formula.id) continue;
      await tx.masterProductAbcFormulaState.update({
        where: { organizationId: state.organizationId },
        data: {
          activeFormulaVersionId: formula.id,
          formulaRevision: state.formulaRevision + 1,
        },
      });
      activatedFormulaStateCount += 1;
    }

    return {
      affectedRows: createdFormulaVersionCount + activatedFormulaStateCount,
      details: { createdFormulaVersionCount, activatedFormulaStateCount },
    };
  },
};

async function findOrCreateFormula(tx: Parameters<DataMigration["run"]>[0], organizationId: string) {
  const existing = await tx.masterProductAbcFormulaVersion.findUnique({
    where: {
      organizationId_formulaKey_version: {
        organizationId,
        formulaKey: FORMULA_KEY,
        version: FORMULA_VERSION,
      },
    },
    select: { id: true, formulaChecksum: true },
  });
  if (existing) {
    if (existing.formulaChecksum !== PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH) {
      throw new Error(`Advertising-free product ABC formula checksum mismatch for organization ${organizationId}`);
    }
    return { id: existing.id, created: false };
  }
  const created = await tx.masterProductAbcFormulaVersion.create({
    data: {
      organizationId,
      formulaKey: FORMULA_KEY,
      version: FORMULA_VERSION,
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD)),
      formulaChecksum: PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD_HASH,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

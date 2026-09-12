import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from "@kiditem/shared/product-abc";
import type { DataMigration } from "../types";

const FORMULA_KEY = "PRODUCT_ABC_ABSOLUTE";
const FORMULA_VERSION = 2;

export const initializeAbsoluteProductAbcFormula: DataMigration = {
  id: "v0.1.31:002_initialize_absolute_product_abc_formula",
  releaseVersion: "0.1.31",
  name: "Install immutable absolute product ABC current formula states",
  phase: "post-schema",
  async run(tx) {
    const organizations = await tx.organization.findMany({ select: { id: true } });
    let createdFormulaVersionCount = 0;
    let initializedFormulaStateCount = 0;

    for (const organization of organizations) {
      const formula = await findOrCreateFormula(tx, organization.id);
      const currentState = await tx.masterProductAbcFormulaState.findUnique({
        where: { organizationId: organization.id },
        select: {
          activeFormulaVersionId: true,
          formulaRevision: true,
          publicationRevision: true,
          officialCutoffDate: true,
          publishedSellpiaSourceImportRunId: true,
          publishedAdvertisingSourceImportRunId: true,
          publishedMappingGeneration: true,
          publishedAt: true,
        },
      });

      if (formula.created) createdFormulaVersionCount += 1;
      if (currentState === null) {
        await tx.masterProductAbcFormulaState.create({
          data: {
            organizationId: organization.id,
            activeFormulaVersionId: formula.id,
            formulaRevision: 1,
            publicationRevision: 0,
            officialCutoffDate: null,
            publishedSellpiaSourceImportRunId: null,
            publishedAdvertisingSourceImportRunId: null,
            publishedMappingGeneration: null,
            mappingGeneration: 0n,
            publishedAt: null,
          },
        });
        initializedFormulaStateCount += 1;
        continue;
      }

      if (isBaselineState(currentState, formula.id)) continue;
      if (!isMappingOnlyState(currentState)) {
        throw new Error(
          `Absolute product ABC reset must run before formula initialization for organization ${organization.id}`,
        );
      }

      await tx.masterProductAbcFormulaState.update({
        where: { organizationId: organization.id },
        data: {
          activeFormulaVersionId: formula.id,
          formulaRevision: 1,
          publicationRevision: 0,
          officialCutoffDate: null,
          publishedSellpiaSourceImportRunId: null,
          publishedAdvertisingSourceImportRunId: null,
          publishedMappingGeneration: null,
          publishedAt: null,
        },
      });
      initializedFormulaStateCount += 1;
    }

    return {
      affectedRows: createdFormulaVersionCount + initializedFormulaStateCount,
      details: { createdFormulaVersionCount, initializedFormulaStateCount },
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
    if (existing.formulaChecksum !== PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH) {
      throw new Error(`Absolute product ABC current formula checksum mismatch for organization ${organizationId}`);
    }
    return { id: existing.id, created: false };
  }

  const created = await tx.masterProductAbcFormulaVersion.create({
    data: {
      organizationId,
      formulaKey: FORMULA_KEY,
      version: FORMULA_VERSION,
      formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
      formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

function isMappingOnlyState(state: {
  activeFormulaVersionId: string | null;
  formulaRevision: number;
  publicationRevision: number;
  officialCutoffDate: Date | null;
  publishedSellpiaSourceImportRunId: string | null;
  publishedAdvertisingSourceImportRunId: string | null;
  publishedMappingGeneration: bigint | null;
  publishedAt: Date | null;
}): boolean {
  return state.activeFormulaVersionId === null
    && state.formulaRevision === 0
    && state.publicationRevision === 0
    && state.officialCutoffDate === null
    && state.publishedSellpiaSourceImportRunId === null
    && state.publishedAdvertisingSourceImportRunId === null
    && state.publishedMappingGeneration === null
    && state.publishedAt === null;
}

function isBaselineState(
  state: Parameters<typeof isMappingOnlyState>[0],
  formulaVersionId: string,
): boolean {
  return state.activeFormulaVersionId === formulaVersionId
    && state.formulaRevision === 1
    && state.publicationRevision === 0
    && state.officialCutoffDate === null
    && state.publishedSellpiaSourceImportRunId === null
    && state.publishedAdvertisingSourceImportRunId === null
    && state.publishedMappingGeneration === null
    && state.publishedAt === null;
}

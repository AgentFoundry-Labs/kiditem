import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

function modelBlock(schema, model) {
  const start = schema.indexOf(`model ${model} {`);
  assert.notEqual(start, -1, `${model} is missing`);
  const tail = schema.slice(start);
  const end = tail.indexOf("\n}");
  assert.notEqual(end, -1, `${model} is not closed`);
  return tail.slice(0, end + 2);
}

test("absolute ABC persistence keeps only publication-ready current state", async () => {
  const core = await read("prisma/models/core.prisma");
  const formulaVersion = modelBlock(core, "MasterProductAbcFormulaVersion");
  const formulaState = modelBlock(core, "MasterProductAbcFormulaState");
  const evaluation = modelBlock(core, "MasterProductAbcEvaluation");
  const history = modelBlock(core, "MasterProductAbcGradeHistory");

  for (const field of [
    "formulaKey",
    "version",
    "formulaJson",
    "formulaChecksum",
    "createdAt",
    "updatedAt",
  ]) assert.match(formulaVersion, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(
    formulaVersion,
    /calculationCodeChecksum|training(Start|End)Date|sampleCount|foldCount|calibration|firstActivatedAt/,
  );

  for (const field of [
    "activeFormulaVersionId",
    "formulaRevision",
    "publicationRevision",
    "officialCutoffDate",
    "publishedSellpiaSourceImportRunId",
    "publishedAdvertisingSourceImportRunId",
    "publishedMappingGeneration",
    "mappingGeneration",
    "publishedAt",
  ]) assert.match(formulaState, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(
    formulaState,
    /activatedAt|\brevision\b|recalculation|pending|dirty|requested/i,
  );

  for (const field of [
    "abcGrade",
    "weightedRevenue",
    "weightedOrderTimeSupplyCost",
    "weightedAdvertisingSpend",
    "weightedOperatingProfit",
    "operatingProfitVelocity30",
    "operatingMargin",
    "lossPersistence",
    "profitScore",
    "marginScore",
    "consistencyScore",
    "economicScore",
    "validObservationDays",
    "formulaRevision",
    "publicationRevision",
    "sellpiaSourceImportRunId",
    "advertisingSourceImportRunId",
    "sellpiaGeneration",
    "advertisingGeneration",
    "mappingGeneration",
    "gradeBasisCutoffDate",
    "calculatedAt",
  ]) assert.match(evaluation, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(
    evaluation,
    /calculationStatus|rawScore|adjustedScore|reliability|paidOrderCount|firstValidPaidSaleAt|ordersSource|runToken|costComponentsJson|statusDetail/,
  );
  assert.match(evaluation, /@@index\(\[formulaVersionId, organizationId\]\)/);

  for (const field of [
    "oldGrade",
    "newGrade",
    "economicScore",
    "weightedOperatingProfit",
    "operatingMargin",
    "previousSellpiaSourceImportRunId",
    "nextSellpiaSourceImportRunId",
    "previousAdvertisingSourceImportRunId",
    "nextAdvertisingSourceImportRunId",
    "formulaRevision",
    "publicationRevision",
    "sourceCutoffDate",
    "reason",
    "calculatedAt",
  ]) assert.match(history, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(history, /calculationStatus|adjustedScore|weightedContribution/);
  assert.match(history, /@@index\(\[formulaVersionId, organizationId\]\)/);
  assert.doesNotMatch(core, /MasterProductAbcPolicy|ABC_V2|quantile|calibration/i);
});

test("the 0.1.31 reset is followed only by un-published current installation", async () => {
  const [registry, reset, initialize] = await Promise.all([
    read("scripts/data-migrations/index.ts"),
    read("scripts/data-migrations/v0.1.31/001_reset_absolute_product_abc.ts"),
    read("scripts/data-migrations/v0.1.31/002_initialize_absolute_product_abc_formula.ts"),
  ]);

  assert.match(registry, /v0\.1\.31\/001_reset_absolute_product_abc/);
  assert.match(registry, /v0\.1\.31\/002_initialize_absolute_product_abc_formula/);
  assert.match(reset, /phase:\s*["']pre-schema["']/);
  assert.match(initialize, /phase:\s*["']post-schema["']/);
  for (const table of [
    "masterProductAbcGradeHistory",
    "masterProductAbcEvaluation",
    "masterProductAbcFormulaState",
    "masterProductAbcFormulaVersion",
  ]) assert.match(reset, new RegExp(`${table}\\.deleteMany`));
  assert.match(reset, /abcGrade:\s*null/);
  assert.match(initialize, /PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH/);
  assert.match(initialize, /formulaRevision:\s*1/);
  assert.match(initialize, /publicationRevision:\s*0/);
  assert.doesNotMatch(initialize, /masterProductAbcEvaluation|masterProductAbcGradeHistory|abcGrade/);
});

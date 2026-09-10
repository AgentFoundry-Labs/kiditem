import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ProductAbcFormulaPayloadSchema,
  type ProductAbcFormulaPayload,
} from '@kiditem/shared/product-abc';
import { lockProductMapping } from '../../../../common/product-mapping-generation';
import { readProductSaleAgeEvidence } from '../../../../common/product-sale-age';
import { PrismaService } from '../../../../prisma/prisma.service';
import { productAbcEvaluation } from '../../../mapper/product-abc-evaluation.mapper';
import { listSellingMasterProductIds } from './selling-master-product.query';
import type {
  MasterProductAbcCandidateRecord,
  MasterProductAbcEvaluationRecord,
  MasterProductAbcFormulaStateRecord,
  MasterProductAbcSourceFence,
  ProductAbcPublicationInput,
  ProductAbcRepositoryPort,
  MasterProductAbcPublicationResult,
} from '../../../application/port/out/repository/master-product-abc.repository.port';

const SELLPIA_SOURCE_TYPE = 'sellpia_product_profitability';
const ADVERTISING_SOURCE_TYPE = 'coupang_ad_profitability';
const PUBLICATION_INSERT_CHUNK = 1_000;

type CalendarValue = Date | string | null;

type FormulaStateRow = Readonly<{
  organizationId: string;
  activeFormulaVersionId: string | null;
  formulaRevision: number;
  publicationRevision: number;
  officialCutoffDate: CalendarValue;
  publishedAt: Date | null;
  publishedSellpiaSourceImportRunId: string | null;
  publishedAdvertisingSourceImportRunId: string | null;
  publishedMappingGeneration: string | null;
  mappingGeneration: string;
  formulaJson: Prisma.JsonValue | null;
}>;

type SourceRunRow = Readonly<{
  sourceImportRunId: string;
  publicationSequence: string | null;
  mappingGeneration: string | null;
  coverageStartDate: CalendarValue;
  coverageEndDate: CalendarValue;
  expiresAt: CalendarValue;
}>;

type SourceFence = Readonly<{
  complete: SourceRunRow | null;
}>;

type ExistingAbcRow = Readonly<{
  masterProductId: string;
  cachedGrade: string | null;
  evaluationId: string | null;
  evaluationGrade: string | null;
  sellpiaSourceImportRunId: string | null;
  advertisingSourceImportRunId: string | null;
}>;

@Injectable()
export class MasterProductAbcRepositoryAdapter implements ProductAbcRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getFormulaState(organizationId: string): Promise<MasterProductAbcFormulaStateRecord> {
    const row = await readFormulaState(this.prisma, organizationId, false);
    return row ? stateRecord(row) : emptyState(organizationId);
  }

  async listCurrentAbcTargetIds(organizationId: string): Promise<readonly string[]> {
    return listSellingMasterProductIds(this.prisma, organizationId);
  }

  async listEvaluations(
    organizationId: string,
    masterProductIds: readonly string[],
  ): Promise<readonly MasterProductAbcEvaluationRecord[]> {
    if (masterProductIds.length === 0) return [];
    const rows = await this.prisma.masterProduct.findMany({
      where: { organizationId, id: { in: [...masterProductIds] } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        abcEvaluation: { include: { formulaVersion: true } },
      },
    });
    return rows.map((row) => ({
      masterProductId: row.id,
      evaluation: productAbcEvaluation(row.abcEvaluation),
    } satisfies MasterProductAbcEvaluationRecord));
  }

  async publish(input: ProductAbcPublicationInput): Promise<MasterProductAbcPublicationResult> {
    assertPublicationInput(input);
    return this.prisma.$transaction(
      (tx) => publishTx(tx, input),
      { maxWait: 10_000, timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

}

async function publishTx(
  tx: Prisma.TransactionClient,
  input: ProductAbcPublicationInput,
): Promise<MasterProductAbcPublicationResult> {
  // Source owners lock source terminality before taking the shared mapping
  // fence. ABC follows the same order, then serializes its own publication.
  await lockNamed(tx, `kiditem.sellpia-product-profitability:${input.organizationId}`);
  await lockNamed(tx, `kiditem.coupang-ad-profitability:${input.organizationId}`);
  await lockProductMapping(tx, input.organizationId);
  await lockNamed(tx, `kiditem.master-product-abc:${input.organizationId}`);

  const state = await readFormulaState(tx, input.organizationId, true);
  if (!state || !state.activeFormulaVersionId || !state.formulaJson) return inputChanged();
  if (!stateMatches(state, input)) return inputChanged();
  if (!sourceSelectionsMatchMapping(input)) return inputChanged();

  const formula = ProductAbcFormulaPayloadSchema.parse(state.formulaJson);

  const [sellpia, advertising] = await Promise.all([
    readSourceFence(tx, input.organizationId, SELLPIA_SOURCE_TYPE),
    readSourceFence(tx, input.organizationId, ADVERTISING_SOURCE_TYPE),
  ]);
  if (!sourceFenceMatches(sellpia, input.sourceFences.sellpia)
    || !sourceFenceMatches(advertising, input.sourceFences.advertising)) {
    return inputChanged();
  }
  const actualCutoff = minCalendarDate(
    dateKey(sellpia.complete?.coverageEndDate ?? null),
    dateKey(advertising.complete?.coverageEndDate ?? null),
    input.targetCutoff,
  );
  // The cutoff the committed source rows still reach must be the one the
  // caller evaluated. It may legitimately stop short of the desired cutoff;
  // the official result only may not move backward from there.
  if (actualCutoff !== input.actualCutoff) {
    return inputChanged();
  }
  const officialCutoff = dateKey(state.officialCutoffDate);
  if (officialCutoff !== null && officialCutoff > actualCutoff) {
    return inputChanged();
  }

  const targetProductIds = uniqueSorted(
    await listSellingMasterProductIds(tx, input.organizationId),
  );
  if (!sameIds(targetProductIds, input.targetProductIds)) return inputChanged();
  const currentSaleAgeInputs = await readProductSaleAgeEvidence(
    tx,
    input.organizationId,
    targetProductIds,
    input.actualCutoff,
  );
  if (!sameSaleAgeInputs(input.saleAgeInputs, currentSaleAgeInputs, targetProductIds)) {
    return inputChanged();
  }
  if (!candidateSetIsValid(input, targetProductIds, formula)) return inputChanged();

  const existing = await readExistingAbcRows(tx, input.organizationId, true);
  const candidatesById = new Map(input.candidates.map((candidate) => [candidate.masterProductId, candidate]));
  const candidateSet = new Set(candidatesById.keys());
  const targetSet = new Set(targetProductIds);
  // A current selling target omitted for insufficient product evidence keeps
  // its last normal evaluation. Only products that left the target set clear.
  const clearRows = existing.filter((row) =>
    !candidateSet.has(row.masterProductId)
    && !targetSet.has(row.masterProductId)
    && (row.evaluationId !== null || row.cachedGrade !== null),
  );
  const existingById = new Map(existing.map((row) => [row.masterProductId, row]));
  const changedProductCount = input.candidates.filter((candidate) => {
    const row = existingById.get(candidate.masterProductId);
    return row?.cachedGrade !== candidate.abcGrade
      || row?.evaluationGrade !== candidate.abcGrade;
  }).length + clearRows.length;
  const nextPublicationRevision = state.publicationRevision + 1;
  const baseline = state.publicationRevision === 0;
  const transitions = baseline ? [] : gradeTransitions(existing, candidatesById, input);

  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE master_product_abc_formula_states
    SET publication_revision = ${nextPublicationRevision},
        official_cutoff_date = ${atUtcDate(actualCutoff)}::date,
        published_sellpia_source_import_run_id = ${sellpia.complete!.sourceImportRunId}::uuid,
        published_advertising_source_import_run_id = ${advertising.complete!.sourceImportRunId}::uuid,
        published_mapping_generation = ${BigInt(input.mappingGeneration)}::bigint,
        published_at = ${input.calculatedAt}::timestamptz,
        updated_at = NOW()
    WHERE organization_id = ${input.organizationId}::uuid
      AND active_formula_version_id = ${input.formulaVersionId}::uuid
      AND formula_revision = ${input.expectedFormulaRevision}
      AND publication_revision = ${input.expectedPublicationRevision}
      AND mapping_generation = ${BigInt(input.mappingGeneration)}::bigint
  `);
  if (updated !== 1) return inputChanged();

  const replacedIds = uniqueSorted([
    ...input.candidates.map(({ masterProductId }) => masterProductId),
    ...clearRows.map(({ masterProductId }) => masterProductId),
  ]);
  for (let offset = 0; offset < replacedIds.length; offset += PUBLICATION_INSERT_CHUNK) {
    await tx.masterProductAbcEvaluation.deleteMany({
      where: {
        organizationId: input.organizationId,
        masterProductId: { in: replacedIds.slice(offset, offset + PUBLICATION_INSERT_CHUNK) },
      },
    });
  }
  await insertEvaluations(tx, input, nextPublicationRevision);
  await updateGradeCache(tx, input.organizationId, input.candidates);
  await clearGradeCache(tx, input.organizationId, clearRows.map(({ masterProductId }) => masterProductId));
  if (transitions.length > 0) await insertHistory(tx, input, transitions, nextPublicationRevision);

  return {
    outcome: 'PUBLISHED',
    publicationRevision: nextPublicationRevision,
    changedProductCount,
  };
}

async function insertEvaluations(
  tx: Prisma.TransactionClient,
  input: ProductAbcPublicationInput,
  publicationRevision: number,
): Promise<void> {
  for (let offset = 0; offset < input.candidates.length; offset += PUBLICATION_INSERT_CHUNK) {
    const data = input.candidates.slice(offset, offset + PUBLICATION_INSERT_CHUNK).map((candidate) => ({
      organizationId: input.organizationId,
      masterProductId: candidate.masterProductId,
      formulaVersionId: input.formulaVersionId,
      abcGrade: candidate.abcGrade,
      weightedRevenue: new Prisma.Decimal(candidate.weightedRevenue),
      weightedOrderTimeSupplyCost: new Prisma.Decimal(candidate.weightedOrderTimeSupplyCost),
      weightedAdvertisingSpend: new Prisma.Decimal(candidate.weightedAdvertisingSpend),
      weightedOperatingProfit: new Prisma.Decimal(candidate.weightedOperatingProfit),
      operatingProfitVelocity30: new Prisma.Decimal(candidate.operatingProfitVelocity30),
      operatingMargin: decimalOrNull(candidate.operatingMargin),
      lossPersistence: new Prisma.Decimal(candidate.lossPersistence),
      profitScore: new Prisma.Decimal(candidate.profitScore),
      marginScore: decimalOrNull(candidate.marginScore),
      consistencyScore: new Prisma.Decimal(candidate.consistencyScore),
      economicScore: new Prisma.Decimal(candidate.economicScore),
      validObservationDays: candidate.validObservationDays,
      formulaRevision: input.expectedFormulaRevision,
      publicationRevision,
      gradeBasisCutoffDate: atUtcDate(candidate.gradeBasisCutoffDate),
      saleStartDate: atUtcDate(candidate.saleStartDate),
      sellpiaSourceImportRunId: candidate.sellpiaSourceImportRunId,
      advertisingSourceImportRunId: candidate.advertisingSourceImportRunId,
      sellpiaGeneration: BigInt(candidate.sellpiaGeneration),
      advertisingGeneration: BigInt(candidate.advertisingGeneration),
      mappingGeneration: BigInt(candidate.mappingGeneration),
      calculatedAt: input.calculatedAt,
    }));
    await tx.masterProductAbcEvaluation.createMany({ data });
  }
}

async function updateGradeCache(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidates: readonly MasterProductAbcCandidateRecord[],
): Promise<void> {
  for (const grade of ['A', 'B', 'C'] as const) {
    const ids = candidates.filter((candidate) => candidate.abcGrade === grade)
      .map(({ masterProductId }) => masterProductId);
    for (let offset = 0; offset < ids.length; offset += PUBLICATION_INSERT_CHUNK) {
      await tx.masterProduct.updateMany({
        where: {
          organizationId,
          id: { in: ids.slice(offset, offset + PUBLICATION_INSERT_CHUNK) },
        },
        data: { abcGrade: grade },
      });
    }
  }
}

async function clearGradeCache(
  tx: Prisma.TransactionClient,
  organizationId: string,
  ids: readonly string[],
): Promise<void> {
  for (let offset = 0; offset < ids.length; offset += PUBLICATION_INSERT_CHUNK) {
    await tx.masterProduct.updateMany({
      where: {
        organizationId,
        id: { in: [...ids.slice(offset, offset + PUBLICATION_INSERT_CHUNK)] },
      },
      data: { abcGrade: null },
    });
  }
}

type GradeTransition = Readonly<{
  masterProductId: string;
  oldGrade: 'A' | 'B' | 'C';
  newGrade: 'A' | 'B' | 'C';
  economicScore: number;
  weightedOperatingProfit: number;
  operatingMargin: number | null;
  previousSellpiaSourceImportRunId: string | null;
  previousAdvertisingSourceImportRunId: string | null;
  nextSellpiaSourceImportRunId: string;
  nextAdvertisingSourceImportRunId: string;
}>;

function gradeTransitions(
  existing: readonly ExistingAbcRow[],
  candidates: ReadonlyMap<string, MasterProductAbcCandidateRecord>,
  input: ProductAbcPublicationInput,
): GradeTransition[] {
  return existing.flatMap((row) => {
    const candidate = candidates.get(row.masterProductId);
    const oldGrade = validGrade(row.evaluationGrade) ?? validGrade(row.cachedGrade);
    if (!candidate || !oldGrade || oldGrade === candidate.abcGrade) return [];
    return [{
      masterProductId: row.masterProductId,
      oldGrade,
      newGrade: candidate.abcGrade,
      economicScore: candidate.economicScore,
      weightedOperatingProfit: candidate.weightedOperatingProfit,
      operatingMargin: candidate.operatingMargin,
      previousSellpiaSourceImportRunId: row.sellpiaSourceImportRunId,
      previousAdvertisingSourceImportRunId: row.advertisingSourceImportRunId,
      nextSellpiaSourceImportRunId: candidate.sellpiaSourceImportRunId,
      nextAdvertisingSourceImportRunId: candidate.advertisingSourceImportRunId,
    }];
  });
}

async function insertHistory(
  tx: Prisma.TransactionClient,
  input: ProductAbcPublicationInput,
  transitions: readonly GradeTransition[],
  publicationRevision: number,
): Promise<void> {
  for (let offset = 0; offset < transitions.length; offset += PUBLICATION_INSERT_CHUNK) {
    const data = transitions.slice(offset, offset + PUBLICATION_INSERT_CHUNK).map((transition) => ({
      organizationId: input.organizationId,
      masterProductId: transition.masterProductId,
      formulaVersionId: input.formulaVersionId,
      oldGrade: transition.oldGrade,
      newGrade: transition.newGrade,
      economicScore: new Prisma.Decimal(transition.economicScore),
      weightedOperatingProfit: new Prisma.Decimal(transition.weightedOperatingProfit),
      operatingMargin: decimalOrNull(transition.operatingMargin),
      previousSellpiaSourceImportRunId: transition.previousSellpiaSourceImportRunId,
      nextSellpiaSourceImportRunId: transition.nextSellpiaSourceImportRunId,
      previousAdvertisingSourceImportRunId: transition.previousAdvertisingSourceImportRunId,
      nextAdvertisingSourceImportRunId: transition.nextAdvertisingSourceImportRunId,
      formulaRevision: input.expectedFormulaRevision,
      publicationRevision,
      sourceCutoffDate: atUtcDate(input.actualCutoff),
      reason: 'EXPLICIT_RECALCULATION',
      calculatedAt: input.calculatedAt,
    }));
    await tx.masterProductAbcGradeHistory.createMany({ data });
  }
}

async function readExistingAbcRows(
  tx: Prisma.TransactionClient,
  organizationId: string,
  forUpdate: boolean,
): Promise<readonly ExistingAbcRow[]> {
  const lock = forUpdate ? Prisma.sql`FOR UPDATE OF mp` : Prisma.empty;
  return tx.$queryRaw<ExistingAbcRow[]>(Prisma.sql`
    SELECT mp.id AS "masterProductId",
           mp.abc_grade AS "cachedGrade",
           e.id AS "evaluationId",
           e.abc_grade AS "evaluationGrade",
           e.sellpia_source_import_run_id AS "sellpiaSourceImportRunId",
           e.advertising_source_import_run_id AS "advertisingSourceImportRunId"
    FROM master_products mp
    LEFT JOIN master_product_abc_evaluations e
      ON e.organization_id = mp.organization_id
     AND e.master_product_id = mp.id
    WHERE mp.organization_id = ${organizationId}::uuid
      AND (mp.abc_grade IS NOT NULL OR e.id IS NOT NULL)
    ORDER BY mp.id ASC
    ${lock}
  `);
}

async function readSourceFence(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sourceType: string,
): Promise<SourceFence> {
  const complete = await tx.$queryRaw<SourceRunRow[]>(Prisma.sql`
    SELECT id AS "sourceImportRunId",
           publication_sequence::text AS "publicationSequence",
           mapping_generation::text AS "mappingGeneration",
           coverage_start_date AS "coverageStartDate",
           coverage_end_date AS "coverageEndDate",
           expires_at AS "expiresAt"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${sourceType}
      AND status = 'completed'
      AND publication_sequence IS NOT NULL
    ORDER BY publication_sequence DESC, id DESC
    LIMIT 1
  `);
  return { complete: complete[0] ?? null };
}

async function readFormulaState(
  db: PrismaService | Prisma.TransactionClient,
  organizationId: string,
  forUpdate: boolean,
): Promise<FormulaStateRow | null> {
  const lock = forUpdate ? Prisma.sql`FOR UPDATE OF s` : Prisma.empty;
  const rows = await db.$queryRaw<FormulaStateRow[]>(Prisma.sql`
    SELECT s.organization_id AS "organizationId",
           s.active_formula_version_id AS "activeFormulaVersionId",
           s.formula_revision AS "formulaRevision",
           s.publication_revision AS "publicationRevision",
           s.official_cutoff_date AS "officialCutoffDate",
           s.published_at AS "publishedAt",
           s.published_sellpia_source_import_run_id AS "publishedSellpiaSourceImportRunId",
           s.published_advertising_source_import_run_id AS "publishedAdvertisingSourceImportRunId",
           s.published_mapping_generation::text AS "publishedMappingGeneration",
           s.mapping_generation::text AS "mappingGeneration",
           fv.formula_json AS "formulaJson"
    FROM master_product_abc_formula_states s
    LEFT JOIN master_product_abc_formula_versions fv
      ON fv.organization_id = s.organization_id
     AND fv.id = s.active_formula_version_id
    WHERE s.organization_id = ${organizationId}::uuid
    ${lock}
  `);
  return rows[0] ?? null;
}

function stateRecord(row: FormulaStateRow): MasterProductAbcFormulaStateRecord {
  return {
    organizationId: row.organizationId,
    activeFormulaVersionId: row.activeFormulaVersionId,
    formulaRevision: row.formulaRevision,
    publicationRevision: row.publicationRevision,
    officialCutoffDate: dateKey(row.officialCutoffDate),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedSellpiaSourceImportRunId: row.publishedSellpiaSourceImportRunId,
    publishedAdvertisingSourceImportRunId: row.publishedAdvertisingSourceImportRunId,
    publishedMappingGeneration: row.publishedMappingGeneration,
    mappingGeneration: row.mappingGeneration,
    formula: row.formulaJson ? ProductAbcFormulaPayloadSchema.parse(row.formulaJson) : null,
  };
}

function emptyState(organizationId: string): MasterProductAbcFormulaStateRecord {
  return {
    organizationId,
    activeFormulaVersionId: null,
    formulaRevision: 0,
    publicationRevision: 0,
    officialCutoffDate: null,
    publishedAt: null,
    publishedSellpiaSourceImportRunId: null,
    publishedAdvertisingSourceImportRunId: null,
    publishedMappingGeneration: null,
    mappingGeneration: '0',
    formula: null,
  };
}

function stateMatches(row: FormulaStateRow, input: ProductAbcPublicationInput): boolean {
  return row.activeFormulaVersionId === input.formulaVersionId
    && row.formulaRevision === input.expectedFormulaRevision
    && row.publicationRevision === input.expectedPublicationRevision
    && row.mappingGeneration === input.mappingGeneration;
}

function sourceSelectionsMatchMapping(input: ProductAbcPublicationInput): boolean {
  return [input.sourceFences.sellpia, input.sourceFences.advertising].every(({ selectedComplete }) =>
    selectedComplete.sourceImportRunId !== null
    && selectedComplete.publicationSequence !== null
    && selectedComplete.mappingGeneration === input.mappingGeneration);
}

/**
 * Fences the published generation, not the collection batch.
 *
 * The evaluated generation must still be the newest complete publication the
 * source owner exposes, with an unchanged manifest — that is what a real
 * source correction or replacement moves. A newer attempt that is still
 * RUNNING, or that FAILED, publishes no generation and so leaves this
 * evidence valid.
 */
function sourceFenceMatches(
  current: SourceFence,
  expected: MasterProductAbcSourceFence,
): boolean {
  const complete = current.complete;
  const selected = expected.selectedComplete;
  return complete !== null
    && complete.sourceImportRunId === selected.sourceImportRunId
    && sourceRunMatchesView(complete, selected);
}

function sourceRunMatchesView(
  run: SourceRunRow,
  view: MasterProductAbcSourceFence['selectedComplete'],
): boolean {
  return run.publicationSequence === view.publicationSequence
    && run.mappingGeneration === view.mappingGeneration
    && dateKey(run.coverageStartDate) === view.coverageStartDate
    && dateKey(run.coverageEndDate) === view.coverageEndDate;
}

function candidateSetIsValid(
  input: ProductAbcPublicationInput,
  targetProductIds: readonly string[],
  formula: ProductAbcFormulaPayload,
): boolean {
  const candidateIds = input.candidates.map(({ masterProductId }) => masterProductId);
  const targetIdSet = new Set(targetProductIds);
  if (new Set(candidateIds).size !== candidateIds.length
    || candidateIds.some((id) => !targetIdSet.has(id))) return false;
  const saleAgeById = new Map(input.saleAgeInputs.map((row) => [row.masterProductId, row]));
  if (input.candidates.some((candidate) =>
    candidate.sellpiaSourceImportRunId.length === 0
    || candidate.advertisingSourceImportRunId.length === 0
    || candidate.sellpiaSourceImportRunId
      !== input.sourceFences.sellpia.selectedComplete.sourceImportRunId
    || candidate.advertisingSourceImportRunId
      !== input.sourceFences.advertising.selectedComplete.sourceImportRunId
    || validGrade(candidate.abcGrade) === null
    || candidate.sellpiaGeneration !== input.sourceFences.sellpia.selectedComplete.publicationSequence
    || candidate.advertisingGeneration !== input.sourceFences.advertising.selectedComplete.publicationSequence
    || candidate.mappingGeneration !== input.mappingGeneration
    || candidate.gradeBasisCutoffDate !== input.actualCutoff
    || saleAgeById.get(candidate.masterProductId)?.mappingValid !== true
    || saleAgeById.get(candidate.masterProductId)?.saleStartDate !== candidate.saleStartDate
    || dateKey(candidate.saleStartDate) === null
    || !Number.isSafeInteger(candidate.validObservationDays)
    || candidate.validObservationDays <= 0
    || !finiteCandidate(candidate))) return false;
  return true;
}

function finiteCandidate(candidate: MasterProductAbcCandidateRecord): boolean {
  return [
    candidate.weightedRevenue,
    candidate.weightedOrderTimeSupplyCost,
    candidate.weightedAdvertisingSpend,
    candidate.weightedOperatingProfit,
    candidate.operatingProfitVelocity30,
    candidate.operatingMargin,
    candidate.lossPersistence,
    candidate.profitScore,
    candidate.marginScore,
    candidate.consistencyScore,
    candidate.economicScore,
  ].every((value) => value === null || Number.isFinite(value));
}

function assertPublicationInput(input: ProductAbcPublicationInput): void {
  if (typeof input.organizationId !== 'string' || input.organizationId.trim().length === 0) {
    throw new Error('organizationId is required');
  }
  if (!Number.isInteger(input.expectedFormulaRevision)
    || !Number.isInteger(input.expectedPublicationRevision)
    || input.expectedFormulaRevision < 1
    || input.expectedPublicationRevision < 0) {
    throw new Error('ABC publication revision is invalid');
  }
  if (!/^\d+$/.test(input.mappingGeneration)) throw new Error('mapping generation is invalid');
  if (dateKey(input.targetCutoff) === null || dateKey(input.actualCutoff) === null) {
    throw new Error('ABC publication cutoff is invalid');
  }
  if (new Set(input.targetProductIds).size !== input.targetProductIds.length) {
    throw new Error('ABC target set contains duplicate product IDs');
  }
  if (new Set(input.saleAgeInputs.map(({ masterProductId }) => masterProductId)).size
    !== input.saleAgeInputs.length) {
    throw new Error('ABC sale age inputs contain duplicate product IDs');
  }
}

function sameSaleAgeInputs(
  expected: readonly Readonly<{
    masterProductId: string;
    mappingValid: boolean;
    saleStartDate: string | null;
  }>[],
  actual: readonly Readonly<{
    masterProductId: string;
    mappingValid: boolean;
    saleStartDate: string | null;
  }>[],
  targetProductIds: readonly string[],
): boolean {
  if (expected.length !== targetProductIds.length || actual.length !== targetProductIds.length) {
    return false;
  }
  const expectedById = new Map(expected.map((row) => [row.masterProductId, row]));
  const actualById = new Map(actual.map((row) => [row.masterProductId, row]));
  return targetProductIds.every((masterProductId) =>
    expectedById.has(masterProductId)
      && actualById.has(masterProductId)
      && expectedById.get(masterProductId)?.mappingValid
        === actualById.get(masterProductId)?.mappingValid
      && expectedById.get(masterProductId)?.saleStartDate
        === actualById.get(masterProductId)?.saleStartDate);
}

async function lockNamed(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0::bigint))::text AS "lock"
  `);
}

function inputChanged(): MasterProductAbcPublicationResult {
  return { outcome: 'INPUT_CHANGED' };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function validGrade(value: string | null): 'A' | 'B' | 'C' | null {
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}

function dateKey(value: CalendarValue): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function minCalendarDate(...values: readonly (string | null)[]): string {
  const present = values.filter((value): value is string => value !== null);
  if (present.length === 0) return '';
  return present.sort()[0]!;
}

function atUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalOrNull(value: number | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import { Prisma } from '@prisma/client';
import {
  ADVERTISING_PROFITABILITY_READ_PORT,
  type AdvertisingProfitabilityGeneration,
  type AdvertisingProfitabilityGenerationSummary,
  type AdvertisingProfitabilityReadPort,
} from '../../../advertising/application/port/in/profitability-ad-import.port';
import {
  SELLPIA_PROFITABILITY_SOURCE_READ_PORT,
  type SellpiaProfitabilityFact,
  type SellpiaProfitabilityGenerationFacts,
  type SellpiaProfitabilityGenerationMetadata,
  type SellpiaProfitabilitySourceReadPort,
} from '../../../analytics/application/port/in/sellpia-profitability-source-read.port';
import { PrismaService } from '../../../prisma/prisma.service';
import { kstMonthEnd, kstMonthRange } from '../../../common/kst';
import {
  type MasterProductAbcFormulaReadyMonthlyFact,
  type ProductProfitabilityEvidence,
  type ProfitabilityEvidence,
  type ProfitabilityEvidenceSnapshot,
  type SourceGenerationView,
  type SourceReadiness,
} from '../port/in/master-product-profitability-read.port';

const MAX_COMPLETE_MONTHS = 12;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_MS = 86_400_000;

type SellpiaGeneration = Readonly<{
  metadata: SellpiaProfitabilityGenerationMetadata;
  view: SourceGenerationView;
}>;

type AdvertisingGeneration = Readonly<{
  metadata: AdvertisingProfitabilityGenerationSummary;
  view: SourceGenerationView;
}>;

type SelectedPair = Readonly<{
  sellpia: SellpiaGeneration;
  advertising: AdvertisingGeneration;
  actualCutoff: string;
  mappingGeneration: string;
}>;

type ProductRow = Readonly<{
  id: string;
  isActive: boolean;
  mappingValid: boolean;
}>;

type ProductSnapshot = Readonly<{
  products: readonly ProductRow[];
  mappingGeneration: string;
}>;

type SellpiaMonth = Readonly<{
  coverageStartDate: string;
  coverageEndDate: string;
  coveredDays: number;
  revenue: number;
  orderTimeSupplyCost: number;
}>;

type AdvertisingMonth = Readonly<{
  coverageStartDate: string;
  coverageEndDate: string;
  allocatedSpend: number;
}>;

@Injectable()
export class MasterProductProfitabilityReadService
  implements ProfitabilityEvidence
{
  constructor(
    @Inject(SELLPIA_PROFITABILITY_SOURCE_READ_PORT)
    private readonly sellpia: SellpiaProfitabilitySourceReadPort,
    @Inject(ADVERTISING_PROFITABILITY_READ_PORT)
    private readonly advertising: AdvertisingProfitabilityReadPort,
    private readonly prisma: PrismaService,
  ) {}

  async load(input: {
    organizationId: string;
    targetCutoff: string;
  }): Promise<ProfitabilityEvidenceSnapshot> {
    const organizationId = requiredOrganizationId(input.organizationId);
    const targetCutoff = parseMonthEnd(input.targetCutoff);
    const months = kstMonthRange(targetCutoff, MAX_COMPLETE_MONTHS);

    const [productSnapshot, sellpiaCatalog, advertisingSnapshot] = await Promise.all([
      this.readProductSnapshot(organizationId),
      this.sellpia.readGenerationCatalog({ organizationId, limit: MAX_COMPLETE_MONTHS }),
      this.advertising.readSourceSnapshot({ organizationId, limit: MAX_COMPLETE_MONTHS }),
    ]);
    const { products, mappingGeneration } = productSnapshot;

    const sellpiaGenerations = sellpiaCatalog.completeGenerations.map(normalizeSellpiaGeneration);
    const advertisingGenerations = advertisingSnapshot.completeGenerations
      .map(normalizeAdvertisingGeneration);
    const selected = selectCompatiblePair(
      sellpiaGenerations,
      advertisingGenerations,
      targetCutoff,
      mappingGeneration,
    );
    const latestSellpia = sellpiaGenerations[0] ?? null;
    const latestAdvertising = advertisingGenerations[0] ?? null;
    const currentSellpia = selected?.sellpia
      ?? sellpiaGenerations.find((generation) =>
        generation.metadata.mappingGeneration === mappingGeneration)
      ?? null;
    const currentAdvertising = selected?.advertising
      ?? advertisingGenerations.find((generation) =>
        generation.metadata.mappingGeneration === mappingGeneration)
      ?? null;
    const sources = {
      sellpia: sourceReadiness(
        sellpiaCatalog.latestAttempt?.state ?? null,
        sellpiaCatalog.latestAttempt?.attemptId ?? null,
        latestSellpia,
        currentSellpia,
        targetCutoff,
        sellpiaCatalog.latestAttempt?.errorCode ?? null,
      ),
      advertising: sourceReadiness(
        advertisingSnapshot.latestAttempt?.state ?? null,
        advertisingSnapshot.latestAttempt?.sourceImportRunId
          ?? advertisingSnapshot.latestAttempt?.attemptId
          ?? null,
        latestAdvertising,
        currentAdvertising,
        targetCutoff,
        advertisingSnapshot.latestAttempt?.errorCode ?? null,
      ),
    } satisfies ProfitabilityEvidenceSnapshot['sources'];

    if (!selected) {
      return {
        targetCutoff: input.targetCutoff,
        actualCutoff: null,
        mappingGeneration: null,
        sourceVector: {
          sellpia: latestSellpia?.view ?? emptyGeneration(),
          advertising: latestAdvertising?.view ?? emptyGeneration(),
        },
        sources,
        products: products.map((product) => emptyProduct(product)),
      };
    }
    const evidenceMonths = months.filter((yearMonth) =>
      kstMonthEnd(yearMonth) <= selected.actualCutoff);

    const [sellpiaFacts, advertisingGeneration] = await Promise.all([
      this.sellpia.readGenerationFacts({
        organizationId,
        sourceImportRunId: selected.sellpia.metadata.sourceImportRunId,
        masterProductIds: products.map((product) => product.id),
        yearMonths: evidenceMonths,
      }),
      this.advertising.readGeneration({
        organizationId,
        sourceImportRunId: selected.advertising.metadata.sourceImportRunId,
      }),
    ]);
    assertSelectedSellpiaGeneration(sellpiaFacts, selected.sellpia.metadata);
    if (!advertisingGeneration) {
      throw new UnprocessableEntityException('SOURCE_GENERATION_NOT_FOUND');
    }
    assertSelectedAdvertisingGeneration(advertisingGeneration, selected.advertising.metadata);

    const sellpiaByProduct = aggregateSellpiaFacts(
      sellpiaFacts.facts,
      selected,
      evidenceMonths,
      products.filter((product) => product.mappingValid).map((product) => product.id),
    );
    const advertisingByProduct = aggregateAdvertisingFacts(
      advertisingGeneration,
      selected,
      evidenceMonths,
    );
    const productEvidence = products.map((product) => buildProductEvidence({
      product,
      sellpia: sellpiaByProduct.get(product.id) ?? new Map(),
      advertising: advertisingByProduct.get(product.id) ?? new Map(),
      cutoff: selected.actualCutoff,
      advertisingCoverageStartDate: selected.advertising.view.coverageStartDate,
      advertisingCoverageEndDate: minDate(
        selected.advertising.view.coverageEndDate,
        selected.actualCutoff,
      ),
    }));

    return {
      targetCutoff: input.targetCutoff,
      actualCutoff: selected.actualCutoff,
      mappingGeneration: selected.mappingGeneration,
      sourceVector: {
        sellpia: selected.sellpia.view,
        advertising: selected.advertising.view,
      },
      sources,
      products: productEvidence,
    };
  }

  private async readProductSnapshot(organizationId: string): Promise<ProductSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      const [products, state] = await Promise.all([
        tx.masterProduct.findMany({
          where: { organizationId },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            isActive: true,
            _count: { select: { inventorySkus: true } },
          },
        }),
        tx.masterProductAbcFormulaState.findUnique({
          where: { organizationId },
          select: { mappingGeneration: true },
        }),
      ]);
      return {
        products: products.map((product) => ({
          id: product.id,
          isActive: product.isActive,
          mappingValid: product._count.inventorySkus > 0,
        })),
        mappingGeneration: (state?.mappingGeneration ?? 0n).toString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

function requiredOrganizationId(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException('Profitability evidence requires an organization');
  }
  return value.trim();
}

function parseMonthEnd(value: string): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new BadRequestException('Profitability evidence cutoff must be a calendar date');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== value
    || kstMonthEnd(value.slice(0, 7)) !== value) {
    throw new BadRequestException(
      'Profitability evidence cutoff must be the final day of a complete KST month',
    );
  }
  return value;
}

function normalizeSellpiaGeneration(
  generation: SellpiaProfitabilityGenerationMetadata,
): SellpiaGeneration {
  const from = parseDate(generation.coverage.from, 'SOURCE_COVERAGE_MALFORMED');
  const to = parseDate(generation.coverage.to, 'SOURCE_COVERAGE_MALFORMED');
  if (from > to || !YEAR_MONTH_PATTERN.test(generation.coverage.coveredMonths[0] ?? '')) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_PROVENANCE_MALFORMED');
  }
  if (generation.quality.provenance.costBasis !== 'ORDER_TIME_SUPPLY_COST'
    || generation.quality.provenance.vatIncluded !== true
    || generation.quality.mappingGeneration !== generation.mappingGeneration) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_PROVENANCE_MALFORMED');
  }
  return {
    metadata: generation,
    view: {
      sourceImportRunId: generation.sourceImportRunId,
      publicationSequence: generation.publicationSequence,
      mappingGeneration: generation.mappingGeneration,
      coverageStartDate: from,
      coverageEndDate: to,
      capturedAt: generation.capturedAt,
    },
  };
}

function normalizeAdvertisingGeneration(
  generation: AdvertisingProfitabilityGenerationSummary,
): AdvertisingGeneration {
  const from = parseDate(generation.coverageStartDate, 'SOURCE_COVERAGE_MALFORMED');
  const to = parseDate(generation.coveredThrough, 'SOURCE_COVERAGE_MALFORMED');
  if (from > to
    || generation.adSourcePolicyHash !== PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH
    || generation.mappingGeneration !== generation.frozenRecipePolicy.mappingGeneration
    || generation.frozenRecipePolicy.adSourcePolicyHash
      !== PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_PROVENANCE_MALFORMED');
  }
  return {
    metadata: generation,
    view: {
      sourceImportRunId: generation.sourceImportRunId,
      publicationSequence: generation.publicationSequence,
      mappingGeneration: generation.mappingGeneration,
      coverageStartDate: from,
      coverageEndDate: to,
      capturedAt: generation.capturedAt,
    },
  };
}

function selectCompatiblePair(
  sellpia: readonly SellpiaGeneration[],
  advertising: readonly AdvertisingGeneration[],
  targetCutoff: string,
  currentMappingGeneration: string,
): SelectedPair | null {
  const pairs: SelectedPair[] = [];
  for (const sellpiaGeneration of sellpia) {
    for (const advertisingGeneration of advertising) {
      if (sellpiaGeneration.metadata.mappingGeneration
        !== advertisingGeneration.metadata.mappingGeneration
        || sellpiaGeneration.metadata.mappingGeneration !== currentMappingGeneration) continue;
      const actualCutoff = minDate(
        targetCutoff,
        sellpiaGeneration.view.coverageEndDate,
        advertisingGeneration.view.coverageEndDate,
      );
      if (!actualCutoff) continue;
      pairs.push({
        sellpia: sellpiaGeneration,
        advertising: advertisingGeneration,
        actualCutoff,
        mappingGeneration: sellpiaGeneration.metadata.mappingGeneration,
      });
    }
  }
  return pairs.sort((left, right) =>
    right.actualCutoff.localeCompare(left.actualCutoff)
    || compareSequence(right.sellpia.metadata.publicationSequence, left.sellpia.metadata.publicationSequence)
    || compareSequence(right.advertising.metadata.publicationSequence, left.advertising.metadata.publicationSequence),
  )[0] ?? null;
}

function sourceReadiness(
  latestAttemptState: 'RUNNING' | 'COMPLETE' | 'FAILED' | null,
  latestAttemptId: string | null,
  latestComplete: SellpiaGeneration | AdvertisingGeneration | null,
  selected: SellpiaGeneration | AdvertisingGeneration | null,
  targetCutoff: string,
  errorCode: string | null = null,
): SourceReadiness {
  if (!latestComplete) {
    return { status: 'MISSING', actualCutoff: null, latestAttemptState, errorCode };
  }
  const actualCutoff = minDate(
    targetCutoff,
    selected?.view.coverageEndDate ?? latestComplete.view.coverageEndDate,
  );
  const latestCompleteIsCurrent = latestAttemptState === 'COMPLETE'
    && latestAttemptId === latestComplete.view.sourceImportRunId;
  const selectedIsLatest = selected?.view.sourceImportRunId === latestComplete.view.sourceImportRunId;
  const status = latestCompleteIsCurrent
    && selectedIsLatest
    && latestComplete.view.coverageEndDate !== null
    && latestComplete.view.coverageEndDate >= targetCutoff
    ? 'READY'
    : 'STALE';
  return { status, actualCutoff, latestAttemptState, errorCode };
}

function emptyGeneration(): SourceGenerationView {
  return {
    sourceImportRunId: null,
    publicationSequence: null,
    mappingGeneration: null,
    coverageStartDate: null,
    coverageEndDate: null,
    capturedAt: null,
  };
}

function emptyProduct(product: ProductRow): ProductProfitabilityEvidence {
  return {
    masterProductId: product.id,
    selling: product.isActive,
    mappingValid: product.mappingValid,
    validObservationDays: 0,
    formulaReadyFacts: null,
  };
}

function aggregateSellpiaFacts(
  facts: readonly SellpiaProfitabilityFact[],
  selected: SelectedPair,
  months: readonly string[],
  mappedProductIds: readonly string[],
): Map<string, Map<string, SellpiaMonth>> {
  const allowedMonths = new Set(months);
  const result = new Map(
    mappedProductIds.map((masterProductId) => [masterProductId, new Map<string, SellpiaMonth>()]),
  );
  for (const fact of facts) {
    if (fact.sourceImportRunId !== selected.sellpia.metadata.sourceImportRunId
      || !allowedMonths.has(fact.yearMonth)) continue;
    const start = parseDate(fact.coverageStartDate, 'SOURCE_COVERAGE_MALFORMED');
    const end = parseDate(fact.coverageEndDate, 'SOURCE_COVERAGE_MALFORMED');
    if (!YEAR_MONTH_PATTERN.test(fact.yearMonth)
      || start > end
      || `${fact.yearMonth}-01` > start
      || kstMonthEnd(fact.yearMonth) < end
      || fact.costBasis !== 'ORDER_TIME_SUPPLY_COST'
      || fact.vatIncluded !== true
      || !nonNegativeInteger(fact.revenue)
      || !nonNegativeInteger(fact.orderTimeSupplyCost)) {
      throw new UnprocessableEntityException('SOURCE_FACT_PROVENANCE_MALFORMED');
    }
    const byMonth = result.get(fact.masterProductId);
    if (!byMonth) continue;
    const previous = byMonth.get(fact.yearMonth);
    if (previous && (previous.coverageStartDate !== start || previous.coverageEndDate !== end)) {
      throw new UnprocessableEntityException('SOURCE_COVERAGE_MISMATCH');
    }
    const coveredDays = calendarDaysInclusive(start, end);
    byMonth.set(fact.yearMonth, {
      coverageStartDate: start,
      coverageEndDate: end,
      coveredDays: previous?.coveredDays ?? coveredDays,
      revenue: addMoney(previous?.revenue ?? 0, fact.revenue),
      orderTimeSupplyCost: addMoney(
        previous?.orderTimeSupplyCost ?? 0,
        fact.orderTimeSupplyCost,
      ),
    });
  }
  const coveredMonths = new Set(selected.sellpia.metadata.coverage.coveredMonths);
  for (const byMonth of result.values()) {
    for (const yearMonth of months) {
      if (byMonth.has(yearMonth) || !coveredMonths.has(yearMonth)) continue;
      const coverageStartDate = maxDate(
        `${yearMonth}-01`,
        selected.sellpia.view.coverageStartDate,
      );
      const coverageEndDate = minDate(
        kstMonthEnd(yearMonth),
        selected.sellpia.view.coverageEndDate,
        selected.actualCutoff,
      );
      if (!coverageStartDate || !coverageEndDate || coverageStartDate > coverageEndDate) continue;
      byMonth.set(yearMonth, {
        coverageStartDate,
        coverageEndDate,
        coveredDays: calendarDaysInclusive(coverageStartDate, coverageEndDate),
        revenue: 0,
        orderTimeSupplyCost: 0,
      });
    }
  }
  return result;
}

function aggregateAdvertisingFacts(
  generation: AdvertisingProfitabilityGeneration,
  selected: SelectedPair,
  months: readonly string[],
): Map<string, Map<string, AdvertisingMonth>> {
  if (generation.summary.sourceImportRunId !== selected.advertising.metadata.sourceImportRunId) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_MISMATCH');
  }
  const allowedMonths = new Set(months);
  const result = new Map<string, Map<string, AdvertisingMonth>>();
  for (const fact of generation.allocations) {
    if (!allowedMonths.has(fact.month)) continue;
    if (fact.mappingGeneration !== selected.mappingGeneration
      || !nonNegativeInteger(fact.allocatedSpend)
      || !Number.isInteger(fact.observedTargetDayCount)
      || fact.observedTargetDayCount < 0) {
      throw new UnprocessableEntityException('SOURCE_FACT_PROVENANCE_MALFORMED');
    }
    const start = parseDate(fact.coveredStartDate, 'SOURCE_COVERAGE_MALFORMED');
    const end = parseDate(fact.coveredEndDate, 'SOURCE_COVERAGE_MALFORMED');
    if (start > end || `${fact.month}-01` > start || kstMonthEnd(fact.month) < end) {
      throw new UnprocessableEntityException('SOURCE_COVERAGE_MALFORMED');
    }
    const byMonth = result.get(fact.masterProductId) ?? new Map<string, AdvertisingMonth>();
    const previous = byMonth.get(fact.month);
    if (previous && (previous.coverageStartDate !== start || previous.coverageEndDate !== end)) {
      throw new UnprocessableEntityException('SOURCE_COVERAGE_MISMATCH');
    }
    byMonth.set(fact.month, {
      coverageStartDate: start,
      coverageEndDate: end,
      allocatedSpend: addMoney(previous?.allocatedSpend ?? 0, fact.allocatedSpend),
    });
    result.set(fact.masterProductId, byMonth);
  }
  return result;
}

function buildProductEvidence(input: {
  product: ProductRow;
  sellpia: ReadonlyMap<string, SellpiaMonth>;
  advertising: ReadonlyMap<string, AdvertisingMonth>;
  cutoff: string;
  advertisingCoverageStartDate: string | null;
  advertisingCoverageEndDate: string | null;
}): ProductProfitabilityEvidence {
  if (input.sellpia.size === 0) return emptyProduct(input.product);
  const monthlyFacts: MasterProductAbcFormulaReadyMonthlyFact[] = [];
  for (const [yearMonth, sellpia] of [...input.sellpia.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const advertising = input.advertising.get(yearMonth);
    if (advertising
      && (advertising.coverageStartDate !== sellpia.coverageStartDate
        || advertising.coverageEndDate !== sellpia.coverageEndDate)) continue;
    if (!advertising && (!input.advertisingCoverageStartDate
      || !input.advertisingCoverageEndDate
      || sellpia.coverageStartDate < input.advertisingCoverageStartDate
      || sellpia.coverageEndDate > input.advertisingCoverageEndDate)) continue;
    const advertisingEvidence = advertising
      ? advertising.allocatedSpend > 0 ? 'OBSERVED' : 'CONFIRMED_ZERO'
      : 'NOT_APPLIED';
    monthlyFacts.push({
      yearMonth,
      coverageStartDate: sellpia.coverageStartDate,
      coverageEndDate: sellpia.coverageEndDate,
      coveredDays: sellpia.coveredDays,
      recognizedRevenue: sellpia.revenue,
      orderTimeSupplyCost: sellpia.orderTimeSupplyCost,
      advertisingSpend: advertising?.allocatedSpend ?? 0,
      provenance: {
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
        advertisingEvidence,
      },
    });
  }
  return {
    masterProductId: input.product.id,
    selling: input.product.isActive,
    mappingValid: input.product.mappingValid,
    validObservationDays: monthlyFacts.reduce((sum, fact) => sum + fact.coveredDays, 0),
    formulaReadyFacts: monthlyFacts.length > 0
      ? {
        masterProductId: input.product.id,
        cutoffDate: input.cutoff,
        monthlyFacts,
      }
      : null,
  };
}

function assertSelectedSellpiaGeneration(
  facts: SellpiaProfitabilityGenerationFacts,
  selected: SellpiaProfitabilityGenerationMetadata,
): void {
  if (facts.generation.sourceImportRunId !== selected.sourceImportRunId
    || facts.generation.mappingGeneration !== selected.mappingGeneration) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_MISMATCH');
  }
}

function assertSelectedAdvertisingGeneration(
  generation: AdvertisingProfitabilityGeneration,
  selected: AdvertisingProfitabilityGenerationSummary,
): void {
  if (generation.summary.sourceImportRunId !== selected.sourceImportRunId
    || generation.summary.mappingGeneration !== selected.mappingGeneration
    || generation.summary.adSourcePolicyHash !== selected.adSourcePolicyHash) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_MISMATCH');
  }
}

function parseDate(value: string, code: string): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new UnprocessableEntityException(code);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new UnprocessableEntityException(code);
  }
  return value;
}

function minDate(...values: readonly (string | null)[]): string | null {
  const dates = values.filter((value): value is string => value !== null);
  return dates.length === 0 ? null : dates.sort()[0]!;
}

function maxDate(...values: readonly (string | null)[]): string | null {
  const dates = values.filter((value): value is string => value !== null);
  return dates.length === 0 ? null : dates.sort().at(-1)!;
}

function compareSequence(left: string, right: string): number {
  return BigInt(left) > BigInt(right) ? 1 : BigInt(left) < BigInt(right) ? -1 : 0;
}

function nonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function addMoney(left: number, right: number): number {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new UnprocessableEntityException('SOURCE_VALUE_OVERFLOW');
  }
  return total;
}

function calendarDaysInclusive(start: string, end: string): number {
  return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / DAY_MS) + 1;
}

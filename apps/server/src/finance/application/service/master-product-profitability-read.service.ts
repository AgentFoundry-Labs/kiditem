import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import {
  deriveSourceReadiness,
  type SourceReadiness,
} from '@kiditem/shared/source-readiness';
import { Prisma } from '@prisma/client';
import {
  ADVERTISING_PROFITABILITY_READ_PORT,
  type AdvertisingProfitabilityGeneration,
  type AdvertisingProfitabilityGenerationSummary,
  type AdvertisingProfitabilityReadPort,
} from '../../../advertising/application/port/in/profitability-ad-import.port';
import { adReportEvidenceCutoff } from '../../../advertising/domain/ad-report-confirmation';
import {
  SELLPIA_PROFITABILITY_SOURCE_READ_PORT,
  type SellpiaProfitabilityFact,
  type SellpiaProfitabilityGenerationFacts,
  type SellpiaProfitabilityGenerationMetadata,
  type SellpiaProfitabilitySourceReadPort,
} from '../../../analytics/application/port/in/sellpia-profitability-source-read.port';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  businessDateKey,
  datesInclusive,
  evidenceCutoffDate,
  kstMonthEnd,
  parseBusinessDate,
} from '../../../common/kst';
import { readProductSaleAgeEvidence } from '../../../common/product-sale-age';
import {
  INVENTORY_TRANSACTIONAL_READ_PORT,
  type InventoryTransactionalReadPort,
} from '../../../inventory/application/port/in/stock/inventory-transactional-read.port';
import {
  type MasterProductAbcFormulaReadyMonthlyFact,
  type ProductProfitabilityEvidence,
  type ProfitabilityEvidence,
  type ProfitabilityEvidenceSnapshot,
  type SourceGenerationView,
} from '../port/in/master-product-profitability-read.port';

const MAX_CALENDAR_MONTHS = 12;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

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
  saleStartDate: string | null;
}>;

type ProductSnapshot = Readonly<{
  products: readonly ProductRow[];
  mappingGeneration: string;
}>;

type SellpiaMonth = Readonly<{
  coverageStartDate: string;
  coverageEndDate: string;
  coveredDays: number;
  coverageValid: boolean;
  revenue: number;
  orderTimeSupplyCost: number;
}>;

type AdvertisingMonth = Readonly<{
  coverageStartDate: string;
  coverageEndDate: string;
  coveredDays: number;
  coverageValid: boolean;
  allocatedSpend: number;
}>;

type EvaluationBucket = Readonly<{
  yearMonth: string;
  coverageStartDate: string;
  coverageEndDate: string;
  coveredDays: number;
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
    @Inject(INVENTORY_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: InventoryTransactionalReadPort,
  ) {}

  async load(input: {
    organizationId: string;
    targetCutoff: string;
  }): Promise<ProfitabilityEvidenceSnapshot> {
    const organizationId = requiredOrganizationId(input.organizationId);
    const targetCutoff = parseClosedCutoff(input.targetCutoff);
    const months = calendarMonthRange(targetCutoff, MAX_CALENDAR_MONTHS);

    // Keep the repeatable product snapshot isolated from the two source-catalog
    // transactions. This bounds peak pool usage when Product Operations and
    // profitability are requested together; the snapshot remains the sole
    // authority for products and mapping generation.
    const productSnapshot = await this.readProductSnapshot(organizationId, targetCutoff);
    const [sellpiaCatalog, advertisingSnapshot] = await Promise.all([
      this.sellpia.readGenerationCatalog({ organizationId, limit: MAX_CALENDAR_MONTHS }),
      this.advertising.readSourceSnapshot({ organizationId, limit: MAX_CALENDAR_MONTHS }),
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
    // Readiness is each source's own: its newest generation on the current
    // mapping, whether or not that is the generation paired for publication.
    const currentSellpia = sellpiaGenerations.find((generation) =>
      generation.metadata.mappingGeneration === mappingGeneration) ?? null;
    const currentAdvertising = advertisingGenerations.find((generation) =>
      generation.metadata.mappingGeneration === mappingGeneration) ?? null;
    const sources = {
      sellpia: sourceReadiness(
        sellpiaCatalog.latestAttempt?.state ?? null,
        sellpiaCatalog.latestAttempt?.attemptId ?? null,
        currentSellpia,
        targetCutoff,
        sellpiaCatalog.latestAttempt?.errorCode ?? null,
      ),
      advertising: sourceReadiness(
        advertisingSnapshot.latestAttempt?.state ?? null,
        advertisingSnapshot.latestAttempt?.sourceImportRunId
          ?? advertisingSnapshot.latestAttempt?.attemptId
          ?? null,
        currentAdvertising,
        // Advertising is due only through the days Coupang has reported.
        adReportEvidenceCutoff({
          closedDay: targetCutoff,
          collections: [currentAdvertising
            ? {
              requestedEnd: currentAdvertising.metadata.requestedThrough,
              confirmedEnd: currentAdvertising.metadata.coveredThrough,
            }
            : null],
        }),
        advertisingSnapshot.latestAttempt?.errorCode ?? null,
      ),
    } satisfies ProfitabilityEvidenceSnapshot['sources'];

    if (!selected) {
      return {
        targetCutoff: input.targetCutoff,
        actualCutoff: null,
        mappingGeneration: null,
        contributionBasis: null,
        sourceVector: {
          sellpia: latestSellpia?.view ?? emptyGeneration(),
          advertising: latestAdvertising?.view ?? emptyGeneration(),
        },
        sources,
        products: products.map((product) => emptyProduct(product)),
      };
    }
    const evidenceMonths = months.filter((yearMonth) =>
      `${yearMonth}-01` <= selected.actualCutoff);

    const sellpiaFacts = await this.sellpia.readGenerationFacts({
      organizationId,
      sourceImportRunId: selected.sellpia.metadata.sourceImportRunId,
      // Invalid mappings cannot contribute to the result; the source adapter
      // still validates the complete immutable generation before projecting.
      masterProductIds: products
        .filter((product) => product.mappingValid)
        .map((product) => product.id),
      yearMonths: evidenceMonths,
    });
    const advertisingGeneration = await this.advertising.readGeneration({
      organizationId,
      sourceImportRunId: selected.advertising.metadata.sourceImportRunId,
    });
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
      costEvidenceValid: selected.sellpia.metadata.quality.correctedCostEvidence === true,
      expectedBuckets: evaluationBuckets(
        evidenceMonths,
        selected,
      ),
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
      contributionBasis: fullMonthContributionBasis(selected),
      sourceVector: {
        sellpia: selected.sellpia.view,
        advertising: selected.advertising.view,
      },
      sources,
      products: productEvidence,
    };
  }

  private async readProductSnapshot(
    organizationId: string,
    targetCutoff: string,
  ): Promise<ProductSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      const products = await tx.masterProduct.findMany({
        where: { organizationId },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          isActive: true,
        },
      });
      // A Prisma interactive transaction owns one database client. Do not
      // overlap queries on that client: PrismaPg reports "client.query when
      // already executing" and can leave the second read waiting for the
      // transaction timeout under Product Hub fan-out.
      const state = await tx.masterProductAbcFormulaState.findUnique({
        where: { organizationId },
        select: { mappingGeneration: true },
      });
      const saleAgeEvidence = await readProductSaleAgeEvidence(
        tx,
        organizationId,
        products.map((product) => product.id),
        null,
        this.inventoryTransactionalRead,
      );
      const saleStartDateByProduct = new Map(
        saleAgeEvidence.map((evidence) => [evidence.masterProductId, evidence]),
      );
      return {
        products: products.map((product) => ({
          id: product.id,
          isActive: product.isActive,
          mappingValid: saleStartDateByProduct.get(product.id)?.mappingValid ?? false,
          saleStartDate: beforeOrOnCutoff(
            saleStartDateByProduct.get(product.id)?.saleStartDate ?? null,
            targetCutoff,
          ),
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

// Display contribution uses the selected source interval, including a partial
// cutoff month. It is independent from ABC eligibility.
function fullMonthContributionBasis(selected: SelectedPair) {
  const from = maxDate(
    selected.sellpia.view.coverageStartDate,
    selected.advertising.view.coverageStartDate,
  );
  if (!from || from > selected.actualCutoff) return null;
  const windowStart = calendarMonthRange(selected.actualCutoff, MAX_CALENDAR_MONTHS)[0]!;
  return {
    basisFromDate: maxDate(from, `${windowStart}-01`)!,
    basisCutoffDate: selected.actualCutoff,
  };
}

function parseClosedCutoff(value: string): string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new BadRequestException('Profitability evidence cutoff must be a calendar date');
  }
  const date = parseBusinessDate(value);
  if (!date
    || value > latestClosedKstDate()) {
    throw new BadRequestException(
      'Profitability evidence cutoff must be a closed KST calendar date',
    );
  }
  return value;
}

function latestClosedKstDate(now = new Date()): string {
  return businessDateKey(evidenceCutoffDate(now));
}

function calendarMonthRange(targetCutoff: string, count: number): string[] {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/.exec(targetCutoff);
  if (!match) throw new Error('Expected a calendar cutoff');
  const normalizedCount = Math.max(1, Math.floor(count));
  const year = Number(match[1]);
  const month = Number(match[2]);
  return Array.from({ length: normalizedCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (normalizedCount - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
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
  const requested = parseDate(generation.requestedThrough, 'SOURCE_COVERAGE_MALFORMED');
  if (from > to || to > requested
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
      if (!actualCutoff || !coversCutoffMonth(actualCutoff, sellpiaGeneration, advertisingGeneration)) {
        continue;
      }
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
  selected: SellpiaGeneration | AdvertisingGeneration | null,
  requiredCutoff: string,
  errorCode: string | null = null,
): SourceReadiness {
  const latestAttempt = latestAttemptState
    ? { state: latestAttemptState, attemptId: latestAttemptId, errorCode }
    : null;
  const latestCompleteView = selected?.view ?? null;
  const complete = latestCompleteView?.coverageEndDate
    ? {
      actualCutoff: latestCompleteView.coverageEndDate,
      sourceImportRunId: latestCompleteView.sourceImportRunId,
      publicationSequence: latestCompleteView.publicationSequence,
      mappingGeneration: latestCompleteView.mappingGeneration,
      coverageStartDate: latestCompleteView.coverageStartDate,
      coverageEndDate: latestCompleteView.coverageEndDate,
      capturedAt: latestCompleteView.capturedAt,
    }
    : null;
  return deriveSourceReadiness({
    latestAttempt,
    latestComplete: complete,
    requiredCutoff,
  });
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
    saleStartDate: product.saleStartDate,
    evaluationPeriodComplete: false,
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
    const coveredDays = calendarDaysInclusive(start, end);
    byMonth.set(fact.yearMonth, {
      coverageStartDate: previous?.coverageStartDate ?? start,
      coverageEndDate: previous?.coverageEndDate ?? end,
      coveredDays: previous?.coveredDays ?? coveredDays,
      coverageValid: (previous?.coverageValid ?? true)
        && (!previous || (previous.coverageStartDate === start && previous.coverageEndDate === end)),
      revenue: addMoney(previous?.revenue ?? 0, fact.revenue),
      orderTimeSupplyCost: addMoney(
        previous?.orderTimeSupplyCost ?? 0,
        fact.orderTimeSupplyCost,
      ),
    });
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
    const coveredDays = calendarDaysInclusive(start, end);
    if (start > end || `${fact.month}-01` > start || kstMonthEnd(fact.month) < end) {
      throw new UnprocessableEntityException('SOURCE_COVERAGE_MALFORMED');
    }
    const byMonth = result.get(fact.masterProductId) ?? new Map<string, AdvertisingMonth>();
    const previous = byMonth.get(fact.month);
    byMonth.set(fact.month, {
      coverageStartDate: previous?.coverageStartDate ?? start,
      coverageEndDate: previous?.coverageEndDate ?? end,
      coveredDays: previous?.coveredDays ?? coveredDays,
      coverageValid: (previous?.coverageValid ?? true)
        && (!previous || (previous.coverageStartDate === start && previous.coverageEndDate === end))
        && fact.observedTargetDayCount === coveredDays,
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
  costEvidenceValid: boolean;
  expectedBuckets: readonly EvaluationBucket[];
  advertisingCoverageStartDate: string | null;
  advertisingCoverageEndDate: string | null;
}): ProductProfitabilityEvidence {
  if (input.sellpia.size === 0) return emptyProduct(input.product);
  const monthlyFacts: MasterProductAbcFormulaReadyMonthlyFact[] = [];
  let evaluationPeriodComplete = input.expectedBuckets.length > 0 && input.costEvidenceValid;
  for (const expected of input.expectedBuckets) {
    const yearMonth = expected.yearMonth;
    const sellpia = input.sellpia.get(yearMonth);
    if (!sellpia) {
      evaluationPeriodComplete = false;
      continue;
    }
    if (sellpia.coverageStartDate !== expected.coverageStartDate
      || sellpia.coverageEndDate !== expected.coverageEndDate
      || sellpia.coveredDays !== expected.coveredDays
      || !sellpia.coverageValid) {
      evaluationPeriodComplete = false;
    }
    const advertising = input.advertising.get(yearMonth);
    if (advertising && (
      advertising.coverageStartDate !== expected.coverageStartDate
      || advertising.coverageEndDate !== expected.coverageEndDate
      || advertising.coveredDays !== expected.coveredDays
      || !advertising.coverageValid
    )) {
      evaluationPeriodComplete = false;
    }
    if (!advertising && (!input.advertisingCoverageStartDate
      || !input.advertisingCoverageEndDate
      || expected.coverageStartDate < input.advertisingCoverageStartDate
      || expected.coverageEndDate > input.advertisingCoverageEndDate)) {
      evaluationPeriodComplete = false;
    }
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
      },
    });
  }
  return {
    masterProductId: input.product.id,
    selling: input.product.isActive,
    mappingValid: input.product.mappingValid,
    saleStartDate: input.product.saleStartDate,
    evaluationPeriodComplete,
    validObservationDays: monthlyFacts.reduce((sum, fact) => sum + fact.coveredDays, 0),
    // Keep actual source rows readable even when a required month is missing;
    // Products separately requires evaluationPeriodComplete before evaluating.
    formulaReadyFacts: monthlyFacts.length > 0
      ? {
        masterProductId: input.product.id,
        cutoffDate: input.cutoff,
        saleStartDate: input.product.saleStartDate,
        evaluationPeriodComplete,
        monthlyFacts,
      }
      : null,
  };
}

function evaluationBuckets(
  evidenceMonths: readonly string[],
  selected: SelectedPair,
): EvaluationBucket[] {
  const sourceStart = maxDate(
    selected.sellpia.view.coverageStartDate,
    selected.advertising.view.coverageStartDate,
  );
  const sourceEnd = minDate(
    selected.sellpia.view.coverageEndDate,
    selected.advertising.view.coverageEndDate,
    selected.actualCutoff,
  );
  if (!sourceStart || !sourceEnd || sourceStart > sourceEnd) return [];
  return evidenceMonths.flatMap((yearMonth) => {
    const start = maxDate(`${yearMonth}-01`, sourceStart);
    const end = minDate(kstMonthEnd(yearMonth), sourceEnd);
    if (!start || !end || start > end) return [];
    return [{
      yearMonth,
      coverageStartDate: start,
      coverageEndDate: end,
      coveredDays: calendarDaysInclusive(start, end),
    }];
  });
}

function beforeOrOnCutoff(value: string | null, cutoff: string): string | null {
  return value !== null && value <= cutoff ? value : null;
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
  if (!parseBusinessDate(value)) {
    throw new UnprocessableEntityException(code);
  }
  return value;
}

/**
 * Whether both generations end on the pair's cutoff, or the cutoff closes its
 * month. Sellpia and advertising facts are month totals, so a source that runs
 * past a cutoff inside its month cannot be cut back to it, and that month would
 * be incomplete for every product the source has facts for.
 */
function coversCutoffMonth(
  actualCutoff: string,
  sellpia: SellpiaGeneration,
  advertising: AdvertisingGeneration,
): boolean {
  return actualCutoff === kstMonthEnd(actualCutoff.slice(0, 7))
    || (sellpia.view.coverageEndDate === actualCutoff
      && advertising.view.coverageEndDate === actualCutoff);
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
  const startDate = parseBusinessDate(start);
  const endDate = parseBusinessDate(end);
  return startDate && endDate ? datesInclusive(startDate, endDate).length : 0;
}

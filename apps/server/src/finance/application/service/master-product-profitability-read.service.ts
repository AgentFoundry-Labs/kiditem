import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  deriveSourceReadiness,
  type SourceReadiness,
} from '@kiditem/shared/source-readiness';
import { Prisma } from '@prisma/client';
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
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../products/application/port/in/product-transactional-read.port';
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

/** The Sellpia generation ABC and contribution read; ABC has no advertising source (KID-373). */
type SelectedGeneration = Readonly<{
  sellpia: SellpiaGeneration;
  actualCutoff: string;
  mappingGeneration: string;
}>;

type ProductRow = Readonly<{
  id: string;
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
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
  ) {}

  async load(input: {
    organizationId: string;
    targetCutoff: string;
  }): Promise<ProfitabilityEvidenceSnapshot> {
    const organizationId = requiredOrganizationId(input.organizationId);
    const targetCutoff = parseClosedCutoff(input.targetCutoff);
    const months = calendarMonthRange(targetCutoff, MAX_CALENDAR_MONTHS);

    // Keep the repeatable product snapshot isolated from the source-catalog
    // transaction. This bounds peak pool usage when Product Operations and
    // profitability are requested together; the snapshot remains the sole
    // authority for products and mapping generation.
    const productSnapshot = await this.readProductSnapshot(organizationId, targetCutoff);
    const sellpiaCatalog = await this.sellpia.readGenerationCatalog({
      organizationId,
      limit: MAX_CALENDAR_MONTHS,
    });
    const { products, mappingGeneration } = productSnapshot;

    const sellpiaGenerations = sellpiaCatalog.completeGenerations.map(normalizeSellpiaGeneration);
    const selected = selectSellpiaGeneration(sellpiaGenerations, targetCutoff, mappingGeneration);
    const latestSellpia = sellpiaGenerations[0] ?? null;
    // Readiness is each source's own: its newest generation on the current
    // mapping, whether or not that is the generation paired for publication.
    const currentSellpia = sellpiaGenerations.find((generation) =>
      generation.metadata.mappingGeneration === mappingGeneration) ?? null;
    const sources = {
      sellpia: sourceReadiness(
        sellpiaCatalog.latestAttempt?.state ?? null,
        sellpiaCatalog.latestAttempt?.attemptId ?? null,
        currentSellpia,
        targetCutoff,
        sellpiaCatalog.latestAttempt?.errorCode ?? null,
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
        },
        sources,
        products: products.map((product) => emptyProduct(product)),
      };
    }
    const evidenceMonths = months.filter((yearMonth) =>
      `${yearMonth}-01` <= selected.actualCutoff);

    const sellpiaFacts = await this.sellpia.readGenerationFacts({
      organizationId,
      operationId: selected.sellpia.metadata.operationId,
      // Invalid mappings cannot contribute to the result; the source adapter
      // still validates the complete immutable generation before projecting.
      masterProductIds: products
        .filter((product) => product.mappingValid)
        .map((product) => product.id),
      yearMonths: evidenceMonths,
    });
    assertSelectedSellpiaGeneration(sellpiaFacts, selected.sellpia.metadata);
    const sellpiaByProduct = aggregateSellpiaFacts(
      sellpiaFacts.facts,
      selected,
      evidenceMonths,
      products.filter((product) => product.mappingValid).map((product) => product.id),
    );
    const productEvidence = products.map((product) => buildProductEvidence({
      product,
      sellpia: sellpiaByProduct.get(product.id) ?? new Map(),
      cutoff: selected.actualCutoff,
      costEvidenceValid: selected.sellpia.metadata.quality.correctedCostEvidence === true,
      expectedBuckets: evaluationBuckets(
        evidenceMonths,
        selected,
      ),
    }));

    return {
      targetCutoff: input.targetCutoff,
      actualCutoff: selected.actualCutoff,
      mappingGeneration: selected.mappingGeneration,
      contributionBasis: fullMonthContributionBasis(selected),
      sourceVector: {
        sellpia: selected.sellpia.view,
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
      const products = await this.inventoryTransactionalRead.readSourceIdentities(
        { client: tx },
        { organizationId, selector: { kind: 'all' } },
      );
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
        products.map((product) => product.masterProductId),
        null,
        this.inventoryTransactionalRead,
      );
      const saleStartDateByProduct = new Map(
        saleAgeEvidence.map((evidence) => [evidence.masterProductId, evidence]),
      );
      return {
        products: products.map((product) => ({
          id: product.masterProductId,
          mappingValid: saleStartDateByProduct.get(product.masterProductId)?.mappingValid ?? false,
          saleStartDate: beforeOrOnCutoff(
            saleStartDateByProduct.get(product.masterProductId)?.saleStartDate ?? null,
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
function fullMonthContributionBasis(selected: SelectedGeneration) {
  const from = selected.sellpia.view.coverageStartDate;
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
      // 셀피아 세대의 식별자는 상품 손익 실행 id다(KID-361). 광고와 같은 모양의 보기라 칸 이름은 그대로다.
      sourceImportRunId: generation.operationId,
      publicationSequence: generation.publicationSequence,
      mappingGeneration: generation.mappingGeneration,
      coverageStartDate: from,
      coverageEndDate: to,
      capturedAt: generation.capturedAt,
    },
  };
}

function sourceReadiness(
  latestAttemptState: 'RUNNING' | 'COMPLETE' | 'FAILED' | null,
  latestAttemptId: string | null,
  selected: SellpiaGeneration | null,
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
    // MasterProduct no longer carries lifecycle state. Current product rows
    // are the source population; channel sellability is owned by Channels.
    selling: true,
    mappingValid: product.mappingValid,
    saleStartDate: product.saleStartDate,
    evaluationPeriodComplete: false,
    validObservationDays: 0,
    formulaReadyFacts: null,
  };
}

function aggregateSellpiaFacts(
  facts: readonly SellpiaProfitabilityFact[],
  selected: SelectedGeneration,
  months: readonly string[],
  mappedProductIds: readonly string[],
): Map<string, Map<string, SellpiaMonth>> {
  const allowedMonths = new Set(months);
  const result = new Map(
    mappedProductIds.map((masterProductId) => [masterProductId, new Map<string, SellpiaMonth>()]),
  );
  for (const fact of facts) {
    if (fact.operationId !== selected.sellpia.metadata.operationId
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

function buildProductEvidence(input: {
  product: ProductRow;
  sellpia: ReadonlyMap<string, SellpiaMonth>;
  cutoff: string;
  costEvidenceValid: boolean;
  expectedBuckets: readonly EvaluationBucket[];
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
    monthlyFacts.push({
      yearMonth,
      coverageStartDate: sellpia.coverageStartDate,
      coverageEndDate: sellpia.coverageEndDate,
      coveredDays: sellpia.coveredDays,
      recognizedRevenue: sellpia.revenue,
      orderTimeSupplyCost: sellpia.orderTimeSupplyCost,
      provenance: {
        costBasis: 'ORDER_TIME_SUPPLY_COST',
        vatIncluded: true,
      },
    });
  }
  return {
    masterProductId: input.product.id,
    selling: true,
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
  selected: SelectedGeneration,
): EvaluationBucket[] {
  const sourceStart = selected.sellpia.view.coverageStartDate;
  const sourceEnd = minDate(selected.sellpia.view.coverageEndDate, selected.actualCutoff);
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
  if (facts.generation.operationId !== selected.operationId
    || facts.generation.mappingGeneration !== selected.mappingGeneration) {
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
 * Whether the generation ends on the cutoff, or the cutoff closes its month.
 * Sellpia facts are month totals, so a generation that runs past a cutoff
 * inside its month cannot be cut back to it, and that month would be
 * incomplete for every product it has facts for.
 */
function coversCutoffMonth(actualCutoff: string, sellpia: SellpiaGeneration): boolean {
  return actualCutoff === kstMonthEnd(actualCutoff.slice(0, 7))
    || sellpia.view.coverageEndDate === actualCutoff;
}

/** The newest Sellpia generation on the current mapping that reaches a usable cutoff. */
function selectSellpiaGeneration(
  sellpia: readonly SellpiaGeneration[],
  targetCutoff: string,
  currentMappingGeneration: string,
): SelectedGeneration | null {
  const candidates: SelectedGeneration[] = [];
  for (const generation of sellpia) {
    if (generation.metadata.mappingGeneration !== currentMappingGeneration) continue;
    const actualCutoff = minDate(targetCutoff, generation.view.coverageEndDate);
    if (!actualCutoff || !coversCutoffMonth(actualCutoff, generation)) continue;
    candidates.push({
      sellpia: generation,
      actualCutoff,
      mappingGeneration: generation.metadata.mappingGeneration,
    });
  }
  return candidates.sort((left, right) =>
    right.actualCutoff.localeCompare(left.actualCutoff)
    || compareSequence(right.sellpia.metadata.publicationSequence, left.sellpia.metadata.publicationSequence),
  )[0] ?? null;
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

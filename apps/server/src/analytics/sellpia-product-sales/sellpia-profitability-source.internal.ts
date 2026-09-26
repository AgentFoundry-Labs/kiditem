import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SellpiaProfitProduct } from '@kiditem/shared/sellpia-operations';
import { businessDateKey, kstMonthEnd } from '../../common/kst';
import { createSellpiaProductInventoryResolver } from './sellpia-product-inventory-resolver';
import type {
  SellpiaProfitabilityGenerationMetadata,
  SellpiaProfitabilityQuality,
  SellpiaProfitabilityParserVersion,
} from '../application/port/in/sellpia-profitability-source-read.port';
import type { SellpiaProfitabilityPlan } from './domain/sellpia-profitability-operation';
import { SELLPIA_PROFITABILITY_SOURCE_TYPE } from './domain/sellpia-profitability-source';
import type { SellpiaProductMonthlyGeneration } from './read/sellpia-product-monthly-facts';

/**
 * 셀피아 상품 손익 발행의 내부 규칙(KID-361 J3): 제출 상품 → 불변 월 사실(`freezeFacts`), 원장 넣기(`insertFacts`,
 * 실행 id), 매핑 잠금·세대, 세대 품질 검증(`generationMetadata`). 실행 계약의 finalize·세대 리더가 부른다.
 */
export const SOURCE_TYPE = SELLPIA_PROFITABILITY_SOURCE_TYPE;
export const PARSER_VERSION = 'sellpia-profitability-v2';
export const LEGACY_PARSER_VERSION = 'sellpia-profitability-v1';
export const TRANSACTION_TIMEOUT_MS = 30_000;
export const INSERT_CHUNK_SIZE = 5_000;
export const MAX_GENERATION_FACT_ROWS = 20_000 * 24;
export const INT4_MAX = 2_147_483_647;
export const ALERT_DEDUPE_KEY = 'source:sellpia-product-profitability';

export type InventoryCandidate = Readonly<{
  id: string;
  code: string;
  sourceAccountKey: string;
  sourceProductCode: string;
  sourceOptionCode: string;
  barcode: string | null;
  masterProductId: string;
  /** A retained historical Sellpia identifier, when one exists. */
  legacySellpiaInventorySkuId?: string | null;
}>;

export type FrozenFact = Readonly<{
  operationId: string;
  sellpiaInventorySkuId: string | null;
  masterProductId: string | null;
  productCode: string;
  optionCode: string;
  yearMonth: string;
  orderQty: number;
  orderAmount: number;
  inAmount: number;
  coverageStartDate: string;
  coverageEndDate: string;
  productName: string;
  optionName: string | null;
  providerName: string | null;
  barcode: string | null;
}>;

export function freezeFacts(
  operationId: string,
  plan: Pick<SellpiaProfitabilityPlan, 'from' | 'to' | 'coveredMonths'>,
  products: readonly SellpiaProfitProduct[],
  candidates: readonly InventoryCandidate[],
): FrozenFact[] {
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const resolve = createSellpiaProductInventoryResolver(candidates);
  const facts = new Map<string, FrozenFact>();
  const seenProductIdentities = new Set<string>();
  const coveredMonths = new Set(plan.coveredMonths);
  for (const product of products) {
    const productCode = boundedString(product.productCode, 64, false);
    const optionCode = boundedString(product.optionCode, 64, true);
    const productIdentity = `${productCode}\u0000${optionCode}`;
    if (seenProductIdentities.has(productIdentity)) {
      throw invalid('duplicate_product_identity', { productCode, optionCode });
    }
    seenProductIdentities.add(productIdentity);
    const productName = boundedString(product.productName, 400, false);
    const barcode = product.barcode === undefined
      ? null
      : boundedString(product.barcode, 64, false);
    const resolution = resolve({ productCode, optionCode, barcode });
    const frozenSku = resolution.status === 'matched'
      ? candidateById.get(resolution.masterProductId) ?? null
      : null;
    const totalOrderAmount = sourceTotal(product.totalOrderAmount);
    const totalOrderQty = sourceTotal(product.totalOrderQty);
    const totalInAmount = sourceTotal(product.totalInAmount);
    const totalInQty = sourceTotal(product.totalInQty);
    // Prices remain transient parser inputs: the extension uses them to
    // classify financial-only adjustment rows, while the monthly fact keeps no
    // price columns. Validate them at this boundary even though they are not
    // included in the persisted fact.
    boundedInt(product.salePrice);
    boundedInt(product.buyPrice);
    let summedOrderAmount = 0;
    let summedOrderQty = 0;
    let summedInAmount = 0;
    let summedInQty = 0;
    for (const month of product.months) {
      if (!coveredMonths.has(month.yearMonth)) {
        throw invalid('month_outside_plan', { yearMonth: month.yearMonth });
      }
      const coverage = monthIntersection(plan, month.yearMonth);
      const orderQty = boundedInt(month.orderQty);
      const orderAmount = boundedInt(month.orderAmount);
      const inQty = boundedInt(month.inQty);
      const inAmount = boundedInt(month.inAmount);
      summedOrderAmount = boundedInt(summedOrderAmount + orderAmount);
      summedOrderQty = boundedInt(summedOrderQty + orderQty);
      summedInAmount = boundedInt(summedInAmount + inAmount);
      summedInQty = boundedInt(summedInQty + inQty);
      const fact: FrozenFact = {
        operationId,
        // New source rows are keyed by MasterProduct. The legacy column is
        // populated only when a caller supplies a retained historical ID.
        sellpiaInventorySkuId: frozenSku?.legacySellpiaInventorySkuId ?? null,
        masterProductId: frozenSku?.masterProductId ?? null,
        productCode,
        optionCode,
        yearMonth: month.yearMonth,
        orderQty,
        orderAmount,
        inAmount,
        coverageStartDate: coverage.from,
        coverageEndDate: coverage.to,
        productName,
        optionName: nullableBoundedString(product.optionName, 400),
        providerName: nullableBoundedString(product.providerName, 200),
        barcode,
      };
      const factIdentity = `${productIdentity}\u0000${month.yearMonth}`;
      if (facts.has(factIdentity)) {
        throw invalid('duplicate_product_month', { productCode, optionCode, yearMonth: month.yearMonth });
      }
      facts.set(factIdentity, fact);
    }
    if (
      summedOrderAmount !== totalOrderAmount
      || summedOrderQty !== totalOrderQty
      || summedInAmount !== totalInAmount
      || summedInQty !== totalInQty
    ) {
      throw invalid('provider_totals_mismatch', { productCode, optionCode });
    }
  }
  return [...facts.values()].sort((left, right) =>
    left.productCode.localeCompare(right.productCode)
    || left.optionCode.localeCompare(right.optionCode)
    || left.yearMonth.localeCompare(right.yearMonth));
}

export async function insertFacts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  facts: readonly FrozenFact[],
): Promise<void> {
  for (let offset = 0; offset < facts.length; offset += INSERT_CHUNK_SIZE) {
    const batch = facts.slice(offset, offset + INSERT_CHUNK_SIZE);
    const inserted = await tx.$executeRaw(Prisma.sql`
      INSERT INTO sellpia_product_monthly_sales (
        id, organization_id, operation_id,
        sellpia_inventory_sku_id, master_product_id,
        product_code, option_code, year_month,
        order_qty, order_amount, in_amount,
        cost_basis, vat_included, coverage_start_date, coverage_end_date,
        product_name, option_name, provider_name,
        barcode, captured_at
      )
      SELECT
        gen_random_uuid(), ${organizationId}::uuid,
        (record->>'operationId')::uuid,
        (record->>'sellpiaInventorySkuId')::uuid,
        (record->>'masterProductId')::uuid,
        record->>'productCode', record->>'optionCode', record->>'yearMonth',
        (record->>'orderQty')::integer, (record->>'orderAmount')::integer,
        (record->>'inAmount')::integer,
        'ORDER_TIME_SUPPLY_COST', true,
        (record->>'coverageStartDate')::date,
        (record->>'coverageEndDate')::date,
        record->>'productName', record->>'optionName', record->>'providerName',
        record->>'barcode', now()
      FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) AS record
    `);
    if (inserted !== batch.length) {
      throw new Error(`Expected ${batch.length} Sellpia facts, inserted ${inserted}`);
    }
  }
}

export async function readMappingGeneration(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const state = await tx.masterProductAbcFormulaState.findUnique({
    where: { organizationId },
    select: { mappingGeneration: true },
  });
  return state?.mappingGeneration ?? 0n;
}

export async function lockMapping(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped mapping fence; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`kiditem.product-mapping:${organizationId}`}, 0)
    )::text AS "lock"
  `);
}

export function failureAlert(
  organizationId: string,
  attemptId: string,
  errorCode: string,
  errorMessage: string,
) {
  return {
    organizationId,
    dedupeKey: ALERT_DEDUPE_KEY,
    sourceType: SOURCE_TYPE,
    attemptId,
    code: errorCode,
    title: '셀피아 상품 손익 수집 실패',
    message: errorMessage,
    href: '/stock-ops',
  };
}

export function monthIntersection(
  plan: Pick<SellpiaProfitabilityPlan, 'from' | 'to'>,
  yearMonth: string,
): { from: string; to: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw invalid('month_invalid', { yearMonth });
  }
  const monthStart = `${yearMonth}-01`;
  const monthEnd = kstMonthEnd(yearMonth);
  const from = monthStart > plan.from ? monthStart : plan.from;
  const to = monthEnd < plan.to ? monthEnd : plan.to;
  if (from > to) throw invalid('month_outside_plan', { yearMonth });
  return { from, to };
}

export function boundedString(value: string, max: number, allowEmpty: boolean): string {
  if (typeof value !== 'string') throw invalid('invalid_profit_products', { field: 'text' });
  const normalized = value.trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > max) {
    throw invalid('invalid_profit_products', { field: 'text' });
  }
  return normalized;
}

export function nullableBoundedString(value: string | undefined, max: number): string | null {
  if (value === undefined || value.trim() === '') return null;
  return boundedString(value, max, false);
}

export function boundedInt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > INT4_MAX) {
    throw invalid('invalid_profit_products', { field: 'amount' });
  }
  return value;
}

export function sourceTotal(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > INT4_MAX) {
    throw invalid('invalid_profit_products', { field: 'total' });
  }
  return value;
}

export function boundedCatalogLimit(value: number | undefined): number {
  const limit = value ?? 12;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_CATALOG_OVERFLOW');
  }
  return limit;
}

export function isoDate(value: Date): string {
  return businessDateKey(value);
}

export function generationMetadata(
  attempt: SellpiaProductMonthlyGeneration,
): SellpiaProfitabilityGenerationMetadata {
  if (attempt.mappingGeneration === null
    || attempt.coverageStartDate === null
    || attempt.coverageEndDate === null
    || attempt.importedAt === null) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_PROVENANCE_MISSING');
  }
  const quality = parseQualityReport(attempt.qualityReport);
  if (attempt.contentChecksum !== quality.contentChecksum
    || attempt.contentByteCount !== quality.contentByteCount
    || attempt.rowCount !== quality.includedRowCount
    || attempt.mappingGeneration.toString() !== quality.mappingGeneration) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  const coveredMonths = attempt.coveredMonths;
  if (!Array.isArray(coveredMonths) || coveredMonths.length === 0
    || coveredMonths.some((month) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
    throw new UnprocessableEntityException('SOURCE_COVERAGE_MALFORMED');
  }
  return {
    operationId: attempt.id,
    publicationSequence: attempt.publicationSequence.toString(),
    mappingGeneration: attempt.mappingGeneration.toString(),
    coverage: {
      from: isoDate(attempt.coverageStartDate),
      to: isoDate(attempt.coverageEndDate),
      coveredMonths: [...coveredMonths],
    },
    capturedAt: attempt.importedAt.toISOString(),
    quality,
  };
}

function parseQualityReport(value: unknown): SellpiaProfitabilityQuality {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  const report = value as Record<string, unknown>;
  const provenance = report.provenance;
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new UnprocessableEntityException('SOURCE_PROVENANCE_MALFORMED');
  }
  const source = provenance as Record<string, unknown>;
  if (source.source !== 'sellpia_stat_prd_profit'
    || source.costBasis !== 'ORDER_TIME_SUPPLY_COST'
    || source.vatIncluded !== true) {
    throw new UnprocessableEntityException('SOURCE_PROVENANCE_MALFORMED');
  }
  const checksum = report.contentChecksum;
  const byteCount = report.contentByteCount;
  const mappingGeneration = report.mappingGeneration;
  if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(checksum)
    || !Number.isSafeInteger(byteCount) || (byteCount as number) <= 0
    || typeof mappingGeneration !== 'string' || !/^\d+$/.test(mappingGeneration)) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  const numbers = [
    report.includedRowCount,
    report.excludedRowCount,
    report.mappedRowCount,
    report.unmappedRowCount,
    report.warningCount,
  ];
  if (numbers.some((count) => !Number.isSafeInteger(count) || (count as number) < 0)) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  const contract = report.contract;
  const parserVersion = report.parserVersion;
  const correctedCostEvidence = contract === PARSER_VERSION
    && parserVersion === PARSER_VERSION;
  const legacyCostEvidence = contract === LEGACY_PARSER_VERSION
    && parserVersion === LEGACY_PARSER_VERSION;
  if ((!correctedCostEvidence && !legacyCostEvidence)
    || (report.mappedRowCount as number) + (report.unmappedRowCount as number)
      !== (report.includedRowCount as number)
    || (report.warningCount as number) > (report.includedRowCount as number)) {
    throw new UnprocessableEntityException('SOURCE_QUALITY_REPORT_MALFORMED');
  }
  return {
    contract: contract as SellpiaProfitabilityParserVersion,
    parserVersion: parserVersion as SellpiaProfitabilityParserVersion,
    correctedCostEvidence,
    contentChecksum: checksum,
    contentByteCount: byteCount as number,
    includedRowCount: report.includedRowCount as number,
    excludedRowCount: report.excludedRowCount as number,
    mappedRowCount: report.mappedRowCount as number,
    unmappedRowCount: report.unmappedRowCount as number,
    warningCount: report.warningCount as number,
    mappingGeneration,
    provenance: {
      source: 'sellpia_stat_prd_profit',
      costBasis: 'ORDER_TIME_SUPPLY_COST',
      vatIncluded: true,
    },
  };
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}

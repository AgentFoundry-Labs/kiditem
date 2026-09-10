import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createSellpiaProductInventoryResolver } from './sellpia-product-inventory-resolver';
import type {
  SellpiaProfitabilityAttemptSummary,
  SellpiaProfitabilityAttempt,
  SellpiaProfitabilityCompleteGeneration,
  SellpiaProfitabilityPlan,
} from '@kiditem/shared/source-import';
import type {
  SellpiaProfitabilityGenerationMetadata,
  SellpiaProfitabilityQuality,
  SellpiaProfitabilityParserVersion,
} from '../application/port/in/sellpia-profitability-source-read.port';
import type {
  SellpiaProfitabilitySubmitBodyDto,
} from './dto/sellpia-product-sales.dto';

export const SOURCE_TYPE = 'sellpia_product_profitability';
export const PARSER_VERSION = 'sellpia-profitability-v2';
export const LEGACY_PARSER_VERSION = 'sellpia-profitability-v1';
export const ATTEMPT_TTL_MS = 30 * 60_000;
export const TRANSACTION_TIMEOUT_MS = 30_000;
export const INSERT_CHUNK_SIZE = 5_000;
export const MAX_GENERATION_FACT_ROWS = 20_000 * 24;
export const INT4_MAX = 2_147_483_647;
export const ALERT_DEDUPE_KEY = 'source:sellpia-product-profitability';
const SELLPIA_PROFITABILITY_WINDOW_DAYS = 401;

export type SourceAttemptRecord = Readonly<{
  id: string;
  organizationId: string;
  sourceType: string;
  status: string;
  attemptToken: string;
  idempotencyKey: string | null;
  requestFingerprint: string | null;
  expiresAt: Date | null;
  plan: unknown;
  parserVersion: string | null;
  contentChecksum: string | null;
  contentByteCount: number | null;
  rowCount: number;
  qualityReport: unknown;
  coveredMonths: string[];
  mappingGeneration: bigint | null;
  publicationSequence: bigint | null;
  coverageStartDate: Date | null;
  coverageEndDate: Date | null;
  importedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type InventoryCandidate = Readonly<{
  id: string;
  code: string;
  barcode: string | null;
  isActive: boolean;
  masterProductId: string | null;
}>;

export type FrozenFact = Readonly<{
  sourceImportRunId: string;
  sellpiaInventorySkuId: string | null;
  masterProductId: string | null;
  productCode: string;
  optionCode: string;
  yearMonth: string;
  orderQty: number;
  orderAmount: number;
  inQty: number;
  inAmount: number;
  coverageStartDate: string;
  coverageEndDate: string;
  productName: string;
  optionName: string | null;
  providerName: string | null;
  salePrice: number;
  buyPrice: number;
  barcode: string | null;
}>;

export function buildSellpiaProfitabilityPlan(
  now: Date,
  normalizedSourceAvailabilityDate?: string,
): SellpiaProfitabilityPlan {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new BadRequestException('INVALID_SERVER_CLOCK');
  }
  const end = new Date(Date.UTC(year, month - 1, day - 1));
  const earliest = new Date(end);
  earliest.setUTCDate(earliest.getUTCDate() - SELLPIA_PROFITABILITY_WINDOW_DAYS + 1);
  let from = earliest;
  if (normalizedSourceAvailabilityDate !== undefined) {
    const availability = parseDate(normalizedSourceAvailabilityDate.trim());
    if (!availability || availability > end) {
      throw new BadRequestException('SOURCE_AVAILABILITY_OUTSIDE_PLAN');
    }
    if (availability > earliest) from = availability;
  }
  const fromString = isoDate(from);
  const toString = isoDate(end);
  return {
    from: fromString,
    to: toString,
    coveredMonths: monthsBetween(fromString, toString),
  };
}

export function normalizeSubmission(body: SellpiaProfitabilitySubmitBodyDto) {
  if (body.parserVersion !== PARSER_VERSION) {
    throw new UnprocessableEntityException('PARSER_VERSION_MISMATCH');
  }
  if (body.provenance?.source !== 'sellpia_stat_prd_profit'
    || body.provenance.costBasis !== 'ORDER_TIME_SUPPLY_COST'
    || body.provenance.vatIncluded !== true) {
    throw new UnprocessableEntityException('PROFITABILITY_PROVENANCE_INVALID');
  }
  if (!Array.isArray(body.coveredMonths)) {
    throw new UnprocessableEntityException('SOURCE_COVERAGE_INCOMPLETE');
  }
  if (!Array.isArray(body.products) || typeof body.providerBackedEmptyProof !== 'boolean') {
    throw new UnprocessableEntityException('PROFITABILITY_PAYLOAD_INVALID');
  }
  return {
    parserVersion: body.parserVersion,
    coveredMonths: [...new Set(body.coveredMonths)].sort(),
    providerBackedEmptyProof: body.providerBackedEmptyProof,
    provenance: body.provenance,
    products: body.products,
  };
}

export function freezeFacts(
  sourceImportRunId: string,
  plan: SellpiaProfitabilityPlan,
  products: SellpiaProfitabilitySubmitBodyDto['products'],
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
      throw new UnprocessableEntityException('DUPLICATE_PRODUCT_IDENTITY');
    }
    seenProductIdentities.add(productIdentity);
    const productName = boundedString(product.productName, 400, false);
    const barcode = product.barcode === undefined
      ? null
      : boundedString(product.barcode, 64, false);
    const resolution = resolve({ productCode, optionCode, barcode });
    const frozenSku = resolution.status === 'matched'
      ? candidateById.get(resolution.sellpiaInventorySkuId) ?? null
      : null;
    const totalOrderAmount = sourceTotal(product.totalOrderAmount);
    const totalOrderQty = sourceTotal(product.totalOrderQty);
    const totalInAmount = sourceTotal(product.totalInAmount);
    const totalInQty = sourceTotal(product.totalInQty);
    let summedOrderAmount = 0;
    let summedOrderQty = 0;
    let summedInAmount = 0;
    let summedInQty = 0;
    for (const month of product.months) {
      if (!coveredMonths.has(month.yearMonth)) {
        throw new UnprocessableEntityException('SOURCE_MONTH_OUTSIDE_PLAN');
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
        sourceImportRunId,
        sellpiaInventorySkuId: frozenSku?.id ?? null,
        masterProductId: frozenSku?.masterProductId ?? null,
        productCode,
        optionCode,
        yearMonth: month.yearMonth,
        orderQty,
        orderAmount,
        inQty,
        inAmount,
        coverageStartDate: coverage.from,
        coverageEndDate: coverage.to,
        productName,
        optionName: nullableBoundedString(product.optionName, 400),
        providerName: nullableBoundedString(product.providerName, 200),
        salePrice: boundedInt(product.salePrice),
        buyPrice: boundedInt(product.buyPrice),
        barcode,
      };
      const factIdentity = `${productIdentity}\u0000${month.yearMonth}`;
      if (facts.has(factIdentity)) {
        throw new UnprocessableEntityException('DUPLICATE_PRODUCT_MONTH');
      }
      facts.set(factIdentity, fact);
    }
    if (
      summedOrderAmount !== totalOrderAmount
      || summedOrderQty !== totalOrderQty
      || summedInAmount !== totalInAmount
      || summedInQty !== totalInQty
    ) {
      throw new UnprocessableEntityException('PROVIDER_TOTALS_MISMATCH');
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
        id, organization_id, source_import_run_id,
        sellpia_inventory_sku_id, master_product_id,
        product_code, option_code, year_month,
        order_qty, order_amount, in_qty, in_amount,
        cost_basis, vat_included, coverage_start_date, coverage_end_date,
        product_name, option_name, provider_name, sale_price, buy_price,
        barcode, captured_at
      )
      SELECT
        gen_random_uuid(), ${organizationId}::uuid,
        (record->>'sourceImportRunId')::uuid,
        (record->>'sellpiaInventorySkuId')::uuid,
        (record->>'masterProductId')::uuid,
        record->>'productCode', record->>'optionCode', record->>'yearMonth',
        (record->>'orderQty')::integer, (record->>'orderAmount')::integer,
        (record->>'inQty')::integer, (record->>'inAmount')::integer,
        'ORDER_TIME_SUPPLY_COST', true,
        (record->>'coverageStartDate')::date,
        (record->>'coverageEndDate')::date,
        record->>'productName', record->>'optionName', record->>'providerName',
        (record->>'salePrice')::integer, (record->>'buyPrice')::integer,
        record->>'barcode', now()
      FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) AS record
    `);
    if (inserted !== batch.length) {
      throw new Error(`Expected ${batch.length} Sellpia facts, inserted ${inserted}`);
    }
  }
}

export async function findAttempt(
  tx: Prisma.TransactionClient,
  organizationId: string,
  attemptId: string,
): Promise<SourceAttemptRecord> {
  const attempt = await tx.sourceImportRun.findFirst({
    where: { id: attemptId, organizationId, sourceType: SOURCE_TYPE },
  }) as SourceAttemptRecord | null;
  if (!attempt) throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
  return attempt;
}

export function assertAttemptWritable(attempt: SourceAttemptRecord, attemptToken: string): void {
  assertAttemptToken(attempt, attemptToken);
  if (attempt.status !== 'running') throw new ConflictException('ATTEMPT_TERMINAL');
  if (isExpiredRunning(attempt, new Date())) throw new ConflictException('ATTEMPT_EXPIRED');
}

export function assertAttemptToken(attempt: SourceAttemptRecord, attemptToken: string): void {
  if (attempt.attemptToken !== attemptToken) {
    throw new ConflictException('ATTEMPT_TOKEN_MISMATCH');
  }
}

export function assertStagedReplay(
  attempt: SourceAttemptRecord,
  checksum: string,
  byteCount: number,
  rowCount?: number,
): void {
  if (attempt.contentChecksum !== checksum
    || attempt.contentByteCount !== byteCount
    || (rowCount !== undefined && attempt.rowCount !== rowCount)) {
    throw new ConflictException('CONTENT_REPLAY_CONFLICT');
  }
}

export function assertCoveredMonths(
  plan: SellpiaProfitabilityPlan,
  coveredMonths: readonly string[],
): void {
  if (coveredMonths.length !== plan.coveredMonths.length
    || coveredMonths.some((month, index) => month !== plan.coveredMonths[index])) {
    throw new UnprocessableEntityException('SOURCE_COVERAGE_INCOMPLETE');
  }
}

export async function assertMappingGeneration(
  tx: Prisma.TransactionClient,
  attempt: SourceAttemptRecord,
): Promise<void> {
  const current = await readMappingGeneration(tx, attempt.organizationId);
  if (current !== (attempt.mappingGeneration ?? 0n)) {
    throw new ConflictException('MAPPING_GENERATION_CHANGED');
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

export async function lockSource(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`kiditem.sellpia-product-profitability:${organizationId}`}, 0)
    )::text AS "lock"
  `);
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

export function toAttemptView(
  attempt: SourceAttemptRecord,
  now = new Date(0),
): SellpiaProfitabilityAttempt {
  const expired = isExpiredRunning(attempt, now);
  return {
    attemptId: attempt.id,
    attemptToken: attempt.attemptToken,
    state: expired
      ? 'FAILED'
      : attempt.status === 'completed'
        ? 'COMPLETE'
        : attempt.status === 'failed'
          ? 'FAILED'
          : 'RUNNING',
    expiresAt: attempt.expiresAt?.toISOString() ?? attempt.createdAt.toISOString(),
    capturedAt: attempt.createdAt.toISOString(),
    generation: attempt.publicationSequence?.toString() ?? null,
    errorCode: expired ? 'ATTEMPT_EXPIRED' : attempt.errorCode,
    errorMessage: expired
      ? 'Sellpia profitability collection expired before publication.'
      : attempt.errorMessage,
    plan: parsePlan(attempt.plan),
  };
}

export function toAttemptSummary(
  attempt: SourceAttemptRecord,
  now = new Date(0),
): SellpiaProfitabilityAttemptSummary {
  const view = toAttemptView(attempt, now);
  return {
    attemptId: view.attemptId,
    state: view.state,
    expiresAt: new Date(view.expiresAt).toISOString(),
    capturedAt: new Date(view.capturedAt).toISOString(),
    generation: view.generation,
    errorCode: view.errorCode,
    errorMessage: view.errorMessage,
    plan: {
      from: view.plan.from,
      to: view.plan.to,
      coveredMonths: [...view.plan.coveredMonths],
    },
  };
}

export function toCompleteGeneration(
  attempt: SourceAttemptRecord,
): SellpiaProfitabilityCompleteGeneration {
  if (attempt.publicationSequence === null
    || attempt.mappingGeneration === null
    || attempt.coverageEndDate === null) {
    throw new Error('Completed Sellpia profitability generation lacks provenance.');
  }
  return {
    sourceImportRunId: attempt.id,
    generation: attempt.publicationSequence.toString(),
    coveredThrough: isoDate(attempt.coverageEndDate),
    capturedAt: (attempt.importedAt ?? attempt.updatedAt).toISOString(),
    mappingGeneration: attempt.mappingGeneration.toString(),
  };
}

export function parsePlan(value: unknown): SellpiaProfitabilityPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Sellpia profitability attempt plan is invalid.');
  }
  const plan = value as Record<string, unknown>;
  if (typeof plan.from !== 'string'
    || typeof plan.to !== 'string'
    || !Array.isArray(plan.coveredMonths)
    || plan.coveredMonths.some((month) => typeof month !== 'string')) {
    throw new Error('Sellpia profitability attempt plan is invalid.');
  }
  return {
    from: plan.from,
    to: plan.to,
    coveredMonths: plan.coveredMonths as string[],
  };
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
    severity: 'error' as const,
    title: 'Sellpia 수익성 수집 실패',
    message: `${errorCode}: ${errorMessage}`.slice(0, 300),
    href: '/stock-ops',
  };
}

export function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? '';
  if (key.length === 0 || key.length > 128) {
    throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
  }
  return key;
}

export function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function isExpiredRunning(attempt: SourceAttemptRecord, now: Date): boolean {
  return attempt.status === 'running'
    && attempt.expiresAt !== null
    && attempt.expiresAt.getTime() <= now.getTime();
}

export function monthIntersection(
  plan: SellpiaProfitabilityPlan,
  yearMonth: string,
): { from: string; to: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    throw new UnprocessableEntityException('SOURCE_MONTH_INVALID');
  }
  const [year, month] = yearMonth.split('-').map(Number);
  const monthStart = `${yearMonth}-01`;
  const monthEnd = isoDate(new Date(Date.UTC(year!, month!, 0)));
  const from = monthStart > plan.from ? monthStart : plan.from;
  const to = monthEnd < plan.to ? monthEnd : plan.to;
  if (from > to) throw new UnprocessableEntityException('SOURCE_MONTH_OUTSIDE_PLAN');
  return { from, to };
}

export function monthsBetween(from: string, to: string): string[] {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate || fromDate > toDate) {
    throw new BadRequestException('SOURCE_PLAN_INVALID');
  }
  const values: string[] = [];
  for (
    let index = fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth();
    index <= toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();
    index += 1
  ) {
    values.push(`${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`);
  }
  return values;
}

export function boundedString(value: string, max: number, allowEmpty: boolean): string {
  if (typeof value !== 'string') throw new UnprocessableEntityException('PROFITABILITY_PAYLOAD_INVALID');
  const normalized = value.trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > max) {
    throw new UnprocessableEntityException('PROFITABILITY_PAYLOAD_INVALID');
  }
  return normalized;
}

export function nullableBoundedString(value: string | undefined, max: number): string | null {
  if (value === undefined || value.trim() === '') return null;
  return boundedString(value, max, false);
}

export function boundedInt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > INT4_MAX) {
    throw new UnprocessableEntityException('PROFITABILITY_AMOUNT_INVALID');
  }
  return value;
}

export function sourceTotal(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > INT4_MAX) {
    throw new UnprocessableEntityException('PROFITABILITY_TOTAL_INVALID');
  }
  return value;
}

export function dateOnly(value: string): Date {
  const parsed = parseDate(value);
  if (!parsed) throw new BadRequestException('SOURCE_PLAN_INVALID');
  return parsed;
}

export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return isoDate(parsed) === value ? parsed : null;
}

export function boundedCatalogLimit(value: number | undefined): number {
  const limit = value ?? 12;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new UnprocessableEntityException('SOURCE_GENERATION_CATALOG_OVERFLOW');
  }
  return limit;
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function generationMetadata(
  attempt: SourceAttemptRecord,
): SellpiaProfitabilityGenerationMetadata {
  if (attempt.status !== 'completed'
    || attempt.publicationSequence === null
    || attempt.mappingGeneration === null
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
    sourceImportRunId: attempt.id,
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

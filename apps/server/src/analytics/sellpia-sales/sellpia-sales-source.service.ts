import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../alerts/alerts.service';
import { classifySellpiaChannelGroup } from './domain/channel-group';
import { SELLPIA_SALES_COVERAGE_SELLER_ID } from './domain/snapshot-coverage';
import type { SellpiaSalesIngestBodyDto } from './dto/sellpia-sales.dto';

export const SELLPIA_SALES_SOURCE_TYPE = 'sellpia_sales_daily';
export const SELLPIA_SALES_PARSER_VERSION = 'sellpia-sales-v1';
export const SELLPIA_SALES_SOURCE_ORIGIN = 'https://kiditem.sellpia.com';
export const SELLPIA_SALES_SOURCE_PATH = '/sale_summary.html?mode=main_link';
export const SELLPIA_SALES_SOURCE_ACCOUNT_KEY = 'kiditem';
export const SELLPIA_SALES_ATTEMPT_TTL_MS = 30 * 60_000;
export const SELLPIA_SALES_MAX_DAYS = 100;
export const SELLPIA_SALES_DEFAULT_DAYS = 93;
export const SELLPIA_SALES_ALERT_DEDUPE_KEY = `source:${SELLPIA_SALES_SOURCE_TYPE}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const INT4_MAX = 2_147_483_647;
const INSERT_CHUNK_SIZE = 1_000;
const TRANSACTION_TIMEOUT_MS = 30_000;

type Tx = Prisma.TransactionClient;
type SourceRun = Prisma.SourceImportRunGetPayload<{}>;

export type SellpiaSalesSourceRange = Readonly<{
  from: string;
  to: string;
}>;

export type SellpiaSalesSourcePlan = Readonly<{
  sourceType: typeof SELLPIA_SALES_SOURCE_TYPE;
  parserVersion: typeof SELLPIA_SALES_PARSER_VERSION;
  sourceOrigin: typeof SELLPIA_SALES_SOURCE_ORIGIN;
  sourcePath: typeof SELLPIA_SALES_SOURCE_PATH;
  sourceAccountKey: typeof SELLPIA_SALES_SOURCE_ACCOUNT_KEY;
  range: SellpiaSalesSourceRange;
  businessDates: string[];
}>;

export type SellpiaSalesSourceAttempt = Readonly<{
  attemptId: string;
  sourceType: typeof SELLPIA_SALES_SOURCE_TYPE;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  expiresAt: string;
  plan: SellpiaSalesSourcePlan;
  actualCutoffAt: string | null;
  completedAt: string | null;
  contentChecksum: string | null;
  contentByteCount: number | null;
  rowCount: number;
  sellerCount: number;
  businessDates: string[];
  errorCode: string | null;
  errorMessage: string | null;
}>;

export type SellpiaSalesSourceControl = SellpiaSalesSourceAttempt & Readonly<{
  attemptToken: string;
}>;

export type SellpiaSalesSourceRequest = Readonly<{
  range?: Partial<SellpiaSalesSourceRange>;
}>;

export type SellpiaSalesPublishedRow = Readonly<{
  businessDate: Date;
  sellerId: string;
  sellerName: string;
  channelGroup: string;
  revenueKrw: number;
  qty: number;
  costKrw: number;
  capturedAt: Date;
}>;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || isoDate(date) !== value ? null : date;
}

function dateAtUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

function datesInclusive(from: Date, to: Date): string[] {
  const result: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    result.push(isoDate(date));
  }
  return result;
}

function todayKst(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function boundedInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  return Math.min(rounded, INT4_MAX);
}

function isExpired(row: Pick<SourceRun, 'status' | 'expiresAt'>, now = new Date()): boolean {
  return row.status === 'running' && (!row.expiresAt || row.expiresAt.getTime() <= now.getTime());
}

function lockKey(organizationId: string): string {
  return `${organizationId}:${SELLPIA_SALES_SOURCE_TYPE}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeMessage(value: string): string {
  return value
    .replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 300);
}

export function normalizeSellpiaSalesSourceRequest(value: unknown): SellpiaSalesSourceRequest {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('INVALID_SELLPIA_SALES_SCOPE');
  }
  const record = value as Record<string, unknown>;
  const nested = record.range;
  const range = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : record;
  const from = range.from ?? record.startDate;
  const to = range.to ?? record.endDate;
  if (from === undefined && to === undefined) return {};
  if ((from !== undefined && typeof from !== 'string') || (to !== undefined && typeof to !== 'string')) {
    throw new BadRequestException('INVALID_SELLPIA_SALES_SCOPE');
  }
  return { range: { from: from as string | undefined, to: to as string | undefined } };
}

export function buildSellpiaSalesSourcePlan(
  now: Date,
  request: SellpiaSalesSourceRequest = {},
): SellpiaSalesSourcePlan {
  const requestedFrom = request.range?.from;
  const requestedTo = request.range?.to;
  const to = requestedTo ?? todayKst(now);
  const toDate = parseCalendarDate(to);
  if (!toDate) throw new BadRequestException('INVALID_SELLPIA_SALES_SCOPE');
  const from = requestedFrom ?? isoDate(addDays(toDate, -(SELLPIA_SALES_DEFAULT_DAYS - 1)));
  const fromDate = parseCalendarDate(from);
  if (!fromDate || fromDate > toDate) {
    throw new BadRequestException('INVALID_SELLPIA_SALES_SCOPE');
  }
  const businessDates = datesInclusive(fromDate, toDate);
  if (businessDates.length > SELLPIA_SALES_MAX_DAYS) {
    throw new BadRequestException('SELLPIA_SALES_SCOPE_TOO_LARGE');
  }
  return {
    sourceType: SELLPIA_SALES_SOURCE_TYPE,
    parserVersion: SELLPIA_SALES_PARSER_VERSION,
    sourceOrigin: SELLPIA_SALES_SOURCE_ORIGIN,
    sourcePath: SELLPIA_SALES_SOURCE_PATH,
    sourceAccountKey: SELLPIA_SALES_SOURCE_ACCOUNT_KEY,
    range: { from, to },
    businessDates,
  };
}

function parsePlan(value: unknown): SellpiaSalesSourcePlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConflictException('SOURCE_PLAN_INVALID');
  }
  const plan = value as Record<string, unknown>;
  const range = plan.range;
  if (
    plan.sourceType !== SELLPIA_SALES_SOURCE_TYPE
    || plan.parserVersion !== SELLPIA_SALES_PARSER_VERSION
    || plan.sourceOrigin !== SELLPIA_SALES_SOURCE_ORIGIN
    || plan.sourcePath !== SELLPIA_SALES_SOURCE_PATH
    || plan.sourceAccountKey !== SELLPIA_SALES_SOURCE_ACCOUNT_KEY
    || !range || typeof range !== 'object' || Array.isArray(range)
    || typeof (range as Record<string, unknown>).from !== 'string'
    || typeof (range as Record<string, unknown>).to !== 'string'
    || !Array.isArray(plan.businessDates)
    || plan.businessDates.some((date) => typeof date !== 'string')
  ) {
    throw new ConflictException('SOURCE_PLAN_INVALID');
  }
  const normalized = buildSellpiaSalesSourcePlan(new Date(), {
    range: {
      from: (range as Record<string, unknown>).from as string,
      to: (range as Record<string, unknown>).to as string,
    },
  });
  const dates = plan.businessDates as string[];
  if (dates.length !== normalized.businessDates.length || dates.some((date, index) => date !== normalized.businessDates[index])) {
    throw new ConflictException('SOURCE_PLAN_INVALID');
  }
  return {
    sourceType: SELLPIA_SALES_SOURCE_TYPE,
    parserVersion: SELLPIA_SALES_PARSER_VERSION,
    sourceOrigin: SELLPIA_SALES_SOURCE_ORIGIN,
    sourcePath: SELLPIA_SALES_SOURCE_PATH,
    sourceAccountKey: SELLPIA_SALES_SOURCE_ACCOUNT_KEY,
    range: normalized.range,
    businessDates: [...dates],
  };
}

type NormalizedPayload = Readonly<{
  range: SellpiaSalesSourceRange;
  sellers: SellpiaSalesIngestBodyDto['sellers'];
  capturedAt: Date;
  providerBackedEmptyProof: boolean;
  salesRows: Prisma.SellpiaSalesDailySnapshotCreateManyInput[];
  coverageRows: Prisma.SellpiaSalesDailySnapshotCreateManyInput[];
  canonical: Record<string, unknown>;
}>;

function normalizePayload(
  organizationId: string,
  plan: SellpiaSalesSourcePlan,
  body: SellpiaSalesIngestBodyDto,
  now = new Date(),
): NormalizedPayload {
  if (body.range.from !== plan.range.from || body.range.to !== plan.range.to) {
    throw new ConflictException('SELLPIA_SALES_SCOPE_MISMATCH');
  }
  const capturedAt = new Date(body.capturedAt);
  if (Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > now.getTime() + 5 * 60_000) {
    throw new UnprocessableEntityException('INVALID_CAPTURED_AT');
  }
  const providerBackedEmptyProof =
    body.sellers.length === 0 && hasExplicitEmptyProvenance(body);
  if (body.sellers.length === 0 && !providerBackedEmptyProof) {
    throw new UnprocessableEntityException('EMPTY_COVERAGE_NOT_PROVEN');
  }
  if (body.sellers.length > 0 && body.provenance) {
    throw new UnprocessableEntityException('EMPTY_PROVENANCE_WITH_SELLERS');
  }

  const rowsByKey = new Map<string, Prisma.SellpiaSalesDailySnapshotCreateManyInput>();
  for (const seller of body.sellers) {
    if (seller.days.length === 0) throw new UnprocessableEntityException('SELLER_DAYS_EMPTY');
    if (seller.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID) {
      throw new UnprocessableEntityException('RESERVED_SELLER_ID');
    }
    const channelGroup = classifySellpiaChannelGroup(seller.sellerName);
    for (const day of seller.days) {
      const businessDate = parseCalendarDate(day.date);
      if (!businessDate) throw new UnprocessableEntityException('INVALID_BUSINESS_DATE');
      if (day.date < plan.range.from || day.date > plan.range.to) {
        throw new UnprocessableEntityException('BUSINESS_DATE_OUTSIDE_PLAN');
      }
      rowsByKey.set(`${seller.sellerId}\u0000${day.date}`, {
        organizationId,
        sourceImportRunId: undefined,
        businessDate,
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        channelGroup,
        revenueKrw: boundedInt(day.price),
        qty: boundedInt(day.amount),
        costKrw: boundedInt(day.buyPrice),
        capturedAt,
      });
    }
  }

  const coverageRows = plan.businessDates.map((date) => ({
    organizationId,
    sourceImportRunId: undefined,
    businessDate: dateAtUtc(date),
    sellerId: SELLPIA_SALES_COVERAGE_SELLER_ID,
    sellerName: 'KidItem 수집 완료',
    channelGroup: 'others',
    revenueKrw: 0,
    qty: 0,
    costKrw: 0,
    capturedAt,
  } satisfies Prisma.SellpiaSalesDailySnapshotCreateManyInput));
  const salesRows = [...rowsByKey.values()];
  const canonical = {
    range: plan.range,
    sellers: body.sellers
      .map((seller) => ({
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        days: seller.days
          .map((day) => ({ date: day.date, price: day.price, amount: day.amount, buyPrice: day.buyPrice }))
          .sort((left, right) => left.date.localeCompare(right.date)),
      }))
      .sort((left, right) => left.sellerId.localeCompare(right.sellerId)),
    provenance: body.provenance ?? null,
    capturedAt: capturedAt.toISOString(),
  };
  return {
    range: plan.range,
    sellers: body.sellers,
    capturedAt,
    providerBackedEmptyProof,
    salesRows,
    coverageRows,
    canonical,
  };
}

function hasExplicitEmptyProvenance(body: SellpiaSalesIngestBodyDto): boolean {
  const provenance = body.provenance;
  return (
    provenance?.source === 'sellpia_sale_summary' &&
    provenance.mode === 'selldate' &&
    provenance.sellerScope === 'all' &&
    provenance.responseShape === 'empty_object' &&
    provenance.explicitEmpty === true
  );
}

function sellerCountFromQuality(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const count = (value as Record<string, unknown>).sellerCount;
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : 0;
}

function businessDatesFromQuality(value: unknown, plan: SellpiaSalesSourcePlan): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [...plan.businessDates];
  const dates = (value as Record<string, unknown>).businessDates;
  return Array.isArray(dates) && dates.every((date) => typeof date === 'string')
    ? [...dates as string[]]
    : [...plan.businessDates];
}

@Injectable()
export class SellpiaSalesSourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(
    organizationId: string,
    idempotencyKey: string | undefined,
    request: SellpiaSalesSourceRequest = {},
  ): Promise<SellpiaSalesSourceAttempt> {
    const key = idempotencyKey?.trim() ?? '';
    if (!key || key.length > 128) throw new BadRequestException('INVALID_IDEMPOTENCY_KEY');
    const plan = buildSellpiaSalesSourcePlan(new Date(), request);
    const fingerprint = hash(request.range ?? null);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      const replay = await tx.sourceImportRun.findFirst({
        where: { organizationId, sourceType: SELLPIA_SALES_SOURCE_TYPE, idempotencyKey: key },
      });
      if (replay) {
        if (replay.requestFingerprint !== fingerprint) throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        if (isExpired(replay, now)) await this.failIn(tx, replay, 'ATTEMPT_EXPIRED', 'Sellpia sales collection expired.');
        const current = await tx.sourceImportRun.findFirst({ where: { id: replay.id, organizationId } });
        return this.attemptView(current ?? replay);
      }
      const running = await tx.sourceImportRun.findFirst({
        where: { organizationId, sourceType: SELLPIA_SALES_SOURCE_TYPE, status: 'running' },
      });
      if (running) {
        if (!isExpired(running, now)) throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: running.id });
        await this.failIn(tx, running, 'ATTEMPT_EXPIRED', 'Sellpia sales collection expired.');
      }
      const created = await tx.sourceImportRun.create({
        data: {
          organizationId,
          sourceType: SELLPIA_SALES_SOURCE_TYPE,
          status: 'running',
          attemptToken: randomUUID(),
          idempotencyKey: key,
          requestFingerprint: fingerprint,
          expiresAt: new Date(now.getTime() + SELLPIA_SALES_ATTEMPT_TTL_MS),
          plan: json(plan),
          parserVersion: SELLPIA_SALES_PARSER_VERSION,
          coverageStartDate: dateAtUtc(plan.range.from),
          coverageEndDate: dateAtUtc(plan.range.to),
        },
      });
      return this.attemptView(created);
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  async readAttempt(organizationId: string, attemptId: string): Promise<SellpiaSalesSourceAttempt | null> {
    const row = await this.prisma.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: SELLPIA_SALES_SOURCE_TYPE },
    });
    return row ? this.attemptView(row) : null;
  }

  async readAttemptControl(organizationId: string, attemptId: string): Promise<SellpiaSalesSourceControl | null> {
    const row = await this.prisma.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: SELLPIA_SALES_SOURCE_TYPE },
    });
    if (!row) return null;
    if (row.status !== 'running') throw new ConflictException('ATTEMPT_TERMINAL');
    if (isExpired(row)) throw new ConflictException('ATTEMPT_EXPIRED');
    return { ...this.attemptView(row), attemptToken: row.attemptToken };
  }

  async completeAttempt(
    organizationId: string,
    attemptId: string,
    attemptToken: string,
    body: SellpiaSalesIngestBodyDto,
  ): Promise<SellpiaSalesSourceAttempt> {
    const plan = buildSellpiaSalesSourcePlan(new Date(), {
      range: body.range,
    });
    const normalized = normalizePayload(organizationId, plan, body);
    const canonical = JSON.stringify(normalized.canonical);
    const contentChecksum = createHash('sha256').update(canonical).digest('hex');
    const contentByteCount = Buffer.byteLength(canonical);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      const row = await this.findAttempt(tx, organizationId, attemptId);
      this.assertToken(row, attemptToken);
      if (row.status === 'completed') {
        if (row.contentChecksum !== contentChecksum || row.contentByteCount !== contentByteCount) {
          throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
        }
        return this.attemptView(row);
      }
      if (row.status !== 'running') throw new ConflictException('ATTEMPT_TERMINAL');
      if (isExpired(row)) {
        await this.failIn(tx, row, 'ATTEMPT_EXPIRED', 'Sellpia sales collection expired.');
        throw new ConflictException('ATTEMPT_EXPIRED');
      }
      const frozenPlan = parsePlan(row.plan);
      if (frozenPlan.range.from !== normalized.range.from || frozenPlan.range.to !== normalized.range.to) {
        throw new ConflictException('SELLPIA_SALES_SCOPE_MISMATCH');
      }
      const data = [...normalized.salesRows, ...normalized.coverageRows].map((value) => ({
        ...value,
        sourceImportRunId: row.id,
      }));
      for (let offset = 0; offset < data.length; offset += INSERT_CHUNK_SIZE) {
        await tx.sellpiaSalesDailySnapshot.createMany({ data: data.slice(offset, offset + INSERT_CHUNK_SIZE) });
      }
      const previous = await tx.sourceImportRun.findFirst({
        where: {
          organizationId,
          sourceType: SELLPIA_SALES_SOURCE_TYPE,
          status: 'completed',
          publicationSequence: { not: null },
        },
        orderBy: { publicationSequence: 'desc' },
        select: { publicationSequence: true },
      });
      const completedAt = new Date();
      const publicationSequence = (previous?.publicationSequence ?? 0n) + 1n;
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: row.id,
          organizationId,
          sourceType: SELLPIA_SALES_SOURCE_TYPE,
          status: 'running',
          attemptToken,
        },
        data: {
          status: 'completed',
          rowCount: data.length,
          importedAt: completedAt,
          lastVerifiedAt: completedAt,
          verificationCount: { increment: 1 },
          contentChecksum,
          contentByteCount,
          providerBackedEmptyProof: normalized.providerBackedEmptyProof,
          publicationSequence,
          errorCode: null,
          errorMessage: null,
          qualityReport: json({
            sellerCount: normalized.salesRows.length === 0
              ? 0
              : new Set(normalized.salesRows.map((value) => value.sellerId)).size,
            businessDates: normalized.range.from === normalized.range.to
              ? [normalized.range.from]
              : frozenPlan.businessDates,
            factRowCount: normalized.salesRows.length,
            coverageRowCount: normalized.coverageRows.length,
            contentChecksum,
            contentByteCount,
          }),
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.resolveSourceFailure(tx, {
        organizationId,
        dedupeKey: SELLPIA_SALES_ALERT_DEDUPE_KEY,
        attemptId,
      });
      return this.attemptView({
        ...row,
        status: 'completed',
        rowCount: data.length,
        importedAt: completedAt,
        lastVerifiedAt: completedAt,
        verificationCount: row.verificationCount + 1,
        contentChecksum,
        contentByteCount,
        providerBackedEmptyProof: normalized.providerBackedEmptyProof,
        publicationSequence,
        errorCode: null,
        errorMessage: null,
        qualityReport: {
          sellerCount: normalized.salesRows.length === 0
            ? 0
            : new Set(normalized.salesRows.map((value) => value.sellerId)).size,
          businessDates: frozenPlan.businessDates,
        },
      });
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  async failAttempt(
    organizationId: string,
    attemptId: string,
    attemptToken: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<SellpiaSalesSourceAttempt> {
    const message = normalizeMessage(errorMessage);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, organizationId);
      const row = await this.findAttempt(tx, organizationId, attemptId);
      this.assertToken(row, attemptToken);
      if (row.status !== 'running') {
        if (row.status === 'failed' && row.errorCode === errorCode && row.errorMessage === message) return this.attemptView(row);
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      const failed = await this.failIn(tx, row, errorCode, message);
      return this.attemptView(failed);
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  async readPublishedRows(
    organizationId: string,
    from: string,
    to: string,
  ): Promise<SellpiaSalesPublishedRow[]> {
    const fromDate = parseCalendarDate(from);
    const toDate = parseCalendarDate(to);
    if (!fromDate || !toDate || fromDate > toDate) throw new BadRequestException('INVALID_DATE_RANGE');
    const runs = await this.prisma.sourceImportRun.findMany({
      where: {
        organizationId,
        sourceType: SELLPIA_SALES_SOURCE_TYPE,
        status: 'completed',
        publicationSequence: { not: null },
      },
      orderBy: { publicationSequence: 'desc' },
      select: { id: true, publicationSequence: true },
    });
    if (runs.length === 0) return [];
    const rows = await this.prisma.sellpiaSalesDailySnapshot.findMany({
      where: {
        organizationId,
        sourceImportRunId: { in: runs.map((run) => run.id) },
        businessDate: { gte: fromDate, lte: toDate },
      },
      select: {
        sourceImportRunId: true,
        businessDate: true,
        sellerId: true,
        sellerName: true,
        channelGroup: true,
        revenueKrw: true,
        qty: true,
        costKrw: true,
        capturedAt: true,
      },
      orderBy: { businessDate: 'asc' },
    });
    const grouped = new Map<string, SellpiaSalesPublishedRow[]>();
    for (const row of rows) {
      if (!row.sourceImportRunId || !row.businessDate) continue;
      const date = isoDate(row.businessDate);
      const key = `${row.sourceImportRunId}\u0000${date}`;
      const values = grouped.get(key) ?? [];
      values.push({
        businessDate: row.businessDate,
        sellerId: row.sellerId,
        sellerName: row.sellerName,
        channelGroup: row.channelGroup,
        revenueKrw: row.revenueKrw,
        qty: row.qty,
        costKrw: row.costKrw,
        capturedAt: row.capturedAt,
      });
      grouped.set(key, values);
    }
    const selected = new Set<string>();
    const result: SellpiaSalesPublishedRow[] = [];
    const dates = [...new Set(rows.filter((row) => row.businessDate).map((row) => isoDate(row.businessDate!)))].sort();
    for (const date of dates) {
      const candidates = runs.filter((run) => grouped.has(`${run.id}\u0000${date}`));
      const selectedRun = candidates.find((run) =>
        grouped.get(`${run.id}\u0000${date}`)?.some((row) => row.sellerId === SELLPIA_SALES_COVERAGE_SELLER_ID));
      if (!selectedRun || selected.has(date)) continue;
      selected.add(date);
      result.push(...(grouped.get(`${selectedRun.id}\u0000${date}`) ?? []));
    }
    return result.sort((left, right) => left.businessDate.getTime() - right.businessDate.getTime());
  }

  private async findAttempt(tx: Tx, organizationId: string, attemptId: string): Promise<SourceRun> {
    const row = await tx.sourceImportRun.findFirst({
      where: { id: attemptId, organizationId, sourceType: SELLPIA_SALES_SOURCE_TYPE },
    });
    if (!row) throw new NotFoundException('SELLPIA_SALES_ATTEMPT_NOT_FOUND');
    return row;
  }

  private async lock(tx: Tx, organizationId: string): Promise<void> {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(organizationId)}, 0))::text AS lock
    `);
  }

  private assertToken(row: SourceRun, token: string): void {
    if (!token || row.attemptToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
  }

  private async failIn(
    tx: Tx,
    row: SourceRun,
    errorCode: string,
    errorMessage: string,
  ): Promise<SourceRun> {
    const message = normalizeMessage(errorMessage);
    const failed = await tx.sourceImportRun.update({
      where: { id: row.id, organizationId: row.organizationId },
      data: { status: 'failed', errorCode, errorMessage: message },
    });
    if (errorCode !== 'USER_CANCELLED' && errorCode !== 'COLLECTION_CANCELLED') {
      await this.alerts.upsertSourceFailure(tx, {
        organizationId: row.organizationId,
        sourceType: SELLPIA_SALES_SOURCE_TYPE,
        attemptId: row.id,
        dedupeKey: SELLPIA_SALES_ALERT_DEDUPE_KEY,
        severity: 'error',
        title: '셀피아 판매현황 수집 실패',
        message,
        href: '/analytics/sellpia-product-sales',
      });
    }
    return failed;
  }

  private attemptView(row: SourceRun): SellpiaSalesSourceAttempt {
    const plan = parsePlan(row.plan);
    const expired = isExpired(row);
    const quality = row.qualityReport;
    return {
      attemptId: row.id,
      sourceType: SELLPIA_SALES_SOURCE_TYPE,
      state: row.status === 'completed' ? 'COMPLETE' : row.status === 'running' && !expired ? 'RUNNING' : 'FAILED',
      expiresAt: row.expiresAt?.toISOString() ?? row.createdAt.toISOString(),
      plan,
      actualCutoffAt: row.status === 'completed' ? dateAtUtc(plan.range.to).toISOString() : null,
      completedAt: row.importedAt?.toISOString() ?? null,
      contentChecksum: row.contentChecksum,
      contentByteCount: row.contentByteCount,
      rowCount: row.rowCount,
      sellerCount: sellerCountFromQuality(quality),
      businessDates: businessDatesFromQuality(quality, plan),
      errorCode: expired ? 'ATTEMPT_EXPIRED' : row.errorCode,
      errorMessage: expired ? 'Sellpia sales collection expired.' : row.errorMessage,
    };
  }
}

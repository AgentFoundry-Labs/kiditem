import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { currentBusinessDate } from '../../../domain/business-date';
import { upsertWingTrackedProductSnapshots } from './wing-tracked-product-snapshot.persistence';
import { lockWingTrackedProductsSource } from './wing-tracked-product-source-lock';
import type {
  WingTrackedProductAttemptPlan,
  WingTrackedProductAttemptUpload,
  WingTrackedProductSourceView,
} from '../../../application/port/out/repository/wing-tracked-product.repository.port';
import type { WingTrackedProductSourceAttemptRepositoryPort } from '../../../application/port/out/repository/wing-tracked-product-source-attempt.repository.port';

export const WING_TRACKED_PRODUCTS_SOURCE_TYPE = 'coupang_wing_tracked_products';
export const WING_TRACKED_PRODUCTS_PARSER_VERSION = 'wing-tracked-products-v1';
export const WING_TRACKED_PRODUCTS_ALERT_DEDUPE_KEY = 'source:coupang-wing-tracked-products';

const ATTEMPT_TTL_MS = 30 * 60_000;
const DB_RUNNING = 'running';
const DB_COMPLETE = 'completed';
const DB_FAILED = 'failed';
const MAX_ATTEMPT_PRODUCTS = 300;

type Transaction = Prisma.TransactionClient;
type SourceAttempt = Prisma.SourceImportRunGetPayload<{}>;
type StoredAttemptPlan = Readonly<{
  businessDate: string;
  sourceKeywordFallback: 'any_requested_keyword_for_unassigned_product';
  keywords: readonly string[];
  products: readonly { productId: string; sourceKeyword: string | null }[];
}>;

@Injectable()
export class WingTrackedProductSourceAttemptRepositoryAdapter
  implements WingTrackedProductSourceAttemptRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    keywords: readonly string[];
  }): Promise<WingTrackedProductAttemptPlan> {
    const keywords = normalizeRequestedKeywords(input.keywords);
    const now = new Date();
    return this.prisma.$transaction(async (tx): Promise<WingTrackedProductAttemptPlan> => {
      await lockWingTrackedProductsSource(tx, input.organizationId);
      const existing = await findAttemptByIdempotency(tx, input.organizationId, input.idempotencyKey);
      if (existing) {
        const plan = parseAttemptPlan(existing.plan);
        if (!sameStringList(plan.keywords, keywords)) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        if (dbState(existing.status) === DB_RUNNING && hasExpired(existing, now)) {
          await this.expireAttempt(tx, existing);
          return publicPlan(existing, plan, 'FAILED');
        }
        return publicPlan(existing, plan);
      }

      const expired = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
          status: DB_RUNNING,
          expiresAt: { lte: now },
        },
      });
      if (expired) await this.expireAttempt(tx, expired);

      const running = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
          status: DB_RUNNING,
        },
        select: { id: true },
      });
      if (running) {
        throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: running.id });
      }

      const trackers = await tx.coupangWingTrackedProduct.findMany({
        where: { organizationId: input.organizationId, enabled: true },
        orderBy: { productId: 'asc' },
        select: { productId: true, sourceKeyword: true },
      });
      if (trackers.length > MAX_ATTEMPT_PRODUCTS) {
        throw new UnprocessableEntityException('WING_TRACKED_PRODUCT_LIMIT');
      }
      assertTrackerKeywordsCovered(trackers, keywords);
      const plan: StoredAttemptPlan = {
        businessDate: isoDate(currentBusinessDate()),
        sourceKeywordFallback: 'any_requested_keyword_for_unassigned_product',
        keywords,
        products: trackers.map((tracker) => ({
          productId: tracker.productId,
          sourceKeyword: tracker.sourceKeyword,
        })),
      };
      const attemptToken = randomUUID();
      const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS);
      const run = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
          status: DB_RUNNING,
          attemptToken,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: hashAttemptRequest(plan),
          expiresAt,
          plan,
          parserVersion: WING_TRACKED_PRODUCTS_PARSER_VERSION,
          rowCount: plan.products.length,
          coverageStartDate: dateOnly(plan.businessDate),
          coverageEndDate: dateOnly(plan.businessDate),
          qualityReport: {
            sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
            parserVersion: WING_TRACKED_PRODUCTS_PARSER_VERSION,
            businessDate: plan.businessDate,
            keywords: plan.keywords,
            expectedProductCount: plan.products.length,
            capturedProductCount: 0,
            failedProductCount: 0,
          },
        },
      });
      return publicPlan(run, plan);
    }, mutationTransactionOptions());
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<WingTrackedProductAttemptPlan | null> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await findAttemptOrNull(tx, input.organizationId, input.attemptId);
      if (!attempt) return null;
      return publicPlan(attempt, parseAttemptPlan(attempt.plan));
    }, snapshotTransactionOptions());
  }

  async readSourceStatus(input: {
    organizationId: string;
  }): Promise<WingTrackedProductSourceView> {
    return this.prisma.$transaction(async (tx) => {
      const latest = await latestAttempt(tx, input.organizationId);
      const complete = await latestCompleteAttempt(tx, input.organizationId);
      const currentTargets = complete
        ? await listEnabledTrackerTargets(tx, input.organizationId)
        : [];
      return sourceView(latest, complete, currentTargets, new Date());
    }, snapshotTransactionOptions());
  }

  async submitAttempt(input: WingTrackedProductAttemptUpload): Promise<WingTrackedProductSourceView> {
    await this.prisma.$transaction(async (tx) => {
      await lockWingTrackedProductsSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertAttemptToken(attempt, input.attemptToken);
      const plan = parseAttemptPlan(attempt.plan);
      const payloadHash = hashSubmission(input, plan);
      const state = effectiveState(attempt, new Date());
      if (state === 'COMPLETE') {
        if (attempt.contentChecksum !== payloadHash) {
          throw new ConflictException('WING_TRACKED_REPLAY_CONFLICT');
        }
        return;
      }
      if (state === 'FAILED') throw new ConflictException('ATTEMPT_TERMINAL');
      assertWritable(attempt);
      const normalized = validateSubmission(input, plan);
      await assertFrozenTrackerTargets(tx, input.organizationId, plan);
      const capturedAt = new Date();
      const rows = normalized.map((item) => ({
        ...item,
        businessDate: dateOnly(plan.businessDate),
        capturedAt,
      }));
      const stored = await upsertWingTrackedProductSnapshots(tx, rows, input.organizationId);
      if (stored.captured !== rows.length) {
        throw new ConflictException('WING_TRACKED_TARGET_CHANGED');
      }
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
          status: DB_RUNNING,
          attemptToken: input.attemptToken,
        },
        data: {
          status: DB_COMPLETE,
          importedAt: capturedAt,
          lastVerifiedAt: capturedAt,
          verificationCount: { increment: 1 },
          contentChecksum: payloadHash,
          contentByteCount: Buffer.byteLength(JSON.stringify({ items: normalized })),
          qualityReport: {
            sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
            parserVersion: WING_TRACKED_PRODUCTS_PARSER_VERSION,
            businessDate: plan.businessDate,
            keywords: plan.keywords,
            expectedProductCount: plan.products.length,
            capturedProductCount: normalized.length,
            failedProductCount: 0,
            completeSnapshot: true,
          },
          errorCode: null,
          errorMessage: null,
          rowCount: normalized.length,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: WING_TRACKED_PRODUCTS_ALERT_DEDUPE_KEY,
        attemptId: input.attemptId,
      });
    }, mutationTransactionOptions());
    return this.readSourceStatus({ organizationId: input.organizationId });
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    code: string;
    message: string;
  }): Promise<WingTrackedProductSourceView> {
    await this.prisma.$transaction(async (tx) => {
      await lockWingTrackedProductsSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertAttemptToken(attempt, input.attemptToken);
      const state = dbState(attempt.status);
      if (state === DB_COMPLETE) throw new ConflictException('ATTEMPT_TERMINAL');
      if (state === DB_FAILED) {
        if (attempt.errorCode !== input.code || attempt.errorMessage !== input.message) {
          throw new ConflictException('ATTEMPT_TERMINAL');
        }
        return;
      }
      assertWritable(attempt);
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
          status: DB_RUNNING,
          attemptToken: input.attemptToken,
        },
        data: { status: DB_FAILED, errorCode: input.code, errorMessage: input.message },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      if (input.code !== 'COLLECTION_CANCELLED') {
        await this.alerts.upsertSourceFailure(tx, failureAlert(input));
      }
    }, mutationTransactionOptions());
    return this.readSourceStatus({ organizationId: input.organizationId });
  }

  private async expireAttempt(tx: Transaction, attempt: SourceAttempt): Promise<void> {
    const updated = await tx.sourceImportRun.updateMany({
      where: {
        id: attempt.id,
        organizationId: attempt.organizationId,
        sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
        status: DB_RUNNING,
      },
      data: {
        status: DB_FAILED,
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: 'Tracked Wing collection expired before publication.',
      },
    });
    if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
    await this.alerts.upsertSourceFailure(tx, {
      organizationId: attempt.organizationId,
      dedupeKey: WING_TRACKED_PRODUCTS_ALERT_DEDUPE_KEY,
      sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
      attemptId: attempt.id,
      severity: 'error',
      title: 'Coupang Wing 추적상품 수집 만료',
      message: 'ATTEMPT_EXPIRED: Tracked Wing collection expired before publication.',
      href: '/sourcing-ai/product-tracking',
    });
  }

}

function failureAlert(input: {
  organizationId: string;
  attemptId: string;
  code: string;
  message: string;
}) {
  return {
    organizationId: input.organizationId,
    dedupeKey: WING_TRACKED_PRODUCTS_ALERT_DEDUPE_KEY,
    sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
    attemptId: input.attemptId,
    severity: 'error' as const,
    title: 'Coupang Wing 추적상품 수집 실패',
    message: `${input.code}: ${input.message}`.slice(0, 300),
    href: '/sourcing-ai/product-tracking',
  };
}

function dbState(status: string): string {
  return status === DB_RUNNING || status === DB_COMPLETE || status === DB_FAILED
    ? status
    : DB_FAILED;
}

function effectiveState(attempt: SourceAttempt, now: Date): 'RUNNING' | 'COMPLETE' | 'FAILED' {
  if (dbState(attempt.status) === DB_COMPLETE) return 'COMPLETE';
  if (dbState(attempt.status) === DB_RUNNING && !hasExpired(attempt, now)) return 'RUNNING';
  return 'FAILED';
}

function hasExpired(attempt: SourceAttempt, now: Date): boolean {
  return !attempt.expiresAt || attempt.expiresAt.getTime() <= now.getTime();
}

function assertAttemptToken(attempt: SourceAttempt, attemptToken: string): void {
  if (attempt.attemptToken !== attemptToken) throw new ConflictException('ATTEMPT_FENCE_LOST');
}

function assertWritable(attempt: SourceAttempt): void {
  if (dbState(attempt.status) !== DB_RUNNING) throw new ConflictException('ATTEMPT_TERMINAL');
  if (hasExpired(attempt, new Date())) throw new ConflictException('ATTEMPT_EXPIRED');
}

function parseAttemptPlan(value: Prisma.JsonValue | null): StoredAttemptPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('WING_TRACKED_ATTEMPT_PLAN_MALFORMED');
  }
  const plan = value as Record<string, unknown>;
  const businessDate = typeof plan.businessDate === 'string' ? plan.businessDate : '';
  const sourceKeywordFallback = plan.sourceKeywordFallback === 'any_requested_keyword_for_unassigned_product'
    ? plan.sourceKeywordFallback
    : null;
  const keywords = Array.isArray(plan.keywords)
    ? plan.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
    : [];
  const products = Array.isArray(plan.products)
    ? plan.products.flatMap((product) => {
      if (!product || typeof product !== 'object' || Array.isArray(product)) return [];
      const row = product as Record<string, unknown>;
      return typeof row.productId === 'string'
        ? [{ productId: row.productId, sourceKeyword: typeof row.sourceKeyword === 'string' ? row.sourceKeyword : null }]
        : [];
    })
    : [];
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)
    || sourceKeywordFallback === null
    || keywords.length < 1
    || keywords.length > 12
    || products.length > MAX_ATTEMPT_PRODUCTS
  ) {
    throw new Error('WING_TRACKED_ATTEMPT_PLAN_MALFORMED');
  }
  return { businessDate, sourceKeywordFallback, keywords, products };
}

function publicPlan(
  attempt: SourceAttempt,
  plan: StoredAttemptPlan,
  state = effectiveState(attempt, new Date()),
): WingTrackedProductAttemptPlan {
  return {
    attemptId: attempt.id,
    attemptToken: attempt.attemptToken,
    state,
    expiresAt: attempt.expiresAt?.toISOString() ?? attempt.createdAt.toISOString(),
    businessDate: plan.businessDate,
    sourceKeywordFallback: plan.sourceKeywordFallback,
    keywords: plan.keywords,
    products: plan.products,
  };
}

function hashAttemptRequest(plan: StoredAttemptPlan): string {
  return hashJson({ sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE, parserVersion: WING_TRACKED_PRODUCTS_PARSER_VERSION, plan });
}

function hashSubmission(input: WingTrackedProductAttemptUpload, plan: StoredAttemptPlan): string {
  return hashJson({
    sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE,
    parserVersion: WING_TRACKED_PRODUCTS_PARSER_VERSION,
    businessDate: plan.businessDate,
    items: [...input.items].map((item) => ({ ...item })).sort((left, right) => left.productId.localeCompare(right.productId)),
  });
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateSubmission(
  input: WingTrackedProductAttemptUpload,
  plan: StoredAttemptPlan,
): readonly WingTrackedProductAttemptUpload['items'][number][] {
  if (input.items.length > MAX_ATTEMPT_PRODUCTS) {
    throw new UnprocessableEntityException('WING_TRACKED_SNAPSHOT_LIMIT');
  }
  const planned = new Map(plan.products.map((product) => [product.productId, product]));
  const seen = new Set<string>();
  for (const item of input.items) {
    if (seen.has(item.productId) || !planned.has(item.productId)) {
      throw new UnprocessableEntityException('WING_TRACKED_TARGET_NOT_PLANNED');
    }
    const plannedProduct = planned.get(item.productId)!;
    if (!item.sourceKeyword) {
      throw new UnprocessableEntityException('WING_TRACKED_PRODUCT_KEYWORD_MISMATCH');
    }
    if (plannedProduct.sourceKeyword !== null) {
      if (!sameKeyword(item.sourceKeyword, plannedProduct.sourceKeyword)) {
        throw new UnprocessableEntityException('WING_TRACKED_PRODUCT_KEYWORD_MISMATCH');
      }
    } else if (!keywordAllowed(item.sourceKeyword, plan.keywords)) {
      throw new UnprocessableEntityException('WING_TRACKED_KEYWORD_NOT_PLANNED');
    }
    seen.add(item.productId);
  }
  if (seen.size !== planned.size) throw new UnprocessableEntityException('WING_TRACKED_SNAPSHOT_INCOMPLETE');
  return input.items;
}

function keywordAllowed(keyword: string, allowed: readonly string[]): boolean {
  return allowed.some((candidate) => sameKeyword(candidate, keyword));
}

function sameKeyword(left: string, right: string): boolean {
  return normalizeKeyword(left) === normalizeKeyword(right);
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').normalize('NFC').toLocaleLowerCase('en-US');
}

function normalizeRequestedKeywords(keywords: readonly string[]): string[] {
  if (!Array.isArray(keywords)) {
    throw new UnprocessableEntityException('WING_TRACKED_KEYWORD_INVALID');
  }
  const unique = new Map<string, string>();
  for (const keyword of keywords) {
    if (typeof keyword !== 'string') {
      throw new UnprocessableEntityException('WING_TRACKED_KEYWORD_INVALID');
    }
    const normalized = keyword.trim().replace(/\s+/gu, ' ').normalize('NFC');
    if (normalized.length === 0 || normalized.length > 100) {
      throw new UnprocessableEntityException('WING_TRACKED_KEYWORD_INVALID');
    }
    const identity = normalizeKeyword(normalized);
    if (!unique.has(identity)) unique.set(identity, normalized);
  }
  if (unique.size === 0) {
    throw new UnprocessableEntityException('WING_TRACKED_KEYWORD_INVALID');
  }
  if (unique.size > 12) {
    throw new UnprocessableEntityException('WING_TRACKED_KEYWORD_LIMIT');
  }
  return [...unique.values()];
}

function assertTrackerKeywordsCovered(
  trackers: readonly { sourceKeyword: string | null }[],
  keywords: readonly string[],
): void {
  if (trackers.some((tracker) =>
    tracker.sourceKeyword !== null && !keywordAllowed(tracker.sourceKeyword, keywords),
  )) {
    throw new UnprocessableEntityException('WING_TRACKED_KEYWORD_SCOPE_INCOMPLETE');
  }
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function findAttemptByIdempotency(
  tx: Transaction,
  organizationId: string,
  idempotencyKey: string,
): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: { organizationId, sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE, idempotencyKey },
  });
}

async function findAttemptOrNull(
  tx: Transaction,
  organizationId: string,
  attemptId: string,
): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: { id: attemptId, organizationId, sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE },
  });
}

async function findAttempt(tx: Transaction, organizationId: string, attemptId: string): Promise<SourceAttempt> {
  const attempt = await findAttemptOrNull(tx, organizationId, attemptId);
  if (!attempt) throw new NotFoundException('WING_TRACKED_ATTEMPT_NOT_FOUND');
  return attempt;
}

async function latestAttempt(tx: Transaction, organizationId: string): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: { organizationId, sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

async function latestCompleteAttempt(tx: Transaction, organizationId: string): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: { organizationId, sourceType: WING_TRACKED_PRODUCTS_SOURCE_TYPE, status: DB_COMPLETE },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

function sourceView(
  latest: SourceAttempt | null,
  complete: SourceAttempt | null,
  currentTargets: readonly { productId: string; sourceKeyword: string | null }[],
  now: Date,
): WingTrackedProductSourceView {
  const completePlan = complete ? parseAttemptPlan(complete.plan) : null;
  const quality = complete ? qualityReport(complete.qualityReport) : null;
  const latestComplete = complete && completePlan && quality
    ? {
      sourceImportRunId: complete.id,
      businessDate: completePlan.businessDate,
      capturedAt: (complete.importedAt ?? complete.updatedAt).toISOString(),
      expectedProductCount: quality.expectedProductCount,
      capturedProductCount: quality.capturedProductCount,
      failedProductCount: quality.failedProductCount,
    }
    : null;
  const latestState = latest ? effectiveState(latest, now) : null;
  const ready = latestComplete !== null
    && latestComplete.businessDate >= isoDate(currentBusinessDate(now))
    && completePlan !== null
    && sameTrackerTargetSet(completePlan.products, currentTargets)
    && (latest?.id === complete?.id || latestState === 'RUNNING');
  return {
    latestAttempt: latest ? {
      attemptId: latest.id,
      state: effectiveState(latest, now),
      startedAt: latest.createdAt.toISOString(),
      capturedAt: latest.importedAt?.toISOString() ?? null,
      expiresAt: latest.expiresAt?.toISOString() ?? latest.createdAt.toISOString(),
      errorCode: effectiveState(latest, now) === 'FAILED' && dbState(latest.status) === DB_RUNNING
        ? 'ATTEMPT_EXPIRED'
        : latest.errorCode,
      errorMessage: latest.errorMessage?.slice(0, 300) ?? null,
    } : null,
    latestComplete,
    status: latestComplete === null ? 'MISSING' : ready ? 'READY' : 'STALE',
  };
}

async function listEnabledTrackerTargets(
  tx: Transaction,
  organizationId: string,
): Promise<Array<{ productId: string; sourceKeyword: string | null }>> {
  return tx.coupangWingTrackedProduct.findMany({
    where: { organizationId, enabled: true },
    orderBy: { productId: 'asc' },
    select: { productId: true, sourceKeyword: true },
  });
}

async function assertFrozenTrackerTargets(
  tx: Transaction,
  organizationId: string,
  plan: StoredAttemptPlan,
): Promise<void> {
  const currentTargets = await listEnabledTrackerTargets(tx, organizationId);
  if (!sameTrackerTargetSet(plan.products, currentTargets)) {
    throw new ConflictException('WING_TRACKED_TARGET_CHANGED');
  }
}

function sameTrackerTargetSet(
  planned: readonly { productId: string; sourceKeyword: string | null }[],
  current: readonly { productId: string; sourceKeyword: string | null }[],
): boolean {
  if (planned.length !== current.length) return false;
  return planned.every((target, index) =>
    target.productId === current[index]?.productId
    && target.sourceKeyword === current[index]?.sourceKeyword,
  );
}

function qualityReport(value: Prisma.JsonValue | null): {
  expectedProductCount: number;
  capturedProductCount: number;
  failedProductCount: number;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const fields = [row.expectedProductCount, row.capturedProductCount, row.failedProductCount];
  if (!fields.every((field) => typeof field === 'number' && Number.isSafeInteger(field) && field >= 0)) return null;
  return {
    expectedProductCount: fields[0] as number,
    capturedProductCount: fields[1] as number,
    failedProductCount: fields[2] as number,
  };
}

function mutationTransactionOptions() {
  return {
    timeout: 30_000,
    maxWait: 10_000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  } as const;
}

function snapshotTransactionOptions() {
  return {
    timeout: 30_000,
    maxWait: 10_000,
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  } as const;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

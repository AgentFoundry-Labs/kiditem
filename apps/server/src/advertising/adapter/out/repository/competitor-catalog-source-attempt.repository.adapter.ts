import { createHash, randomUUID } from 'node:crypto';
import { operatorErrorText } from '@kiditem/shared/errors';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { deriveSourceReadiness } from '@kiditem/shared/source-readiness';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { businessDateKey, evidenceCutoffDate } from '../../../../common/kst';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  currentBusinessDate,
  toBusinessDate,
} from '../../../domain/business-date';
import { KeywordRankIngestHandler } from '../../../application/service/keyword-rank-ingest.handler';
import {
  runWithAdIngestTransaction,
} from './ad-ingest-transaction-context';
import { lockCompetitorCatalogSource } from './competitor-catalog-source-lock';
import {
  effectiveSourceImportRunState as effectiveState,
  sourceImportRunDbState as dbState,
} from './source-import-run-state';
import type { AdvertisingCompetitorCatalogItem } from '@kiditem/shared/sourcing';
import type {
  CompetitorCatalogAttemptInput,
  CompetitorCatalogAttemptPlan,
  CompetitorCatalogSourceAttemptRepositoryPort,
  CompetitorCatalogSourceView,
  CompetitorCatalogSubmission,
  CompetitorCatalogTargetPlan,
} from '../../../application/port/out/repository/competitor-catalog-source-attempt.repository.port';

export const COMPETITOR_CATALOG_SOURCE_TYPE = 'coupang_competitor_catalog';
export const COMPETITOR_CATALOG_SOURCE_PARSER_VERSION = 'competitor-catalog-v1';
export const COMPETITOR_CATALOG_SOURCE_ALERT_DEDUPE_KEY = 'source:coupang-competitor-catalog';

const ATTEMPT_TTL_MS = 30 * 60_000;
const DB_RUNNING = SOURCE_IMPORT_RUN_RUNNING_STATUS;
const DB_COMPLETE = SOURCE_IMPORT_RUN_COMPLETED_STATUS;
const DB_FAILED = SOURCE_IMPORT_RUN_FAILED_STATUS;
const MAX_TARGETS = 20;

type Transaction = Prisma.TransactionClient;
type SourceAttempt = Prisma.SourceImportRunGetPayload<{}>;
type StoredAttemptPlan = Readonly<{
  input: CompetitorCatalogAttemptInput;
  targets: readonly CompetitorCatalogTargetPlan[];
}>;

/**
 * Advertising's cohesive source owner for server-selected competitor catalog
 * evidence. The owner, not the extension, publishes the complete source
 * manifest and mutates the SERP baseline in its terminal transaction.
 */
@Injectable()
export class CompetitorCatalogSourceAttemptRepositoryAdapter
  implements CompetitorCatalogSourceAttemptRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    private readonly keywordRankIngest: KeywordRankIngestHandler,
  ) {}

  replayAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    input: CompetitorCatalogAttemptInput;
  }): Promise<CompetitorCatalogAttemptPlan | null> {
    const request = normalizeInput(input.input);
    return this.prisma.$transaction(async (tx) => {
      await lockCompetitorCatalogSource(tx, input.organizationId);
      const existing = await findAttemptByIdempotency(
        tx, input.organizationId, input.idempotencyKey,
      );
      return existing
        ? this.replayStoredAttempt(tx, existing, request, new Date())
        : null;
    }, mutationTransactionOptions());
  }

  async beginAttempt(input: {
    organizationId: string;
    idempotencyKey: string;
    input: CompetitorCatalogAttemptInput;
    targets: readonly CompetitorCatalogTargetPlan[];
  }): Promise<CompetitorCatalogAttemptPlan> {
    let plan: StoredAttemptPlan = {
      input: normalizeInput(input.input),
      targets: normalizeTargets(input.targets),
    };
    const now = new Date();
    return this.prisma.$transaction(async (tx): Promise<CompetitorCatalogAttemptPlan> => {
      await lockCompetitorCatalogSource(tx, input.organizationId);
      const existing = await findAttemptByIdempotency(
        tx,
        input.organizationId,
        input.idempotencyKey,
      );
      if (existing) {
        return this.replayStoredAttempt(tx, existing, plan.input, now);
      }

      if (plan.input.target === 'rank_enrichment' && plan.input.excludeCompletedAttemptId) {
        const completed = await tx.sourceImportRun.findFirst({
          where: {
            id: plan.input.excludeCompletedAttemptId,
            organizationId: input.organizationId,
            sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
            parserVersion: COMPETITOR_CATALOG_SOURCE_PARSER_VERSION,
            status: DB_COMPLETE,
          },
        });
        if (!completed) {
          throw new UnprocessableEntityException('COMPETITOR_CATALOG_EXCLUSION_NOT_COMPLETE');
        }
        const completedPlan = parseAttemptPlan(completed.plan);
        if (completedPlan.input.target !== 'rank_enrichment') {
          throw new UnprocessableEntityException('COMPETITOR_CATALOG_EXCLUSION_NOT_COMPLETE');
        }
        const excluded = new Set(completedPlan.targets.map((target) => target.sellerId));
        plan = {
          ...plan,
          targets: plan.targets.filter((target) => !excluded.has(target.sellerId)),
        };
      }

      const expired = await tx.sourceImportRun.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
          status: DB_RUNNING,
          expiresAt: { lte: now },
        },
      });
      for (const attempt of expired) await this.expireAttempt(tx, attempt);

      const running = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
          status: DB_RUNNING,
        },
        select: { id: true },
      });
      if (running) {
        throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: running.id });
      }

      const attemptToken = randomUUID();
      const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS);
      if (plan.targets.length === 0) {
        const complete = await tx.sourceImportRun.create({
          data: completeAttemptData({
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
            attemptToken,
            expiresAt,
            plan,
            completedAt: now,
            capturedAt: now,
            capturedTargetCount: 0,
            ignoredTargetCount: 0,
            contentChecksum: hashSubmission([], plan),
          }),
        });
        await this.alerts.resolveSourceFailure(tx, {
          organizationId: input.organizationId,
          dedupeKey: COMPETITOR_CATALOG_SOURCE_ALERT_DEDUPE_KEY,
          attemptId: complete.id,
        });
        return publicPlan(complete, plan, 'COMPLETE');
      }

      const run = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
          status: DB_RUNNING,
          attemptToken,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: hashAttemptRequest(plan.input),
          expiresAt,
          plan: serializeAttemptPlan(plan),
          parserVersion: COMPETITOR_CATALOG_SOURCE_PARSER_VERSION,
          rowCount: plan.targets.length,
          coverageStartDate: null,
          coverageEndDate: null,
          qualityReport: qualityReport(plan, {
            capturedTargetCount: 0,
            ignoredTargetCount: 0,
            completeSnapshot: false,
          }),
        },
      });
      return publicPlan(run, plan);
    }, mutationTransactionOptions());
  }

  private async replayStoredAttempt(
    tx: Transaction,
    existing: SourceAttempt,
    input: CompetitorCatalogAttemptInput,
    now: Date,
  ) {
    const plan = parseAttemptPlan(existing.plan);
    if (!sameInput(plan.input, input)) throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
    if (dbState(existing.status) === DB_RUNNING && hasExpired(existing, now)) {
      await this.expireAttempt(tx, existing);
      return publicPlan(existing, plan, 'FAILED');
    }
    return publicPlan(existing, plan);
  }

  async readAttemptControl(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<CompetitorCatalogAttemptPlan | null> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await findAttemptOrNull(tx, input.organizationId, input.attemptId);
      return attempt ? publicPlan(attempt, parseAttemptPlan(attempt.plan)) : null;
    }, snapshotTransactionOptions());
  }

  async readSourceStatus(input: {
    organizationId: string;
  }): Promise<CompetitorCatalogSourceView> {
    return this.prisma.$transaction(async (tx) => sourceView(
      await latestAttempt(tx, input.organizationId),
      await latestCompleteAttempt(tx, input.organizationId),
      new Date(),
    ), snapshotTransactionOptions());
  }

  async submitAttempt(input: CompetitorCatalogSubmission): Promise<CompetitorCatalogSourceView> {
    await this.prisma.$transaction(async (tx) => {
      await lockCompetitorCatalogSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertAttemptToken(attempt, input.attemptToken);
      const plan = parseAttemptPlan(attempt.plan);
      const normalized = validateSubmission(input.catalogs, plan);
      const payloadHash = hashSubmission(normalized, plan);
      const state = effectiveState(attempt, new Date());
      if (state === 'COMPLETE') {
        if (attempt.contentChecksum !== payloadHash) {
          throw new ConflictException('COMPETITOR_CATALOG_REPLAY_CONFLICT');
        }
        return;
      }
      if (state === 'FAILED') throw new ConflictException('ATTEMPT_TERMINAL');
      assertWritable(attempt);

      const capturedAt = latestCapturedAt(normalized);
      const persisted = await runWithAdIngestTransaction(tx, () =>
        this.keywordRankIngest.executeSellerCatalogs({
          type: 'competitor_seller_catalog',
          source: 'coupang-seller-shop',
          timestamp: capturedAt.toISOString(),
          data: normalized as unknown as Array<Record<string, unknown>>,
        }, input.organizationId),
      );
      const capturedTargetCount = persisted.results.length;
      const ignoredTargetCount = persisted.ignored.length;
      if (capturedTargetCount + ignoredTargetCount !== plan.targets.length) {
        throw new ConflictException('COMPETITOR_CATALOG_PUBLICATION_INCOMPLETE');
      }

      const dates = normalized.map((catalog) => toBusinessDate(catalog.capturedAt));
      const coverage = dates.filter((value): value is Date => value !== null)
        .sort((left, right) => left.getTime() - right.getTime());
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
          status: DB_RUNNING,
          attemptToken: input.attemptToken,
        },
        data: {
          status: DB_COMPLETE,
          importedAt: capturedAt,
          lastVerifiedAt: capturedAt,
          verificationCount: { increment: 1 },
          contentChecksum: payloadHash,
          contentByteCount: Buffer.byteLength(JSON.stringify({ catalogs: normalized })),
          coverageStartDate: coverage[0] ?? null,
          coverageEndDate: coverage.at(-1) ?? null,
          rowCount: normalized.length,
          qualityReport: qualityReport(plan, {
            capturedTargetCount,
            ignoredTargetCount,
            completeSnapshot: true,
          }),
          errorCode: null,
          errorMessage: null,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: COMPETITOR_CATALOG_SOURCE_ALERT_DEDUPE_KEY,
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
  }): Promise<CompetitorCatalogSourceView> {
    await this.prisma.$transaction(async (tx) => {
      await lockCompetitorCatalogSource(tx, input.organizationId);
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
          sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
          status: DB_RUNNING,
          attemptToken: input.attemptToken,
        },
        data: { status: DB_FAILED, errorCode: input.code, errorMessage: input.message },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.recordTerminalOutcome(tx, failureAlert(input));
    }, mutationTransactionOptions());
    return this.readSourceStatus({ organizationId: input.organizationId });
  }

  /** Operator stop without the attempt token; a terminal attempt is left unchanged. */
  async cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<CompetitorCatalogSourceView> {
    await this.prisma.$transaction(async (tx) => {
      await lockCompetitorCatalogSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      if (dbState(attempt.status) !== DB_RUNNING) return;
      if (hasExpired(attempt, new Date())) {
        await this.expireAttempt(tx, attempt);
        return;
      }
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: attempt.id,
          organizationId: input.organizationId,
          sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
          status: DB_RUNNING,
        },
        data: { status: DB_FAILED, errorCode: OPERATOR_CANCEL_CODE, errorMessage: OPERATOR_CANCEL_MESSAGE },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.recordTerminalOutcome(tx, failureAlert({
        organizationId: input.organizationId,
        attemptId: attempt.id,
        code: OPERATOR_CANCEL_CODE,
        message: OPERATOR_CANCEL_MESSAGE,
      }));
    }, mutationTransactionOptions());
    return this.readSourceStatus({ organizationId: input.organizationId });
  }

  private async expireAttempt(tx: Transaction, attempt: SourceAttempt): Promise<void> {
    const updated = await tx.sourceImportRun.updateMany({
      where: {
        id: attempt.id,
        organizationId: attempt.organizationId,
        sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
        status: DB_RUNNING,
      },
      data: {
        status: DB_FAILED,
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: operatorErrorText({ code: 'ATTEMPT_EXPIRED' }),
      },
    });
    if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
    await this.alerts.recordTerminalOutcome(tx, {
      code: 'ATTEMPT_EXPIRED',
      organizationId: attempt.organizationId,
      dedupeKey: COMPETITOR_CATALOG_SOURCE_ALERT_DEDUPE_KEY,
      sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
      attemptId: attempt.id,
      title: '쿠팡 경쟁 판매자 수집 만료',
      message: '경쟁 판매자 수집이 결과를 저장하기 전에 만료되었습니다. 다시 수집해주세요.',
      href: '/sourcing-ai/competitor-analysis',
    });
  }
}

function completeAttemptData(input: {
  organizationId: string;
  idempotencyKey: string;
  attemptToken: string;
  expiresAt: Date;
  plan: StoredAttemptPlan;
  completedAt: Date;
  capturedAt: Date;
  capturedTargetCount: number;
  ignoredTargetCount: number;
  contentChecksum: string;
}) {
  const businessDate = currentBusinessDate(input.capturedAt);
  return {
    organizationId: input.organizationId,
    sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
    status: DB_COMPLETE,
    attemptToken: input.attemptToken,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: hashAttemptRequest(input.plan.input),
    expiresAt: input.expiresAt,
    plan: serializeAttemptPlan(input.plan),
    parserVersion: COMPETITOR_CATALOG_SOURCE_PARSER_VERSION,
    rowCount: 0,
    importedAt: input.completedAt,
    lastVerifiedAt: input.completedAt,
    verificationCount: 1,
    contentChecksum: input.contentChecksum,
    contentByteCount: 0,
    coverageStartDate: businessDate,
    coverageEndDate: businessDate,
    qualityReport: qualityReport(input.plan, {
      capturedTargetCount: input.capturedTargetCount,
      ignoredTargetCount: input.ignoredTargetCount,
      completeSnapshot: true,
    }),
  };
}

function failureAlert(input: {
  organizationId: string;
  attemptId: string;
  code: string;
  message: string;
}) {
  return {
    organizationId: input.organizationId,
    dedupeKey: COMPETITOR_CATALOG_SOURCE_ALERT_DEDUPE_KEY,
    sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
    attemptId: input.attemptId,
    code: input.code,
    title: '쿠팡 경쟁 판매자 수집 실패',
    message: input.message,
    href: '/sourcing-ai/competitor-analysis',
  };
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
    throw new Error('COMPETITOR_CATALOG_ATTEMPT_PLAN_MALFORMED');
  }
  const row = value as Record<string, unknown>;
  const input = parseInput(row.input);
  const targets = Array.isArray(row.targets)
    ? row.targets.flatMap(parseTarget)
    : [];
  if (!input || targets.length > MAX_TARGETS) {
    throw new Error('COMPETITOR_CATALOG_ATTEMPT_PLAN_MALFORMED');
  }
  if (input.target === 'seller_id' && (
    targets.length !== 1 || targets[0]?.sellerId !== input.sellerId
  )) {
    throw new Error('COMPETITOR_CATALOG_ATTEMPT_PLAN_MALFORMED');
  }
  return { input, targets };
}

function publicPlan(
  attempt: SourceAttempt,
  plan: StoredAttemptPlan,
  state = effectiveState(attempt, new Date()),
): CompetitorCatalogAttemptPlan {
  return {
    attemptId: attempt.id,
    attemptToken: attempt.attemptToken,
    state,
    expiresAt: attempt.expiresAt?.toISOString() ?? attempt.createdAt.toISOString(),
    input: plan.input,
    targets: plan.targets,
  };
}

function validateSubmission(
  catalogs: readonly AdvertisingCompetitorCatalogItem[],
  plan: StoredAttemptPlan,
): readonly AdvertisingCompetitorCatalogItem[] {
  if (catalogs.length > MAX_TARGETS) {
    throw new UnprocessableEntityException('COMPETITOR_CATALOG_SNAPSHOT_LIMIT');
  }
  const planned = new Map(plan.targets.map((target) => [target.sellerId, target]));
  const seen = new Set<string>();
  const productLimit = plan.input.target === 'rank_enrichment' ? 500 : 100;
  for (const catalog of catalogs) {
    if (
      catalog.products.length > productLimit
      || catalog.collectedProductCount > productLimit
      || catalog.products.some((product) => product.sourceRank > productLimit)
    ) {
      throw new UnprocessableEntityException('COMPETITOR_CATALOG_PRODUCT_LIMIT');
    }
    const target = planned.get(catalog.sellerId);
    if (!target || seen.has(catalog.sellerId)) {
      throw new UnprocessableEntityException('COMPETITOR_CATALOG_TARGET_NOT_PLANNED');
    }
    if (
      catalog.sellerStoreUrl !== target.sellerStoreUrl
      || normalizeKeyword(catalog.keyword) !== normalizeKeyword(target.keyword)
    ) {
      throw new UnprocessableEntityException('COMPETITOR_CATALOG_TARGET_MISMATCH');
    }
    seen.add(catalog.sellerId);
  }
  if (seen.size !== planned.size) {
    throw new UnprocessableEntityException('COMPETITOR_CATALOG_SNAPSHOT_INCOMPLETE');
  }
  return catalogs;
}

function latestCapturedAt(catalogs: readonly AdvertisingCompetitorCatalogItem[]): Date {
  return catalogs
    .map((catalog) => new Date(catalog.capturedAt))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())
    .at(-1) ?? new Date();
}

function sourceView(
  latest: SourceAttempt | null,
  complete: SourceAttempt | null,
  now: Date,
): CompetitorCatalogSourceView {
  const quality = complete ? readQualityReport(complete.qualityReport) : null;
  const coveredThrough = complete?.coverageEndDate ? businessDateKey(complete.coverageEndDate) : null;
  const latestComplete = complete && quality && coveredThrough
    ? {
      sourceImportRunId: complete.id,
      coveredThrough,
      capturedAt: (complete.importedAt ?? complete.updatedAt).toISOString(),
      expectedTargetCount: quality.expectedTargetCount,
      capturedTargetCount: quality.capturedTargetCount,
      ignoredTargetCount: quality.ignoredTargetCount,
    }
    : null;
  const latestState = latest ? effectiveState(latest, now) : null;
  const requiredCutoff = businessDateKey(evidenceCutoffDate(now));
  const ready = deriveSourceReadiness({
    latestAttempt: latest ? { state: latestState! } : null,
    latestComplete: latestComplete
      ? { actualCutoff: latestComplete.coveredThrough }
      : null,
    requiredCutoff,
  }).ready;
  return {
    ready,
    latestAttempt: latest ? {
      attemptId: latest.id,
      state: latestState!,
      startedAt: latest.createdAt.toISOString(),
      capturedAt: latest.importedAt?.toISOString() ?? null,
      expiresAt: latest.expiresAt?.toISOString() ?? latest.createdAt.toISOString(),
      errorCode: latestState === 'FAILED' && dbState(latest.status) === DB_RUNNING
        ? 'ATTEMPT_EXPIRED'
        : latest.errorCode,
      errorMessage: latestState === 'FAILED' && dbState(latest.status) === DB_RUNNING
        ? operatorErrorText({ code: 'ATTEMPT_EXPIRED' })
        : latest.errorMessage?.slice(0, 300) ?? null,
    } : null,
    latestComplete,
  };
}

function qualityReport(
  plan: StoredAttemptPlan,
  values: {
    capturedTargetCount: number;
    ignoredTargetCount: number;
    completeSnapshot: boolean;
  },
) {
  return {
    sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
    parserVersion: COMPETITOR_CATALOG_SOURCE_PARSER_VERSION,
    target: plan.input.target,
    expectedTargetCount: plan.targets.length,
    capturedTargetCount: values.capturedTargetCount,
    ignoredTargetCount: values.ignoredTargetCount,
    completeSnapshot: values.completeSnapshot,
  };
}

function serializeAttemptPlan(plan: StoredAttemptPlan): Prisma.InputJsonObject {
  return {
    input: { ...plan.input },
    targets: plan.targets.map((target) => ({
      sellerId: target.sellerId,
      sellerName: target.sellerName,
      sellerStoreUrl: target.sellerStoreUrl,
      keyword: target.keyword,
    })),
  };
}

function readQualityReport(value: Prisma.JsonValue | null): {
  expectedTargetCount: number;
  capturedTargetCount: number;
  ignoredTargetCount: number;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const fields = [
    row.expectedTargetCount,
    row.capturedTargetCount,
    row.ignoredTargetCount,
  ];
  if (!fields.every((field) => Number.isSafeInteger(field) && (field as number) >= 0)) {
    return null;
  }
  return {
    expectedTargetCount: fields[0] as number,
    capturedTargetCount: fields[1] as number,
    ignoredTargetCount: fields[2] as number,
  };
}

function normalizeInput(input: CompetitorCatalogAttemptInput): CompetitorCatalogAttemptInput {
  const parsed = parseInput(input);
  if (!parsed) throw new UnprocessableEntityException('COMPETITOR_CATALOG_SCOPE_INVALID');
  return parsed;
}

function parseInput(value: unknown): CompetitorCatalogAttemptInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.target === 'all') return { target: 'all' };
  if (row.target === 'rank_enrichment') {
    if (row.excludeCompletedAttemptId === undefined) return { target: 'rank_enrichment' };
    const reference = z.string().uuid().safeParse(row.excludeCompletedAttemptId);
    return reference.success ? { target: 'rank_enrichment', excludeCompletedAttemptId: reference.data } : null;
  }
  if (row.target !== 'seller_id') return null;
  const sellerId = cleanText(row.sellerId);
  if (!sellerId || sellerId.length > 80 || !/^[A-Za-z0-9_-]+$/u.test(sellerId)) return null;
  return { target: 'seller_id', sellerId };
}

function normalizeTargets(values: readonly CompetitorCatalogTargetPlan[]): CompetitorCatalogTargetPlan[] {
  if (!Array.isArray(values) || values.length > MAX_TARGETS) {
    throw new UnprocessableEntityException('COMPETITOR_CATALOG_TARGET_LIMIT');
  }
  const targets = values.flatMap(parseTarget);
  if (targets.length !== values.length || new Set(targets.map((target) => target.sellerId)).size !== targets.length) {
    throw new UnprocessableEntityException('COMPETITOR_CATALOG_TARGET_INVALID');
  }
  return targets;
}

function parseTarget(value: unknown): CompetitorCatalogTargetPlan[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  const sellerId = cleanText(row.sellerId);
  const sellerName = cleanText(row.sellerName);
  const sellerStoreUrl = cleanText(row.sellerStoreUrl);
  const keyword = cleanText(row.keyword);
  if (!sellerId || !sellerName || !sellerStoreUrl || !keyword) return [];
  if (!/^[A-Za-z0-9_-]+$/u.test(sellerId) || sellerId.length > 80) return [];
  if (sellerName.length > 300 || sellerStoreUrl.length > 2_000 || keyword.length > 100) return [];
  try {
    const url = new URL(sellerStoreUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'shop.coupang.com') return [];
  } catch {
    return [];
  }
  return [{ sellerId, sellerName, sellerStoreUrl, keyword }];
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/gu, ' ').normalize('NFC');
  return normalized.length > 0 ? normalized : null;
}

function sameInput(left: CompetitorCatalogAttemptInput, right: CompetitorCatalogAttemptInput): boolean {
  if (left.target === 'all') return right.target === 'all';
  if (left.target === 'rank_enrichment') return right.target === 'rank_enrichment'
    && left.excludeCompletedAttemptId === right.excludeCompletedAttemptId;
  return right.target === 'seller_id' && left.sellerId === right.sellerId;
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').normalize('NFC').toLocaleLowerCase('en-US');
}

function hashAttemptRequest(input: CompetitorCatalogAttemptInput): string {
  return hashJson({
    sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
    parserVersion: COMPETITOR_CATALOG_SOURCE_PARSER_VERSION,
    input,
  });
}

function hashSubmission(
  catalogs: readonly AdvertisingCompetitorCatalogItem[],
  plan: StoredAttemptPlan,
): string {
  return hashJson({
    sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
    parserVersion: COMPETITOR_CATALOG_SOURCE_PARSER_VERSION,
    plan,
    catalogs: [...catalogs].sort((left, right) => left.sellerId.localeCompare(right.sellerId)),
  });
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function findAttemptByIdempotency(
  tx: Transaction,
  organizationId: string,
  idempotencyKey: string,
): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: { organizationId, sourceType: COMPETITOR_CATALOG_SOURCE_TYPE, idempotencyKey },
  });
}

async function findAttemptOrNull(
  tx: Transaction,
  organizationId: string,
  attemptId: string,
): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: { id: attemptId, organizationId, sourceType: COMPETITOR_CATALOG_SOURCE_TYPE },
  });
}

async function findAttempt(
  tx: Transaction,
  organizationId: string,
  attemptId: string,
): Promise<SourceAttempt> {
  const attempt = await findAttemptOrNull(tx, organizationId, attemptId);
  if (!attempt) throw new NotFoundException('COMPETITOR_CATALOG_ATTEMPT_NOT_FOUND');
  return attempt;
}

function latestAttempt(tx: Transaction, organizationId: string): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: { organizationId, sourceType: COMPETITOR_CATALOG_SOURCE_TYPE },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

function latestCompleteAttempt(tx: Transaction, organizationId: string): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: {
      organizationId,
      sourceType: COMPETITOR_CATALOG_SOURCE_TYPE,
      status: DB_COMPLETE,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
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

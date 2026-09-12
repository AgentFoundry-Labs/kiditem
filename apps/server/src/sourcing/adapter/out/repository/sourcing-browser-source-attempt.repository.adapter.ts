import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { isAllowedSourcingCollectionSource } from '../../../domain/sourcing-collection-source-policy';
import { canonicalJson } from '../../../domain/sourcing-stable-json';
import {
  type BeginSourcingBrowserSourceAttemptInput,
  type CompleteSourcingBrowserSourceAttemptInput,
  type CompleteSourcingScrapeUrlAttemptInput,
  type FailSourcingBrowserSourceAttemptInput,
  type SourcingBrowserSourceAttempt,
  type SourcingBrowserSourceAttemptPlan,
  type SourcingBrowserSourceFailureAlert,
  type SourcingBrowserSourceAttemptRepositoryPort,
  type SourcingBrowserSourceStatus,
  type StageSourcingWingCatalogInput,
  type CompleteSourcingWingCatalogInput,
  type SourcingWingCatalogReceipt,
} from '../../../application/port/out/repository/sourcing-browser-source-attempt.repository.port';
import { persistBrowserSourceAttemptFacts } from './sourcing-browser-source-attempt.persistence';
import { upsertSourcedCandidateIn } from './sourcing-candidate-upsert.transaction';
import type { SourcingCollectionPermit } from '../../../application/port/out/repository/sourcing-collection.repository.port';

const MAX_ATTEMPT_TTL_MS = 30 * 60_000;
const ATTEMPT_EXPIRED_MESSAGE = 'Source collection expired before a complete snapshot was published.';

type Transaction = Prisma.TransactionClient;
type AttemptRow = Prisma.SourcingEvidenceIngestionRunGetPayload<{}>;

/**
 * Canonical owner persistence for retained Sourcing sources.
 *
 * The class owns the source-attempt transaction and concrete source Alert
 * mutation. It is intentionally Sourcing-specific rather than a reusable
 * runtime or generic attempt framework.
 */
@Injectable()
export class SourcingBrowserSourceAttemptRepositoryAdapter
  implements SourcingBrowserSourceAttemptRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async readScrapeUrlAttemptByKey(input: { organizationId: string; sourceKey: string; idempotencyKey: string; requestFingerprint: string }) {
    if (!['1688.scrape_url', 'alibaba.scrape_url'].includes(input.sourceKey)) throw new ConflictException('INVALID_SCRAPE_SOURCE');
    const row = await this.prisma.sourcingEvidenceIngestionRun.findUnique({ where: {
      organizationId_sourceKey_idempotencyKey: { organizationId: input.organizationId, sourceKey: input.sourceKey, idempotencyKey: input.idempotencyKey },
    } });
    if (row && row.requestHash !== input.requestFingerprint) throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
    return row ? toAttempt(row, new Date()) : null;
  }

  async readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SourcingBrowserSourceAttempt | null> {
    const row = await this.prisma.sourcingEvidenceIngestionRun.findFirst({
      where: { id: input.attemptId, organizationId: input.organizationId },
    });
    return row ? toAttempt(row, new Date()) : null;
  }

  async readSourceStatus(input: {
    organizationId: string;
    sourceKey: string;
    scopeKey: string;
    targetKey: string;
    currentPlanChecksum: string;
  }): Promise<SourcingBrowserSourceStatus> {
    const [latest, complete] = await this.prisma.$transaction(async (tx) => {
      const where = {
        organizationId: input.organizationId,
        sourceKey: input.sourceKey,
        scopeKey: input.scopeKey,
        targetKey: input.targetKey,
      };
      return Promise.all([
        tx.sourcingEvidenceIngestionRun.findFirst({ where, orderBy: { startedAt: 'desc' } }),
        tx.sourcingEvidenceIngestionRun.findFirst({
          where: { ...where, status: 'COMPLETE', isCurrentComplete: true },
        }),
      ]);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const now = new Date();
    const latestAttempt = latest ? toAttempt(latest, now) : null;
    const latestComplete = complete ? toAttempt(complete, now) : null;
    const completeMatchesCurrentPlan = complete?.planChecksum === input.currentPlanChecksum;
    return {
      ready: latestComplete !== null && completeMatchesCurrentPlan,
      latestAttempt,
      latestComplete,
      actualCutoffAt: complete?.sourceWindowEndAt ?? complete?.completedAt ?? null,
      errorCode: latestAttempt?.state === 'FAILED' ? latestAttempt.errorCode : null,
      errorMessage: latestAttempt?.state === 'FAILED' ? latestAttempt.errorMessage : null,
    };
  }

  async beginAttempt(
    input: BeginSourcingBrowserSourceAttemptInput,
  ): Promise<{ attempt: SourcingBrowserSourceAttempt; created: boolean }> {
    assertBeginInput(input);
    const result = await this.prisma.$transaction(async (tx) => {
      await lockScope(tx, input);
      const now = await databaseClock(tx);
      const replay = await tx.sourcingEvidenceIngestionRun.findUnique({
        where: {
          organizationId_sourceKey_idempotencyKey: {
            organizationId: input.organizationId,
            sourceKey: input.sourceKey,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== input.requestFingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        if (effectiveState(replay, now) === 'FAILED' && replay.status === 'RUNNING') {
          return { attempt: toAttempt(await expireAttempt(tx, replay, now, this.alerts), now), created: false };
        }
        return { attempt: toAttempt(replay, now), created: false };
      }

      // Shadow's paid paired capture consumes its KST-day admission even on failure.
      if (input.sourceKey === 'market_shadow_signals') {
        const admitted = await tx.sourcingEvidenceIngestionRun.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceKey: input.sourceKey,
            scopeKey: input.scopeKey,
            targetKey: input.targetKey,
          },
          orderBy: { generation: 'desc' },
        });
        if (admitted) {
          if (admitted.status === 'RUNNING' && effectiveState(admitted, now) === 'FAILED') {
            await expireAttempt(tx, admitted, now, this.alerts);
          }
          return { dailyLimitAttemptId: admitted.id };
        }
      }

      const running = await tx.sourcingEvidenceIngestionRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          status: 'RUNNING',
        },
        orderBy: { startedAt: 'desc' },
      });
      if (running) {
        if (effectiveState(running, now) === 'RUNNING') {
          throw new ConflictException({ code: 'SOURCE_ATTEMPT_IN_PROGRESS', attemptId: running.id });
        }
        await expireAttempt(tx, running, now, this.alerts);
      }

      await assertSourceEnabled(tx, input.organizationId, input.sourceKey);
      const previousGeneration = await tx.sourcingEvidenceIngestionRun.aggregate({
        where: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
        },
        _max: { generation: true },
      });
      const expiresAt = new Date(now.getTime() + input.expiresInMs);
      const created = await tx.sourcingEvidenceIngestionRun.create({
        data: {
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestFingerprint,
          collectorKey: input.collectorKey,
          collectorVersion: input.collectorVersion,
          triggerKind: input.triggerKind ?? 'extension',
          triggeredByUserId: input.requestedByUserId,
          status: 'RUNNING',
          leaseToken: randomUUID(),
          leaseExpiresAt: expiresAt,
          sourceControlCheckedAt: now,
          generation: (previousGeneration._max.generation ?? 0) + 1,
          attemptPlan: toInputJson(input.plan),
          planChecksum: input.planChecksum,
          isCurrentComplete: false,
          coverageNumerator: 0,
          qualityReport: toInputJson({
            source: input.sourceKey,
            planChecksum: input.planChecksum,
            completeSnapshot: false,
            // The alert identity this source declared, stored with the attempt
            // that will carry it. Complete and fail used to take it again from
            // the caller, so three call sites per source restated one fact and
            // nothing checked they agreed.
            failureAlert: input.failureAlert,
          }),
          startedAt: now,
        },
      });
      return { attempt: toAttempt(created, now), created: true };
    });
    // Throw after commit so expiration and its Alert are not rolled back by admission denial.
    if ('dailyLimitAttemptId' in result) {
      throw new ConflictException({ code: 'SHADOW_DAILY_LIMIT', attemptId: result.dailyLimitAttemptId });
    }
    return result;
  }

  async completeAttempt(
    input: CompleteSourcingBrowserSourceAttemptInput,
  ): Promise<SourcingBrowserSourceAttempt> {
    return this.prisma.$transaction((tx) => this.completeInTransaction(tx, input));
  }

  async stageWingCatalogBatch(input: StageSourcingWingCatalogInput): Promise<SourcingWingCatalogReceipt> {
    return this.prisma.$transaction(async (tx) => {
      const initial = await findAttempt(tx, input.organizationId, input.attemptId);
      await lockScope(tx, initial);
      const now = await databaseClock(tx);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertWingAttempt(attempt);
      assertToken(attempt, input.attemptToken);
      assertPlanChecksum(attempt, input.planChecksum);
      if (effectiveState(attempt, now) !== 'RUNNING') throw new ConflictException('SOURCE_ATTEMPT_TERMINAL');
      await assertSourceEnabled(tx, input.organizationId, attempt.sourceKey);
      const receipts = wingReceipts(attempt);
      const previous = receipts.find((receipt) => receipt.sequence === input.sequence);
      if (previous) {
        if (previous.checksum !== input.checksum || previous.keyword !== input.keyword
          || previous.count !== input.output.discoveredCount) throw new ConflictException('SOURCE_CHUNK_REPLAY_CONFLICT');
        return previous;
      }
      const plan = parsePlan(attempt.attemptPlan);
      const keywords = plan.keywords as string[];
      if (!Number.isInteger(input.sequence) || input.sequence < 0 || input.sequence >= keywords.length
        || keywords[input.sequence] !== input.keyword || input.output.discoveredCount > 100
        || input.output.rejectedCount !== 0) throw new ConflictException('SOURCE_PLAN_MISMATCH');
      if (receipts.some((receipt) => receipt.sequence > input.sequence)) {
        throw new ConflictException('SOURCE_CHUNK_OUT_OF_ORDER');
      }
      const persisted = await persistBrowserSourceAttemptFacts(tx, toPermit(attempt), input.output, now);
      const receipt = { sequence: input.sequence, keyword: input.keyword, checksum: input.checksum,
        count: input.output.discoveredCount, duplicateCount: persisted.duplicateCount };
      await tx.sourcingEvidenceIngestionRun.update({ where: { id: attempt.id }, data: {
        qualityReport: toInputJson({ ...qualityReport(attempt), wingReceipts: [...receipts, receipt] }),
      } });
      return receipt;
    });
  }

  async completeWingCatalogAttempt(input: CompleteSourcingWingCatalogInput): Promise<SourcingBrowserSourceAttempt> {
    const count = input.receipts.reduce((sum, receipt) => sum + receipt.count, 0);
    return this.prisma.$transaction((tx) => this.completeInTransaction(tx, {
      ...input,
      output: { observations: [], typedRecords: [], discoveredCount: count, rejectedCount: 0,
        qualityReport: { ...input.qualityReport, wingReceipts: input.receipts } },
    }, input.receipts));
  }

  completeScrapeUrlAttempt(input: CompleteSourcingScrapeUrlAttemptInput): Promise<SourcingBrowserSourceAttempt> {
    return this.prisma.$transaction((tx) => this.completeInTransaction(tx, input, undefined, input));
  }

  private async completeInTransaction(
    tx: Transaction,
    input: CompleteSourcingBrowserSourceAttemptInput,
    receipts?: SourcingWingCatalogReceipt[],
    scrape?: CompleteSourcingScrapeUrlAttemptInput,
  ): Promise<SourcingBrowserSourceAttempt> {
    const initialAttempt = await findAttempt(tx, input.organizationId, input.attemptId);
    await lockScope(tx, initialAttempt);
    const now = await databaseClock(tx);
    const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
    assertToken(attempt, input.attemptToken);
    assertPlanChecksum(attempt, input.planChecksum);
    if (scrape && (scrape.candidate.organizationId !== input.organizationId
      || scrape.candidate.sourceUrl !== parsePlan(attempt.attemptPlan).sourceUrl
      || !['1688.scrape_url', 'alibaba.scrape_url'].includes(attempt.sourceKey)
    )) {
      throw new ConflictException('SOURCE_SCRAPE_CANDIDATE_MISMATCH');
    }
    if (receipts) {
      assertWingAttempt(attempt);
      const actual = wingReceipts(attempt).sort((a, b) => a.sequence - b.sequence);
      const expectedCount = (parsePlan(attempt.attemptPlan).keywords as string[]).length;
      if (receipts.length !== expectedCount || actual.length !== expectedCount
        || receipts.some((receipt, index) => receipt.sequence !== index
          || canonicalJson(receipt) !== canonicalJson(actual[index]))) {
        throw new ConflictException('SOURCE_RECEIPTS_MISMATCH');
      }
    }
    const state = effectiveState(attempt, now);
    if (state === 'COMPLETE' || (attempt.status === 'FAILED' && attempt.contentChecksum !== null)) {
      if (attempt.contentChecksum !== input.contentChecksum) {
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      return toAttempt(attempt, now);
    }
    if (state === 'FAILED') {
      throw new ConflictException(
        attempt.status === 'RUNNING' ? 'SOURCE_ATTEMPT_EXPIRED' : 'SOURCE_ATTEMPT_TERMINAL',
      );
    }
    if (input.output.rejectedCount > 0) {
      const failed = await failAttempt(tx, attempt, now, {
        code: 'SOURCE_PLAN_INCOMPLETE',
        message: 'A source attempt cannot publish a partial frozen plan.',
      }, this.alerts);
      const recorded = await recordFailedOutput(tx, failed, input);
      return toAttempt(recorded, now);
    }
    const sourceFailureCode = await sourceAccessFailureCode(
      tx,
      input.organizationId,
      attempt.sourceKey,
    );
    if (sourceFailureCode) {
      const failed = await failAttempt(tx, attempt, now, {
        code: sourceFailureCode,
        message: 'The source is not enabled for this organization.',
      }, this.alerts);
      return toAttempt(await recordFailedOutput(tx, failed, input), now);
    }

    const persisted = await persistBrowserSourceAttemptFacts(
      tx,
      toPermit(attempt),
      input.output,
      now,
    );
    const acceptedCount = Math.max(
      0,
      input.output.discoveredCount - input.output.rejectedCount - persisted.staleDiscardedCount,
    );
    const candidate = scrape ? await upsertSourcedCandidateIn(tx, scrape.candidate) : null;
    const scrapeUrlResult = candidate ? { candidateId: candidate.id,
      href: `/product-pipeline/collected-products/${encodeURIComponent(candidate.id)}` } : undefined;
    await tx.sourcingEvidenceIngestionRun.updateMany({
      where: {
        organizationId: attempt.organizationId,
        sourceKey: attempt.sourceKey,
        scopeKey: attempt.scopeKey,
        targetKey: attempt.targetKey,
        isCurrentComplete: true,
      },
      data: { isCurrentComplete: false },
    });
    const completed = await tx.sourcingEvidenceIngestionRun.update({
      where: { id: attempt.id },
      data: {
        status: 'COMPLETE',
        completedAt: now,
        sourceWindowStartAt: input.sourceWindowStartAt ?? null,
        sourceWindowEndAt: input.sourceWindowEndAt ?? now,
        discoveredCount: input.output.discoveredCount,
        acceptedCount,
        rejectedCount: input.output.rejectedCount,
        duplicateCount: receipts ? receipts.reduce((sum, receipt) => sum + receipt.duplicateCount, 0) : persisted.duplicateCount,
        staleDiscardedCount: persisted.staleDiscardedCount,
        qualityReport: toInputJson({
          ...input.output.qualityReport,
          ...(scrapeUrlResult ? { scrapeUrlResult } : {}),
          source: attempt.sourceKey,
          planChecksum: input.planChecksum,
          completeSnapshot: true,
          // Carried forward, not rebuilt: this write replaces the report the
          // attempt was begun with, and the alert identity lives in it.
          failureAlert: storedFailureAlert(attempt),
        }),
        contentChecksum: input.contentChecksum,
        isCurrentComplete: true,
        errorCode: null,
        errorMessage: null,
      },
    });
    await this.alerts.resolveSourceFailure(tx, {
      organizationId: input.organizationId,
      dedupeKey: storedFailureAlert(attempt).dedupeKey,
      attemptId: input.attemptId,
    });
    return toAttempt(completed, now);
  }

  async failAttempt(
    input: FailSourcingBrowserSourceAttemptInput,
  ): Promise<SourcingBrowserSourceAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const initialAttempt = await findAttempt(tx, input.organizationId, input.attemptId);
      await lockScope(tx, initialAttempt);
      const now = await databaseClock(tx);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertToken(attempt, input.attemptToken);
      if (effectiveState(attempt, now) === 'COMPLETE') {
        throw new ConflictException('SOURCE_ATTEMPT_TERMINAL');
      }
      if (effectiveState(attempt, now) === 'FAILED' && attempt.status === 'RUNNING') {
        throw new ConflictException('SOURCE_ATTEMPT_EXPIRED');
      }
      if (attempt.status === 'FAILED') {
        if (attempt.errorCode !== input.code || attempt.errorMessage !== input.message) {
          throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
        }
        return toAttempt(attempt, now);
      }
      return toAttempt(await failAttempt(tx, attempt, now, input, this.alerts), now);
    });
  }
}

function qualityReport(attempt: AttemptRow): Record<string, unknown> {
  return (attempt.qualityReport ?? {}) as Record<string, unknown>;
}

function wingReceipts(attempt: AttemptRow): SourcingWingCatalogReceipt[] {
  return (qualityReport(attempt).wingReceipts ?? []) as SourcingWingCatalogReceipt[];
}

function assertWingAttempt(attempt: AttemptRow): void {
  if (attempt.sourceKey !== 'coupang.wing_catalog' || attempt.scopeKey !== 'default'
    || attempt.targetKey !== 'catalog' || !Array.isArray(parsePlan(attempt.attemptPlan).keywords)) {
    throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
  }
}

async function findAttempt(
  tx: Transaction,
  organizationId: string,
  attemptId: string,
): Promise<AttemptRow> {
  const attempt = await tx.sourcingEvidenceIngestionRun.findFirst({
    where: { id: attemptId, organizationId },
  });
  if (!attempt) throw new NotFoundException('SOURCE_ATTEMPT_NOT_FOUND');
  return attempt;
}

function effectiveState(
  attempt: Pick<AttemptRow, 'status' | 'leaseExpiresAt'>,
  now: Date,
): 'RUNNING' | 'COMPLETE' | 'FAILED' {
  if (attempt.status === 'COMPLETE') return 'COMPLETE';
  return attempt.status === 'RUNNING' && attempt.leaseExpiresAt > now ? 'RUNNING' : 'FAILED';
}

/**
 * The alert identity this attempt was begun with, read back from its own row.
 *
 * Three of these sources key the alert per collected target rather than per
 * source, so a registry keyed on the source alone could not rebuild it — and
 * merging them onto one key would be wrong anyway: `completeAttempt` resolves by
 * this key, so one target succeeding would close another target's unresolved
 * failure.
 */
export function storedFailureAlert(attempt: AttemptRow): SourcingBrowserSourceFailureAlert {
  const quality = attempt.qualityReport as Record<string, unknown> | null;
  const stored = quality?.failureAlert;
  if (
    !stored || typeof stored !== 'object'
    || typeof (stored as SourcingBrowserSourceFailureAlert).dedupeKey !== 'string'
  ) {
    throw new Error(`Attempt ${attempt.id} was begun without an alert identity.`);
  }
  return stored as SourcingBrowserSourceFailureAlert;
}

export function toAttempt(attempt: AttemptRow, now: Date): SourcingBrowserSourceAttempt {
  const state = effectiveState(attempt, now);
  const quality = attempt.qualityReport as Record<string, unknown> | null;
  const warnings = quality?.warnings;
  const isReadTimeExpiry = state === 'FAILED' && attempt.status === 'RUNNING';
  return {
    attemptId: attempt.id,
    attemptToken: attempt.leaseToken,
    sourceKey: attempt.sourceKey,
    scopeKey: attempt.scopeKey,
    targetKey: attempt.targetKey,
    generation: attempt.generation,
    state,
    expiresAt: attempt.leaseExpiresAt,
    plan: parsePlan(attempt.attemptPlan),
    planChecksum: attempt.planChecksum ?? '',
    contentChecksum: attempt.contentChecksum,
    acceptedCount: attempt.acceptedCount,
    ...(Array.isArray(warnings) && warnings.every((value) => typeof value === 'string') ? { warnings } : {}),
    errorCode: isReadTimeExpiry ? 'ATTEMPT_EXPIRED' : attempt.errorCode,
    errorMessage: isReadTimeExpiry ? ATTEMPT_EXPIRED_MESSAGE : attempt.errorMessage,
    completedAt: attempt.completedAt,
    ...(state === 'COMPLETE' && attempt.sourceKey.endsWith('.scrape_url') && quality?.scrapeUrlResult
      ? { scrapeUrlResult: quality.scrapeUrlResult as { candidateId: string; href: string } } : {}),
  };
}

function parsePlan(value: Prisma.JsonValue | null): SourcingBrowserSourceAttemptPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConflictException('SOURCE_PLAN_MALFORMED');
  }
  const plan = value as Record<string, Prisma.JsonValue>;
  if (typeof plan.source !== 'string' || !plan.source) {
    throw new ConflictException('SOURCE_PLAN_MALFORMED');
  }
  return { ...plan, source: plan.source };
}

function assertToken(attempt: AttemptRow, token: string): void {
  if (!token || attempt.leaseToken !== token) throw new ConflictException('ATTEMPT_FENCE_LOST');
}

function assertPlanChecksum(attempt: AttemptRow, checksum: string): void {
  if (!checksum || attempt.planChecksum !== checksum) {
    throw new ConflictException('SOURCE_PLAN_MISMATCH');
  }
}

/**
 * Expiring an attempt uses *that attempt's* alert identity, which is not always
 * the caller's. `beginAttempt` expires a previous run before admitting a new
 * one, and for the three sources that key their alert per collected target the
 * previous run was usually a different target — so the expiry was recorded and
 * resolved under the new request's key.
 */
async function expireAttempt(
  tx: Transaction,
  attempt: AttemptRow,
  now: Date,
  alerts: SourceFailureAlerts,
): Promise<AttemptRow> {
  return failAttempt(tx, attempt, now, {
    code: 'ATTEMPT_EXPIRED',
    message: ATTEMPT_EXPIRED_MESSAGE,
  }, alerts);
}

async function failAttempt(
  tx: Transaction,
  attempt: AttemptRow,
  now: Date,
  input: Pick<FailSourcingBrowserSourceAttemptInput, 'code' | 'message'>,
  alerts: SourceFailureAlerts,
): Promise<AttemptRow> {
  const failureAlert = storedFailureAlert(attempt);
  const updated = await tx.sourcingEvidenceIngestionRun.update({
    where: {
      id_organizationId: {
        id: attempt.id,
        organizationId: attempt.organizationId,
      },
    },
    data: {
      status: 'FAILED',
      completedAt: now,
      isCurrentComplete: false,
      errorCode: input.code,
      errorMessage: input.message,
    },
  });
  await alerts.recordTerminalOutcome(tx, {
    code: input.code,
    organizationId: attempt.organizationId,
    dedupeKey: failureAlert.dedupeKey,
    sourceType: failureAlert.sourceType,
    attemptId: attempt.id,
    title: failureAlert.title,
    message: input.message,
    href: failureAlert.href,
  });
  return updated;
}

function toPermit(attempt: AttemptRow): SourcingCollectionPermit {
  return {
    runId: attempt.id,
    organizationId: attempt.organizationId,
    sourceKey: attempt.sourceKey,
    scopeKey: attempt.scopeKey,
    targetKey: attempt.targetKey,
    leaseToken: attempt.leaseToken,
    generation: attempt.generation,
    leaseExpiresAt: attempt.leaseExpiresAt,
  };
}

async function assertSourceEnabled(
  tx: Transaction,
  organizationId: string,
  sourceKey: string,
): Promise<void> {
  const failureCode = await sourceAccessFailureCode(tx, organizationId, sourceKey);
  if (failureCode) throw new ConflictException(failureCode);
}

async function sourceAccessFailureCode(
  tx: Transaction,
  organizationId: string,
  sourceKey: string,
): Promise<'SOURCE_NOT_ALLOWED' | 'SOURCE_DISABLED' | null> {
  if (!isAllowedSourcingCollectionSource(sourceKey)) return 'SOURCE_NOT_ALLOWED';
  const control = await tx.sourcingCollectionSourceControl.findUnique({
    where: { organizationId_sourceKey: { organizationId, sourceKey } },
    select: { enabled: true },
  });
  return control?.enabled === false ? 'SOURCE_DISABLED' : null;
}

function assertBeginInput(input: BeginSourcingBrowserSourceAttemptInput): void {
  if (
    input.sourceKey === 'market_shadow_signals'
    && (input.scopeKey !== 'day' || !/^\d{4}-\d{2}-\d{2}$/.test(input.targetKey))
  ) {
    throw new TypeError('Shadow admission requires a KST-day scope.');
  }
  if (!input.idempotencyKey || !input.requestFingerprint || !input.planChecksum || !input.plan.source) {
    throw new TypeError('A source attempt needs request identity and a frozen source plan.');
  }
  if (!Number.isInteger(input.expiresInMs) || input.expiresInMs <= 0 || input.expiresInMs > MAX_ATTEMPT_TTL_MS) {
    throw new TypeError('A source attempt expiry must be bounded.');
  }
}

async function databaseClock(tx: Transaction): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`
    SELECT clock_timestamp() AS "now"
  `;
  return rows[0].now;
}

async function lockScope(
  tx: Transaction,
  input: Pick<BeginSourcingBrowserSourceAttemptInput, 'organizationId' | 'sourceKey' | 'scopeKey' | 'targetKey'>,
): Promise<void> {
  const key = `sourcing-source-attempt:${input.organizationId}:${input.sourceKey}:${input.scopeKey}:${input.targetKey}`;
  await tx.$queryRaw`
    -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"
  `;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  const serialized = toNestedInputJson(value);
  if (serialized === null) throw new TypeError('Source attempt JSON document cannot be null.');
  return serialized;
}

function toNestedInputJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => toNestedInputJson(item));
  if (value && typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value)) result[key] = toNestedInputJson(item);
    return result;
  }
  throw new TypeError('Source attempt JSON must be serializable.');
}

async function recordFailedOutput(tx: Transaction, failed: AttemptRow, input: CompleteSourcingBrowserSourceAttemptInput) {
  return tx.sourcingEvidenceIngestionRun.update({
    where: { id_organizationId: { id: failed.id, organizationId: input.organizationId } },
    data: { discoveredCount: input.output.discoveredCount, rejectedCount: input.output.rejectedCount,
      acceptedCount: 0, contentChecksum: input.contentChecksum,
      qualityReport: toInputJson({ ...input.output.qualityReport, source: failed.sourceKey,
        planChecksum: input.planChecksum, completeSnapshot: false,
        // Same reason as the complete path: this replaces the begin-time report.
        failureAlert: storedFailureAlert(failed) }) },
  });
}

import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SELLPIA_MANUAL_MATCH_PARSER_VERSION,
  SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN,
  SELLPIA_MANUAL_MATCH_SOURCE_PATH,
  SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
  MAX_SELLPIA_MANUAL_MATCH_TARGETS,
  SellpiaManualMatchPlanSchema,
  type SellpiaManualMatchAttempt,
  type SellpiaManualMatchPlan,
  type SellpiaManualMatchSnapshot,
  type SellpiaManualMatchSnapshotStatus,
  type SellpiaManualMatchPublicAttempt,
  type SellpiaManualMatchSourceStatus,
  type SellpiaManualMatchRow,
} from '@kiditem/shared/sellpia-manual-match';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import {
  OPERATOR_CANCEL_CODE,
  OPERATOR_CANCEL_MESSAGE,
} from '../../../../common/operator-cancel';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  completedCatalogRunWhere,
  publishedCatalogOptionWhere,
} from '../../../read/completed-catalog-run';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionContext,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import { normalizeSellpiaManualMatchAlias } from '../../../domain/sellpia-manual-match-alias';
import type {
  SellpiaManualMatchAliasRecord,
  SellpiaManualMatchAttemptInput,
  SellpiaManualMatchRepositoryPort,
} from '../../../application/port/out/repository/sellpia-manual-match.repository.port';

const CREATE_BATCH_SIZE = 5_000;
const ATTEMPT_TTL_MS = 30 * 60_000;
const DB_RUNNING = SOURCE_IMPORT_RUN_RUNNING_STATUS;
const DB_COMPLETE = SOURCE_IMPORT_RUN_COMPLETED_STATUS;
const DB_FAILED = SOURCE_IMPORT_RUN_FAILED_STATUS;
const ALERT_DEDUPE_KEY = 'source:sellpia-manual-match';
const ALERT_HREF = '/product-hub/matching';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type Transaction = Prisma.TransactionClient;
type SourceAttempt = Prisma.SourceImportRunGetPayload<{}>;
type ActiveSku = { id: string; code: string };
type ChannelListingClient = Pick<Prisma.TransactionClient, 'channelListing'>;

@Injectable()
export class SellpiaManualMatchRepositoryAdapter
implements SellpiaManualMatchRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly productTransactionalRead: ProductTransactionalReadPort,
  ) {}

  async getCurrentStatus(
    organizationId: string,
  ): Promise<SellpiaManualMatchSnapshotStatus | null> {
    const snapshot = await this.prisma.sellpiaManualMatchSnapshot.findUnique({
      where: { organizationId },
      select: {
        targetCount: true,
        matchedTargetCount: true,
        aliasCount: true,
        snapshotHash: true,
        capturedAt: true,
      },
    });
    return snapshot ? toStatus(snapshot) : null;
  }

  async findByNormalizedAliases(
    organizationId: string,
    normalizedAliases: string[],
  ): Promise<SellpiaManualMatchAliasRecord[]> {
    if (normalizedAliases.length === 0) return [];
    const rows = await this.prisma.sellpiaManualMatchAlias.findMany({
      where: {
        organizationId,
        normalizedAlias: { in: normalizedAliases },
      },
      select: {
        masterProductId: true,
        aliasTitle: true,
        normalizedAlias: true,
        itemCount: true,
        matchedType: true,
        evidenceCount: true,
      },
      orderBy: [
        { normalizedAlias: 'asc' },
        { masterProductId: 'asc' },
        { itemCount: 'asc' },
      ],
    });
    return rows.map((row) => ({
      ...row,
      masterProductId: row.masterProductId,
      matchedType: checkedMatchedType(row.matchedType),
    }));
  }

  async beginAttempt(input: SellpiaManualMatchAttemptInput): Promise<SellpiaManualMatchAttempt> {
    const requestFingerprint = hashJson({
      sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
      parserVersion: SELLPIA_MANUAL_MATCH_PARSER_VERSION,
      sourceOrigin: SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN,
      sourcePath: SELLPIA_MANUAL_MATCH_SOURCE_PATH,
      requestBody: {},
    });
    return this.prisma.$transaction(async (tx) => {
      const productContext = { client: tx };
      const productLock = await this.productTransactionalRead.lock(
        productContext,
        input.organizationId,
      );
      await lockManualMatchSource(tx, input.organizationId);
      const now = new Date();
      const existing = await findAttemptByIdempotency(
        tx,
        input.organizationId,
        input.idempotencyKey,
      );
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        if (effectiveState(existing, now) === 'FAILED' && existing.status === DB_RUNNING) {
          const expired = await this.expireAttempt(tx, existing);
          return controlAttempt(expired);
        }
        return controlAttempt(existing);
      }

      const active = await listActiveSkus(
        this.productTransactionalRead,
        productContext,
        productLock,
        input.organizationId,
      );
      const targetCodes = normalizeTargetCodes(active.map((sku) => sku.code));
      const running = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
          status: DB_RUNNING,
        },
      });
      if (running) {
        if (effectiveState(running, now) !== 'FAILED') {
          throw new ConflictException({ code: 'ATTEMPT_IN_PROGRESS', attemptId: running.id });
        }
        await this.expireAttempt(tx, running);
      }

      const plan: SellpiaManualMatchPlan = {
        sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
        parserVersion: SELLPIA_MANUAL_MATCH_PARSER_VERSION,
        sourceOrigin: SELLPIA_MANUAL_MATCH_SOURCE_ORIGIN,
        sourcePath: SELLPIA_MANUAL_MATCH_SOURCE_PATH,
        targetCount: targetCodes.length,
        targetCodes,
      };
      const run = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
          status: DB_RUNNING,
          rowCount: 0,
          attemptToken: randomUUID(),
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          expiresAt: new Date(now.getTime() + ATTEMPT_TTL_MS),
          plan: plan as unknown as Prisma.InputJsonValue,
          parserVersion: SELLPIA_MANUAL_MATCH_PARSER_VERSION,
        },
      });
      return controlAttempt(run);
    }, TRANSACTION_OPTIONS);
  }

  async readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaManualMatchAttempt> {
    const attempt = await this.prisma.sourceImportRun.findFirst({
      where: {
        id: input.attemptId,
        organizationId: input.organizationId,
        sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
      },
    });
    if (!attempt) throw new NotFoundException('SELLPIA_MANUAL_MATCH_ATTEMPT_NOT_FOUND');
    return controlAttempt(attempt);
  }

  async readCurrent(input: {
    organizationId: string;
  }): Promise<SellpiaManualMatchSourceStatus> {
    return this.prisma.$transaction(async (tx) => {
      const [latestAttempt, currentSnapshot] = await Promise.all([
        tx.sourceImportRun.findFirst({
          where: {
            organizationId: input.organizationId,
            sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        currentStatusIn(tx, input.organizationId),
      ]);
      return {
        latestAttempt: latestAttempt ? publicAttempt(latestAttempt) : null,
        currentSnapshot,
      } satisfies SellpiaManualMatchSourceStatus;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async completeAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    snapshot: SellpiaManualMatchSnapshot;
  }): Promise<SellpiaManualMatchAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const productContext = { client: tx };
      const productLock = await this.productTransactionalRead.lock(
        productContext,
        input.organizationId,
      );
      await lockManualMatchSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertAttemptToken(attempt, input.attemptToken);
      const plan = parseAttemptPlan(attempt.plan);
      const payloadHash = hashJson({
        sourceType: plan.sourceType,
        parserVersion: plan.parserVersion,
        plan,
        snapshot: input.snapshot,
      });
      const state = effectiveState(attempt, new Date());
      if (state === 'COMPLETE') {
        if (attempt.contentChecksum !== payloadHash) {
          throw new ConflictException('SELLPIA_MANUAL_MATCH_REPLAY_CONFLICT');
        }
        return controlAttempt(attempt);
      }
      if (state === 'FAILED') throw new ConflictException(
        attempt.status === DB_RUNNING ? 'ATTEMPT_EXPIRED' : 'ATTEMPT_TERMINAL',
      );

      assertSnapshotMatchesPlan(input.snapshot, plan);
      const active = await listActiveSkus(
        this.productTransactionalRead,
        productContext,
        productLock,
        input.organizationId,
      );
      assertTargetCodesUnchanged(active, plan.targetCodes);
      const activeByCode = new Map(active.map((sku) => [sku.code, sku]));
      const currentChannelAliases = await listCurrentChannelAliasCandidates(
        tx,
        input.organizationId,
      );
      const normalizedChannelAliases = [...new Set(currentChannelAliases
        .map(normalizeSellpiaManualMatchAlias)
        .filter(Boolean))].sort();
      const rows = aggregateRows(
        input.snapshot.rows,
        activeByCode,
        new Set(normalizedChannelAliases),
      );
      const capturedAt = new Date();
      const status = {
        targetCount: input.snapshot.targetCount,
        matchedTargetCount: new Set(rows.map((row) => row.masterProductId)).size,
        aliasCount: rows.length,
        snapshotHash: hashJson({
          snapshot: input.snapshot,
          normalizedChannelAliases,
        }),
        capturedAt: capturedAt.toISOString(),
      } satisfies SellpiaManualMatchSnapshotStatus;
      await replaceCurrentIn(tx, {
        organizationId: input.organizationId,
        status,
        rows,
      });
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
          status: DB_RUNNING,
          attemptToken: input.attemptToken,
        },
        data: {
          status: DB_COMPLETE,
          importedAt: capturedAt,
          lastVerifiedAt: capturedAt,
          verificationCount: { increment: 1 },
          contentChecksum: payloadHash,
          contentByteCount: Buffer.byteLength(JSON.stringify(input.snapshot)),
          rowCount: input.snapshot.rowCount,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: ALERT_DEDUPE_KEY,
        attemptId: input.attemptId,
      });
      const completed = await findAttempt(tx, input.organizationId, input.attemptId);
      return controlAttempt(completed);
    }, TRANSACTION_OPTIONS);
  }

  async failAttempt(input: {
    organizationId: string;
    attemptId: string;
    attemptToken: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<SellpiaManualMatchAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.productTransactionalRead.lock({ client: tx }, input.organizationId);
      await lockManualMatchSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      assertAttemptToken(attempt, input.attemptToken);
      if (attempt.status === DB_COMPLETE) throw new ConflictException('ATTEMPT_TERMINAL');
      if (attempt.status === DB_FAILED) {
        if (
          attempt.errorCode !== input.errorCode
          || attempt.errorMessage !== input.errorMessage
        ) throw new ConflictException('ATTEMPT_TERMINAL');
        return controlAttempt(attempt);
      }
      if (effectiveState(attempt, new Date()) === 'FAILED') {
        throw new ConflictException('ATTEMPT_EXPIRED');
      }
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
          status: DB_RUNNING,
          attemptToken: input.attemptToken,
        },
        data: {
          status: DB_FAILED,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.recordTerminalOutcome(tx, failureAlert({
        organizationId: input.organizationId,
        attemptId: input.attemptId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      }));
      return controlAttempt(await findAttempt(tx, input.organizationId, input.attemptId));
    }, TRANSACTION_OPTIONS);
  }

  /**
   * Operator stop without the attempt token. It fails through the same terminal
   * path as an extension-reported failure, so `USER_CANCELLED` is suppressed by
   * the alert rule; a terminal attempt is returned as is.
   */
  async cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaManualMatchPublicAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await this.productTransactionalRead.lock({ client: tx }, input.organizationId);
      await lockManualMatchSource(tx, input.organizationId);
      const attempt = await findAttempt(tx, input.organizationId, input.attemptId);
      if (attempt.status !== DB_RUNNING) return publicAttempt(attempt);
      if (effectiveState(attempt, new Date()) === 'FAILED') {
        return publicAttempt(await this.expireAttempt(tx, attempt));
      }
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: input.attemptId,
          organizationId: input.organizationId,
          sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
          status: DB_RUNNING,
        },
        data: {
          status: DB_FAILED,
          errorCode: OPERATOR_CANCEL_CODE,
          errorMessage: OPERATOR_CANCEL_MESSAGE,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
      await this.alerts.recordTerminalOutcome(tx, failureAlert({
        organizationId: input.organizationId,
        attemptId: input.attemptId,
        errorCode: OPERATOR_CANCEL_CODE,
        errorMessage: OPERATOR_CANCEL_MESSAGE,
      }));
      return publicAttempt(await findAttempt(tx, input.organizationId, input.attemptId));
    }, TRANSACTION_OPTIONS);
  }

  private async expireAttempt(tx: Transaction, attempt: SourceAttempt): Promise<SourceAttempt> {
    const updated = await tx.sourceImportRun.updateMany({
      where: {
        id: attempt.id,
        organizationId: attempt.organizationId,
        sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
        status: DB_RUNNING,
      },
      data: {
        status: DB_FAILED,
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: 'Sellpia manual-match collection expired before publication.',
      },
    });
    if (updated.count !== 1) throw new ConflictException('ATTEMPT_TERMINAL');
    await this.alerts.recordTerminalOutcome(tx, failureAlert({
      organizationId: attempt.organizationId,
      attemptId: attempt.id,
      errorCode: 'ATTEMPT_EXPIRED',
      errorMessage: 'Sellpia manual-match collection expired before publication.',
    }));
    return findAttempt(tx, attempt.organizationId, attempt.id);
  }
}

async function replaceCurrentIn(
  tx: Transaction,
  input: {
    organizationId: string;
    status: SellpiaManualMatchSnapshotStatus;
    rows: SellpiaManualMatchAliasRecord[];
  },
): Promise<void> {
  await tx.sellpiaManualMatchSnapshot.deleteMany({
    where: { organizationId: input.organizationId },
  });
  const snapshot = await tx.sellpiaManualMatchSnapshot.create({
    data: {
      organizationId: input.organizationId,
      targetCount: input.status.targetCount,
      matchedTargetCount: input.status.matchedTargetCount,
      aliasCount: input.status.aliasCount,
      snapshotHash: input.status.snapshotHash,
      capturedAt: new Date(input.status.capturedAt),
    },
    select: { id: true },
  });
  for (let offset = 0; offset < input.rows.length; offset += CREATE_BATCH_SIZE) {
    const batch = input.rows.slice(offset, offset + CREATE_BATCH_SIZE);
    await tx.sellpiaManualMatchAlias.createMany({
      data: batch.map((row) => ({
        organizationId: input.organizationId,
        snapshotId: snapshot.id,
        masterProductId: row.masterProductId,
        aliasTitle: row.aliasTitle,
        normalizedAlias: row.normalizedAlias,
        itemCount: row.itemCount,
        matchedType: row.matchedType,
        evidenceCount: row.evidenceCount,
      })),
    });
  }
}

async function listCurrentChannelAliasCandidates(
  client: ChannelListingClient,
  organizationId: string,
): Promise<string[]> {
  const listings = await client.channelListing.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [
        { lastImportRun: { is: completedCatalogRunWhere(organizationId) } },
        {
          options: {
            some: publishedCatalogOptionWhere(organizationId),
          },
        },
      ],
    },
    select: {
      displayName: true,
      channelName: true,
      options: {
        where: { organizationId, isActive: true },
        select: { itemName: true },
      },
    },
    orderBy: { id: 'asc' },
  });
  const candidates = new Set<string>();
  for (const listing of listings) {
    const listingNames = [...new Set([listing.channelName, listing.displayName]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean))];
    for (const listingName of listingNames) candidates.add(listingName);
    for (const option of listing.options) {
      const itemName = option.itemName?.trim() || null;
      if (itemName) {
        if (listingNames.length === 0) {
          candidates.add(itemName);
        } else {
          for (const listingName of listingNames) {
            candidates.add(`${listingName}:${itemName}`);
          }
        }
      }
    }
  }
  return [...candidates].sort();
}

async function listActiveSkus(
  products: ProductTransactionalReadPort,
  context: ProductTransactionContext<Transaction>,
  lock: Parameters<ProductTransactionalReadPort['readActiveMatchingCandidates']>[1],
  organizationId: string,
): Promise<ActiveSku[]> {
  const identities = await products.readActiveMatchingCandidates(context, lock, organizationId);
  return identities.map(({ masterProductId, code }) => ({
    id: masterProductId,
    code,
  }));
}

async function currentStatusIn(
  tx: Transaction,
  organizationId: string,
): Promise<SellpiaManualMatchSnapshotStatus | null> {
  const snapshot = await tx.sellpiaManualMatchSnapshot.findUnique({
    where: { organizationId },
    select: {
      targetCount: true,
      matchedTargetCount: true,
      aliasCount: true,
      snapshotHash: true,
      capturedAt: true,
    },
  });
  return snapshot ? toStatus(snapshot) : null;
}

async function findAttemptByIdempotency(
  tx: Transaction,
  organizationId: string,
  idempotencyKey: string,
): Promise<SourceAttempt | null> {
  return tx.sourceImportRun.findFirst({
    where: {
      organizationId,
      sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
      idempotencyKey,
    },
  });
}

async function findAttempt(
  tx: Transaction,
  organizationId: string,
  attemptId: string,
): Promise<SourceAttempt> {
  const attempt = await tx.sourceImportRun.findFirst({
    where: {
      id: attemptId,
      organizationId,
      sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
    },
  });
  if (!attempt) throw new NotFoundException('SELLPIA_MANUAL_MATCH_ATTEMPT_NOT_FOUND');
  return attempt;
}

async function lockManualMatchSource(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  organizationId: string,
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    -- queryraw-tenancy-exempt: organization-scoped manual-match owner lock.
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`channels.sellpia-manual-match:${organizationId}`}, 0)
    )::text AS "lock"
  `);
}

function normalizeTargetCodes(values: readonly string[]): string[] {
  const targetCodes = [...new Set(values)].sort();
  if (
    targetCodes.length > MAX_SELLPIA_MANUAL_MATCH_TARGETS
    || targetCodes.some((code) => !/^\d+(?:-\d+)*$/u.test(code))
  ) {
    throw new ConflictException('SELLPIA_MANUAL_MATCH_TARGET_PLAN_INVALID');
  }
  return targetCodes;
}

function assertTargetCodesUnchanged(
  active: readonly ActiveSku[],
  targetCodes: readonly string[],
): void {
  const current = normalizeTargetCodes(active.map((sku) => sku.code));
  if (current.length !== targetCodes.length || current.some((code, index) => code !== targetCodes[index])) {
    throw new ConflictException(
      'Active Sellpia inventory changed during manual-match collection; collect again',
    );
  }
}

function assertSnapshotMatchesPlan(
  snapshot: SellpiaManualMatchSnapshot,
  plan: SellpiaManualMatchPlan,
): void {
  if (
    snapshot.source !== SELLPIA_MANUAL_MATCH_SOURCE_TYPE
    || snapshot.targetCount !== plan.targetCount
    || snapshot.targetCodes.length !== plan.targetCodes.length
    || snapshot.targetCodes.some((code, index) => code !== plan.targetCodes[index])
  ) {
    throw new ConflictException('SELLPIA_MANUAL_MATCH_TARGET_PLAN_CONFLICT');
  }
}

function aggregateRows(
  rows: readonly SellpiaManualMatchRow[],
  activeByCode: Map<string, ActiveSku>,
  currentChannelAliases: Set<string>,
): SellpiaManualMatchAliasRecord[] {
  const aggregated = new Map<string, SellpiaManualMatchAliasRecord>();
  for (const row of rows) {
    const sku = activeByCode.get(row.productCode);
    if (!sku) {
      throw new ConflictException(
        `Sellpia manual-match row references inactive code ${row.productCode}`,
      );
    }
    const normalizedAlias = normalizeSellpiaManualMatchAlias(row.aliasTitle);
    if (!normalizedAlias || !currentChannelAliases.has(normalizedAlias)) continue;
    const key = [normalizedAlias, sku.id, row.itemCount].join('\u0000');
    const previous = aggregated.get(key);
    aggregated.set(key, previous ? {
      ...previous,
      aliasTitle: previous.aliasTitle.localeCompare(row.aliasTitle, 'ko') <= 0
        ? previous.aliasTitle
        : row.aliasTitle,
      matchedType: strongerMatchedType(previous.matchedType, row.matchedType),
      evidenceCount: Math.min(
        2_147_483_647,
        previous.evidenceCount + row.evidenceCount,
      ),
    } : {
      masterProductId: sku.id,
      aliasTitle: row.aliasTitle,
      normalizedAlias,
      itemCount: row.itemCount,
      matchedType: row.matchedType,
      evidenceCount: row.evidenceCount,
    });
  }
  return [...aggregated.values()].sort((left, right) =>
    left.normalizedAlias.localeCompare(right.normalizedAlias)
      || left.masterProductId.localeCompare(right.masterProductId)
      || left.itemCount - right.itemCount);
}

function strongerMatchedType(
  left: 'M' | 'P' | 'E',
  right: 'M' | 'P' | 'E',
): 'M' | 'P' | 'E' {
  const priority = { M: 3, P: 2, E: 1 } as const;
  return priority[left] >= priority[right] ? left : right;
}

function parseAttemptPlan(value: Prisma.JsonValue | null): SellpiaManualMatchPlan {
  return SellpiaManualMatchPlanSchema.parse(value);
}

/**
 * 상태 읽기가 내보내는 시도. 쿠팡 쉽먼트 요약 리더와 같은 자리에서 fence 토큰을
 * 벗긴다 — 토큰은 확장이 부르는 제어 읽기에만 나간다.
 */
function publicAttempt(attempt: SourceAttempt): SellpiaManualMatchPublicAttempt {
  const { attemptToken: _token, ...status } = controlAttempt(attempt);
  return status;
}

/** 확장이 부르는 제어 읽기용. 시도를 이어가려면 fence 토큰이 필요하다. */
function controlAttempt(attempt: SourceAttempt): SellpiaManualMatchAttempt {
  const plan = parseAttemptPlan(attempt.plan);
  return {
    attemptId: attempt.id,
    attemptToken: attempt.attemptToken,
    state: effectiveState(attempt, new Date()),
    expiresAt: attempt.expiresAt?.toISOString() ?? attempt.createdAt.toISOString(),
    plan,
    contentChecksum: attempt.contentChecksum,
    capturedAt: attempt.importedAt?.toISOString() ?? null,
    errorCode: attempt.status === DB_RUNNING && effectiveState(attempt, new Date()) === 'FAILED'
      ? 'ATTEMPT_EXPIRED'
      : attempt.errorCode,
    errorMessage: attempt.status === DB_RUNNING && effectiveState(attempt, new Date()) === 'FAILED'
      ? 'Sellpia manual-match collection expired before publication.'
      : attempt.errorMessage,
  };
}

function effectiveState(
  attempt: SourceAttempt,
  now: Date,
): 'RUNNING' | 'COMPLETE' | 'FAILED' {
  if (attempt.status === DB_COMPLETE) return 'COMPLETE';
  if (
    attempt.status === DB_RUNNING
    && attempt.expiresAt !== null
    && attempt.expiresAt.getTime() > now.getTime()
  ) return 'RUNNING';
  return 'FAILED';
}

function assertAttemptToken(attempt: SourceAttempt, attemptToken: string): void {
  if (attempt.attemptToken !== attemptToken) throw new ConflictException('ATTEMPT_FENCE_LOST');
}

function failureAlert(input: {
  organizationId: string;
  attemptId: string;
  errorCode: string;
  errorMessage: string;
}) {
  return {
    organizationId: input.organizationId,
    dedupeKey: ALERT_DEDUPE_KEY,
    sourceType: SELLPIA_MANUAL_MATCH_SOURCE_TYPE,
    attemptId: input.attemptId,
    code: input.errorCode,
    title: 'Sellpia 수동상품매칭 수집 실패',
    message: input.errorMessage,
    href: ALERT_HREF,
  };
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toStatus(value: {
  targetCount: number;
  matchedTargetCount: number;
  aliasCount: number;
  snapshotHash: string;
  capturedAt: Date;
}): SellpiaManualMatchSnapshotStatus {
  return { ...value, capturedAt: value.capturedAt.toISOString() };
}

function checkedMatchedType(value: string): 'M' | 'P' | 'E' {
  if (value === 'M' || value === 'P' || value === 'E') return value;
  throw new Error(`Unsupported Sellpia manual-match type: ${value}`);
}

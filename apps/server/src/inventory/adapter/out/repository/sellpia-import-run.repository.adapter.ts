import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SellpiaInventoryState, type SourceImportRun } from '@prisma/client';
import {
  SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES,
  SellpiaInventoryRefreshReasonSchema,
  type SellpiaInventoryRefreshReason,
  type SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import { lockSellpiaInventoryTransaction } from './sellpia-inventory-transaction-lock';
import { sellpiaInventorySourceFailureAlert } from './sellpia-inventory-source-failure-alert';
import type {
  ClaimedSellpiaManualExecution,
  SellpiaFileRunClaim,
  SellpiaImportRunRepositoryPort,
} from '../../../application/port/out/repository/sellpia-import-run.repository.port';
import type {
  SellpiaInventorySourceAttempt,
  SellpiaInventorySourcePlan,
} from '../../../application/port/in/stock/sellpia-inventory-import.port';

const SOURCE_TYPE = 'sellpia_inventory';
const SOURCE_ORIGIN = 'https://kiditem.sellpia.com';
const SOURCE_ACCOUNT_KEY = 'kiditem';
const OWNER_PARSER_VERSION = 'sellpia-inventory-v1';
const OWNER_ATTEMPT_TTL_MS = 5 * 60_000;
const CLAIM_LEASE_MS = 90_000;
const OWNER_REFRESH_REASONS = new Set<string>([
  'initial_snapshot',
  'ttl_expired',
  'same_hash_confirmation',
  'purchase_preflight',
  'manual_request',
  'retry',
]);
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type ClaimInput = Parameters<SellpiaImportRunRepositoryPort['claimFileRun']>[0];
type FailureInput = Parameters<SellpiaImportRunRepositoryPort['markRunFailed']>[0];
type BeginAttemptInput = Parameters<SellpiaImportRunRepositoryPort['beginAttempt']>[0];
type FailAttemptInput = Parameters<SellpiaImportRunRepositoryPort['failAttempt']>[0];

@Injectable()
export class SellpiaImportRunRepositoryAdapter
implements SellpiaImportRunRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: BeginAttemptInput): Promise<SellpiaInventorySourceAttempt> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new BadRequestException('INVALID_SELLPIA_INVENTORY_IDEMPOTENCY_KEY');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      let state = await lockedState(tx, input.organizationId);
      assertConfirmedBinding(state);
      const now = new Date();
      if (input.trigger && !OWNER_REFRESH_REASONS.has(input.trigger)) {
        throw new BadRequestException('INVALID_SELLPIA_INVENTORY_TRIGGER');
      }
      const trigger = input.trigger
        ?? (state.verifiedGeneration === 0n ? 'initial_snapshot' : 'manual_request');
      const normalizedTrigger = SellpiaInventoryRefreshReasonSchema.parse(trigger);
      const fingerprint = canonicalOwnerInputHash({
        scope: input.scope,
        trigger: normalizedTrigger,
      });

      let existing = await findOwnerAttempt(
        tx,
        input.organizationId,
        { idempotencyKey },
      );
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new ConflictException('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        if (existing.status === 'running' && isExpired(existing)) {
          existing = await failOwnerIn(
            tx,
            this.alerts,
            state,
            existing,
            'ATTEMPT_EXPIRED',
            'Sellpia inventory collection expired.',
          );
        }
        return ownerAttemptView(existing);
      }

      let running = await findOwnerAttempt(tx, input.organizationId, {
        status: 'running',
      });
      if (running) {
        if (!isExpired(running)) {
          throw new ConflictException({
            code: 'ATTEMPT_IN_PROGRESS',
            attemptId: running.id,
          });
        }
        await failOwnerIn(
          tx,
          this.alerts,
          state,
          running,
          'ATTEMPT_EXPIRED',
          'Sellpia inventory collection expired.',
        );
        state = await lockedState(tx, input.organizationId);
      } else if (
        state.activeSyncToken
        && state.activeSyncLeaseExpiresAt
        && state.activeSyncLeaseExpiresAt > now
      ) {
        // A legacy freshness claim still owns the state while the cutover is
        // being integrated. Do not overwrite it from the new owner path.
        throw new ConflictException({
          code: 'ATTEMPT_IN_PROGRESS',
          attemptId: state.activeSyncToken,
        });
      }

      const latest = await tx.sourceImportRun.aggregate({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
        },
        _max: { freshnessGeneration: true },
      });
      const generation = maxBigInt(
        state.requestedGeneration,
        (latest._max.freshnessGeneration ?? 0n) + 1n,
      );
      const expiresAt = new Date(now.getTime() + OWNER_ATTEMPT_TTL_MS);
      const attemptToken = randomUUID();
      const plan: SellpiaInventorySourcePlan = {
        sourceType: SOURCE_TYPE,
        parserVersion: OWNER_PARSER_VERSION,
        scope: input.scope,
        trigger: normalizedTrigger,
        sourceOrigin: SOURCE_ORIGIN,
        sourceAccountKey: SOURCE_ACCOUNT_KEY,
        generation: generation.toString(),
      };
      const run = await tx.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          fileName: null,
          fileHash: null,
          status: 'running',
          rowCount: 0,
          lastTrigger: normalizedTrigger,
          freshnessGeneration: generation,
          createdBy: input.userId,
          attemptToken,
          idempotencyKey,
          requestFingerprint: fingerprint,
          expiresAt,
          plan: plan as unknown as Prisma.InputJsonValue,
          parserVersion: OWNER_PARSER_VERSION,
        },
      });
      const updated = await tx.sellpiaInventoryState.updateMany({
        where: {
          organizationId: input.organizationId,
          freshnessFence: state.freshnessFence,
        },
        data: {
          requestedGeneration: generation,
          refreshRequestedAt: now,
          refreshReason: normalizedTrigger,
          requestedSyncScope: input.scope,
          syncNotBefore: now,
          activeSyncToken: attemptToken,
          activeSyncOwnerUserId: input.userId,
          activeSyncStartedAt: now,
          activeSyncLeaseExpiresAt: expiresAt,
          activeSyncScope: input.scope,
          activeGeneration: generation,
          failedGeneration: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          freshnessFence: randomUUID(),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Sellpia inventory attempt lost its state fence');
      }
      return ownerAttemptView(run);
    }, TRANSACTION_OPTIONS);
  }

  async readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaInventorySourceAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const run = await findOwnerAttempt(tx, input.organizationId, { id: input.attemptId });
      if (!run) throw new NotFoundException('SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND');
      return ownerAttemptView(run);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async failAttempt(input: FailAttemptInput): Promise<SellpiaInventorySourceAttempt> {
    const errorCode = input.errorCode.trim().slice(0, 100);
    const errorMessage = sanitizeErrorMessage(input.errorMessage);
    if (!errorCode || !errorMessage) {
      throw new BadRequestException('INVALID_SELLPIA_INVENTORY_FAILURE');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const state = await lockedState(tx, input.organizationId);
      const run = await findOwnerAttempt(tx, input.organizationId, { id: input.attemptId });
      if (!run) throw new NotFoundException('SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND');
      if (run.attemptToken !== input.attemptToken) {
        throw new ConflictException('ATTEMPT_FENCE_LOST');
      }
      if (run.status !== 'running') {
        if (run.status === 'failed'
          && run.errorCode === errorCode
          && run.errorMessage === errorMessage) {
          return ownerAttemptView(run);
        }
        throw new ConflictException('SOURCE_TERMINAL_REPLAY_CONFLICT');
      }
      const failed = isExpired(run)
        ? await failOwnerIn(
            tx,
            this.alerts,
            state,
            run,
            'ATTEMPT_EXPIRED',
            'Sellpia inventory collection expired',
          )
        : await failOwnerIn(
            tx,
            this.alerts,
            state,
            run,
            errorCode,
            errorMessage,
            input,
          );
      return ownerAttemptView(failed);
    }, TRANSACTION_OPTIONS);
  }

  /**
   * Operator stop without the attempt token. The failure goes through the same
   * terminal path as an extension-reported one, which also releases the
   * browser lease on the inventory state; a terminal attempt is returned as is.
   */
  async cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaInventorySourceAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const run = await findOwnerAttempt(tx, input.organizationId, { id: input.attemptId });
      if (!run) throw new NotFoundException('SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND');
      if (run.status !== 'running') return ownerAttemptView(run);
      const state = await lockedState(tx, input.organizationId);
      const failed = isExpired(run)
        ? await failOwnerIn(
            tx,
            this.alerts,
            state,
            run,
            'ATTEMPT_EXPIRED',
            'Sellpia inventory collection expired.',
          )
        : await failOwnerIn(
            tx,
            this.alerts,
            state,
            run,
            OPERATOR_CANCEL_CODE,
            OPERATOR_CANCEL_MESSAGE,
          );
      return ownerAttemptView(failed);
    }, TRANSACTION_OPTIONS);
  }

  claimFileRun(input: ClaimInput): Promise<SellpiaFileRunClaim> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const state = await lockedState(tx, input.organizationId);
      assertConfirmedBinding(state);
      const now = new Date();
      const claimedExecution = await claimManualExecution(tx, state, input, now);
      const existing = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          fileHash: input.fileHash,
        },
      });
      return existing
        ? claimExistingRun(
            tx,
            existing,
            state.lastCompletedImportRunId,
            input,
            claimedExecution,
            now,
          )
        : createRun(tx, input, claimedExecution, now);
    }, TRANSACTION_OPTIONS);
  }

  async markRunFailed(input: FailureInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const now = new Date();
      const updated = await tx.sourceImportRun.updateMany({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: 'running',
          attemptToken: input.attemptToken,
        },
        data: {
          status: 'failed',
          errorCode: input.errorCode,
          errorMessage: sanitizeErrorMessage(input.errorMessage),
        },
      });
      if (updated.count !== 1) return;

      const generation = parseGeneration(input.execution.activeGeneration);
      const state = await tx.sellpiaInventoryState.findUnique({
        where: { organizationId: input.organizationId },
        select: { activeSyncScope: true },
      });
      await tx.sellpiaInventoryState.updateMany({
        where: {
          organizationId: input.organizationId,
          activeSyncToken: input.execution.claimToken,
          activeSyncOwnerUserId: input.userId,
          activeGeneration: generation,
          sourceOrigin: SOURCE_ORIGIN,
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
        },
        data: {
          activeSyncToken: null,
          activeSyncOwnerUserId: null,
          activeSyncStartedAt: null,
          activeSyncLeaseExpiresAt: null,
          activeSyncScope: null,
          activeGeneration: null,
          failedGeneration: generation,
          lastAttemptAt: now,
          lastAttemptStatus: 'failed',
          lastAttemptSyncScope: state?.activeSyncScope ?? 'inventory',
          lastErrorCode: input.errorCode,
          lastErrorMessage: sanitizeErrorMessage(input.errorMessage),
          freshnessFence: randomUUID(),
        },
      });
      await this.alerts.recordTerminalOutcome(
        tx,
        sellpiaInventorySourceFailureAlert({
          organizationId: input.organizationId,
          attemptId: input.runId,
          errorCode: input.errorCode,
          errorMessage: sanitizeErrorMessage(input.errorMessage),
        }),
      );
    }, TRANSACTION_OPTIONS);
  }
}

type OwnerAttemptWhere = {
  id?: string;
  idempotencyKey?: string;
  status?: string;
};

async function findOwnerAttempt(
  tx: Prisma.TransactionClient,
  organizationId: string,
  where: OwnerAttemptWhere,
): Promise<SourceImportRun | null> {
  return tx.sourceImportRun.findFirst({
    where: {
      organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: null,
      idempotencyKey: where.idempotencyKey ?? { not: null },
      ...(where.id ? { id: where.id } : {}),
      ...(where.status ? { status: where.status } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function isExpired(run: SourceImportRun): boolean {
  return !run.expiresAt || run.expiresAt.getTime() <= Date.now();
}

async function failOwnerIn(
  tx: Prisma.TransactionClient,
  alerts: SourceFailureAlerts,
  state: SellpiaInventoryState,
  run: SourceImportRun,
  errorCode: string,
  errorMessage: string,
  input?: Pick<FailAttemptInput, 'fileName' | 'contentChecksum'>,
): Promise<SourceImportRun> {
  const cleanMessage = sanitizeErrorMessage(errorMessage);
  const failed = await tx.sourceImportRun.update({
    where: { id: run.id, organizationId: run.organizationId },
    data: {
      status: 'failed',
      errorCode: errorCode.slice(0, 100),
      errorMessage: cleanMessage,
      ...(input?.fileName !== undefined ? { fileName: input.fileName } : {}),
      ...(input?.contentChecksum !== undefined
        ? { contentChecksum: input.contentChecksum }
        : {}),
    },
  });
  const generation = run.freshnessGeneration;
  const stateErrorCode = (SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES as readonly string[])
    .includes(errorCode)
    ? errorCode
    : 'sellpia_background_timeout';
  await tx.sellpiaInventoryState.updateMany({
    where: {
      organizationId: run.organizationId,
      freshnessFence: state.freshnessFence,
      sourceOrigin: SOURCE_ORIGIN,
      sourceAccountKey: SOURCE_ACCOUNT_KEY,
      activeSyncToken: run.attemptToken,
      activeGeneration: generation,
    },
    data: {
      activeSyncToken: null,
      activeSyncOwnerUserId: null,
      activeSyncStartedAt: null,
      activeSyncLeaseExpiresAt: null,
      activeSyncScope: null,
      activeGeneration: null,
      failedGeneration: generation,
      lastAttemptAt: new Date(),
      lastAttemptStatus: 'failed',
      lastAttemptSyncScope: state.activeSyncScope ?? state.requestedSyncScope,
      lastErrorCode: stateErrorCode,
      lastErrorMessage: cleanMessage,
      freshnessFence: randomUUID(),
    },
  });
  await alerts.recordTerminalOutcome(
    tx,
    sellpiaInventorySourceFailureAlert({
      organizationId: run.organizationId,
      attemptId: run.id,
      errorCode: errorCode.slice(0, 100),
      errorMessage: cleanMessage,
    }),
  );
  return failed;
}

function ownerAttemptView(run: SourceImportRun): SellpiaInventorySourceAttempt {
  if (!run.expiresAt || !run.plan || run.freshnessGeneration === null) {
    throw new ConflictException('Sellpia inventory source attempt is incomplete');
  }
  const expired = run.status === 'running' && isExpired(run);
  const state = expired || run.status === 'failed'
    ? 'FAILED'
    : run.status === 'completed'
      ? 'COMPLETE'
      : 'RUNNING';
  return {
    attemptId: run.id,
    attemptToken: run.attemptToken,
    generation: run.freshnessGeneration.toString(),
    state,
    plan: run.plan as unknown as SellpiaInventorySourcePlan,
    expiresAt: run.expiresAt.toISOString(),
    actualCutoffAt: run.importedAt?.toISOString() ?? null,
    fileName: run.fileName,
    fileHash: run.fileHash,
    contentChecksum: run.contentChecksum,
    rowCount: run.rowCount,
    errorCode: expired ? 'ATTEMPT_EXPIRED' : run.errorCode,
    errorMessage: expired
      ? 'Sellpia inventory collection expired.'
      : run.errorMessage,
  };
}

async function claimManualExecution(
  tx: Prisma.TransactionClient,
  state: SellpiaInventoryState,
  input: ClaimInput,
  now: Date,
): Promise<ClaimedSellpiaManualExecution> {
  if (
    input.execution.kind !== 'manual'
    || input.execution.manualFreshExportConfirmed !== true
  ) {
    throw new BadRequestException('Manual Sellpia imports require fresh-export attestation');
  }
  if (state.activeSyncLeaseExpiresAt && state.activeSyncLeaseExpiresAt > now) {
    throw new ConflictException('A browser Sellpia inventory collection is active');
  }

  const hasPendingGeneration = state.requestedGeneration > state.verifiedGeneration;
  const activeGeneration = hasPendingGeneration
    ? state.requestedGeneration
    : state.requestedGeneration + 1n;
  const trigger = hasPendingGeneration
    ? state.refreshReason === null
      ? 'manual_request'
      : SellpiaInventoryRefreshReasonSchema.parse(state.refreshReason)
    : 'manual_request';
  const claimToken = randomUUID();
  const updated = await tx.sellpiaInventoryState.updateMany({
    where: {
      organizationId: input.organizationId,
      freshnessFence: state.freshnessFence,
    },
    data: {
      requestedGeneration: activeGeneration,
      refreshRequestedAt: hasPendingGeneration ? state.refreshRequestedAt : now,
      refreshReason: trigger,
      requestedSyncScope: 'inventory',
      syncNotBefore: hasPendingGeneration ? state.syncNotBefore : now,
      activeSyncToken: claimToken,
      activeSyncOwnerUserId: input.userId,
      activeSyncStartedAt: now,
      activeSyncLeaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      activeSyncScope: 'inventory',
      activeGeneration,
      freshnessFence: randomUUID(),
    },
  });
  if (updated.count !== 1) {
    throw new ConflictException('Manual Sellpia import lost its generation claim');
  }
  return {
    claimToken,
    activeGeneration: activeGeneration.toString(),
    trigger,
  };
}

async function createRun(
  tx: Prisma.TransactionClient,
  input: ClaimInput,
  execution: ClaimedSellpiaManualExecution,
  now: Date,
): Promise<SellpiaFileRunClaim> {
  const attemptToken = randomUUID();
  const run = await tx.sourceImportRun.create({
    data: {
      organizationId: input.organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: null,
      fileName: input.fileName,
      fileHash: input.fileHash,
      status: 'running',
      rowCount: 0,
      importedAt: null,
      lastTrigger: execution.trigger,
      freshnessGeneration: BigInt(execution.activeGeneration),
      manualFreshExportConfirmedAt: now,
      manualFreshExportConfirmedBy: input.userId,
      createdBy: input.userId,
      attemptToken,
    },
  });
  return {
    kind: 'started',
    runId: run.id,
    attemptToken,
    claimedExecution: execution,
  };
}

async function claimExistingRun(
  tx: Prisma.TransactionClient,
  run: SourceImportRun,
  currentCompletedRunId: string | null,
  input: ClaimInput,
  execution: ClaimedSellpiaManualExecution,
  now: Date,
): Promise<SellpiaFileRunClaim> {
  const claimedExecution = execution;
  // A hash identifies a durable run, but only the state pointer identifies the
  // currently published snapshot. Historical completed hashes must be fenced
  // and published again before they can become authoritative.
  if (run.status === 'completed' && run.id === currentCompletedRunId) {
    return { kind: 'completed', runId: run.id, claimedExecution };
  }
  const attemptToken = randomUUID();
  const reclaimed = await tx.sourceImportRun.updateMany({
    where: {
      id: run.id,
      organizationId: input.organizationId,
      sourceType: SOURCE_TYPE,
      channelAccountId: null,
      status: run.status,
      attemptToken: run.attemptToken,
    },
    data: {
      status: 'running',
      fileName: input.fileName,
      rowCount: 0,
      importedAt: null,
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: execution.trigger,
      freshnessGeneration: BigInt(execution.activeGeneration),
      manualFreshExportConfirmedAt: now,
      manualFreshExportConfirmedBy: input.userId,
      qualityReport: Prisma.JsonNull,
      errorCode: null,
      errorMessage: null,
      createdBy: input.userId,
      attemptToken,
    },
  });
  if (reclaimed.count !== 1) return { kind: 'running' };
  return {
    kind: 'started',
    runId: run.id,
    attemptToken,
    claimedExecution,
  };
}

async function lockedState(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<SellpiaInventoryState> {
  await tx.$queryRaw`
    SELECT organization_id
    FROM sellpia_inventory_states
    WHERE organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  const state = await tx.sellpiaInventoryState.findUnique({
    where: { organizationId },
  });
  if (!state) {
    throw new ConflictException('Sellpia inventory source binding is not confirmed');
  }
  return state;
}

function assertConfirmedBinding(state: SellpiaInventoryState): void {
  if (
    state.sourceOrigin !== SOURCE_ORIGIN
    || state.sourceAccountKey !== SOURCE_ACCOUNT_KEY
  ) {
    throw new ConflictException('Sellpia inventory source binding is not confirmed');
  }
}

function parseGeneration(value: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new BadRequestException('Sellpia inventory generation is invalid');
  }
  return BigInt(value);
}

function sanitizeErrorMessage(message: string): string {
      return message.trim().slice(0, 300) || 'Sellpia inventory artifact validation failed';
}

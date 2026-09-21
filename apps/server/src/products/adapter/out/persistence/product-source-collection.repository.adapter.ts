import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type SellpiaInventoryState, type SourceImportRun } from '@prisma/client';
import { ProductSourceConflictError, ProductSourceInputError, ProductSourceNotFoundError } from '../../../application/exception/product-source.error';
import {
  SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES,
  SellpiaInventoryCollectionTriggerSchema,
  type SellpiaSyncScope,
} from '@kiditem/shared/sellpia-inventory-freshness';
import {
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { OPERATOR_CANCEL_CODE, OPERATOR_CANCEL_MESSAGE } from '../../../../common/operator-cancel';
import { lockProductSource } from './transaction/product-source-lock';
import { productSourceFailureAlert } from '../sellpia/product-source-failure-alert';
import type { ProductSourceCollectionRepositoryPort } from '../../../application/port/out/persistence/product-source-collection.repository.port';
import type {
  SellpiaCollectionAttempt,
  SellpiaCollectionPlan,
} from '../../../application/port/in/sellpia-collection.port';

const SOURCE_TYPE = 'sellpia_inventory';
const SOURCE_ORIGIN = 'https://kiditem.sellpia.com';
const SOURCE_ACCOUNT_KEY = 'kiditem';
const OWNER_PARSER_VERSION = 'sellpia-inventory-v1';
const OWNER_ATTEMPT_TTL_MS = 5 * 60_000;
const OWNER_REFRESH_REASONS = new Set<string>([
  'initial_snapshot',
  'manual_request',
  'retry',
]);
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type BeginAttemptInput = Parameters<ProductSourceCollectionRepositoryPort['beginAttempt']>[0];
type FailAttemptInput = Parameters<ProductSourceCollectionRepositoryPort['failAttempt']>[0];

@Injectable()
export class ProductSourceCollectionRepositoryAdapter
implements ProductSourceCollectionRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async beginAttempt(input: BeginAttemptInput): Promise<SellpiaCollectionAttempt> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new ProductSourceInputError('INVALID_SELLPIA_INVENTORY_IDEMPOTENCY_KEY');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockProductSource(tx, input.organizationId);
      let state = await lockedState(tx, input.organizationId);
      assertConfirmedBinding(state);
      const now = new Date();
      if (input.trigger && !OWNER_REFRESH_REASONS.has(input.trigger)) {
        throw new ProductSourceInputError('INVALID_SELLPIA_INVENTORY_TRIGGER');
      }
      const trigger = input.trigger
        ?? (state.verifiedGeneration === 0n ? 'initial_snapshot' : 'manual_request');
      const normalizedTrigger = SellpiaInventoryCollectionTriggerSchema.parse(trigger);
      const fingerprint = canonicalOwnerInputHash({
        scope: input.scope,
        trigger: normalizedTrigger,
      });

      let existing = await findOwnerAttempt(tx, input.organizationId, { idempotencyKey });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new ProductSourceConflictError('SOURCE_IDEMPOTENCY_KEY_REUSED');
        }
        if (existing.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && isExpired(existing)) {
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
        status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
      });
      if (running) {
        if (!isExpired(running)) {
          throw new ProductSourceConflictError('A Sellpia inventory collection is already running.', {
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
        throw new ProductSourceConflictError('A Sellpia inventory collection is already running.', {
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
      const plan: SellpiaCollectionPlan = {
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
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
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
          refreshReason: normalizedTrigger,
          requestedSyncScope: input.scope,
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
        throw new ProductSourceConflictError('Sellpia inventory attempt lost its state fence');
      }
      return ownerAttemptView(run);
    }, TRANSACTION_OPTIONS);
  }

  async readAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaCollectionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const run = await findOwnerAttempt(tx, input.organizationId, { id: input.attemptId });
      if (!run) throw new ProductSourceNotFoundError('SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND');
      return ownerAttemptView(run);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async failAttempt(input: FailAttemptInput): Promise<SellpiaCollectionAttempt> {
    const errorCode = input.errorCode.trim().slice(0, 100);
    const errorMessage = sanitizeErrorMessage(input.errorMessage);
    if (!errorCode || !errorMessage) {
      throw new ProductSourceInputError('INVALID_SELLPIA_INVENTORY_FAILURE');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockProductSource(tx, input.organizationId);
      const state = await lockedState(tx, input.organizationId);
      const run = await findOwnerAttempt(tx, input.organizationId, { id: input.attemptId });
      if (!run) throw new ProductSourceNotFoundError('SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND');
      if (run.attemptToken !== input.attemptToken) {
        throw new ProductSourceConflictError('ATTEMPT_FENCE_LOST');
      }
      if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) {
        if (
          run.status === SOURCE_IMPORT_RUN_FAILED_STATUS
          && run.errorCode === errorCode
          && run.errorMessage === errorMessage
        ) return ownerAttemptView(run);
        throw new ProductSourceConflictError('SOURCE_TERMINAL_REPLAY_CONFLICT');
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
        : await failOwnerIn(tx, this.alerts, state, run, errorCode, errorMessage, input);
      return ownerAttemptView(failed);
    }, TRANSACTION_OPTIONS);
  }

  /** Operator stop without the attempt token. */
  async cancelAttempt(input: {
    organizationId: string;
    attemptId: string;
  }): Promise<SellpiaCollectionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      await lockProductSource(tx, input.organizationId);
      const run = await findOwnerAttempt(tx, input.organizationId, { id: input.attemptId });
      if (!run) throw new ProductSourceNotFoundError('SELLPIA_INVENTORY_ATTEMPT_NOT_FOUND');
      if (run.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS) return ownerAttemptView(run);
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
      status: SOURCE_IMPORT_RUN_FAILED_STATUS,
      errorCode: errorCode.slice(0, 100),
      errorMessage: cleanMessage,
      ...(input?.fileName !== undefined ? { fileName: input.fileName } : {}),
      ...(input?.contentChecksum !== undefined
        ? { contentChecksum: input.contentChecksum }
        : {}),
    },
  });
  const generation = run.freshnessGeneration;
  const outcome = errorCode.endsWith('_CANCELLED')
    ? { lastErrorCode: null, lastErrorMessage: null }
    : {
        failedGeneration: generation,
        lastErrorCode: (SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES as readonly string[])
          .includes(errorCode)
          ? errorCode
          : 'sellpia_background_timeout',
        lastErrorMessage: cleanMessage,
      };
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
      ...outcome,
      lastAttemptAt: new Date(),
      lastAttemptSyncScope: state.activeSyncScope ?? state.requestedSyncScope,
      freshnessFence: randomUUID(),
    },
  });
  await alerts.recordTerminalOutcome(
    tx,
    productSourceFailureAlert({
      organizationId: run.organizationId,
      attemptId: run.id,
      errorCode: errorCode.slice(0, 100),
      errorMessage: cleanMessage,
    }),
  );
  return failed;
}

function ownerAttemptView(run: SourceImportRun): SellpiaCollectionAttempt {
  if (!run.expiresAt || !run.plan || run.freshnessGeneration === null) {
    throw new ProductSourceConflictError('Sellpia inventory source attempt is incomplete');
  }
  const expired = run.status === SOURCE_IMPORT_RUN_RUNNING_STATUS && isExpired(run);
  const state = expired || run.status === SOURCE_IMPORT_RUN_FAILED_STATUS
    ? 'FAILED'
    : run.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS
      ? 'COMPLETE'
      : 'RUNNING';
  return {
    attemptId: run.id,
    attemptToken: run.attemptToken,
    generation: run.freshnessGeneration.toString(),
    state,
    plan: run.plan as unknown as SellpiaCollectionPlan,
    expiresAt: run.expiresAt.toISOString(),
    actualCutoffAt: run.importedAt?.toISOString() ?? null,
    fileName: run.fileName,
    fileHash: run.fileHash,
    contentChecksum: run.contentChecksum,
    rowCount: run.rowCount,
    errorCode: expired ? 'ATTEMPT_EXPIRED' : run.errorCode,
    errorMessage: expired ? 'Sellpia inventory collection expired.' : run.errorMessage,
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
    throw new ProductSourceConflictError('Sellpia inventory source binding is not confirmed');
  }
  return state;
}

function assertConfirmedBinding(state: SellpiaInventoryState): void {
  if (state.sourceOrigin !== SOURCE_ORIGIN || state.sourceAccountKey !== SOURCE_ACCOUNT_KEY) {
    throw new ProductSourceConflictError('Sellpia inventory source binding is not confirmed');
  }
}

function sanitizeErrorMessage(message: string): string {
  return message.trim().slice(0, 300) || 'Sellpia inventory artifact validation failed';
}

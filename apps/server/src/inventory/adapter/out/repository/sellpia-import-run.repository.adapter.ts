import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type SellpiaInventoryState, type SourceImportRun } from '@prisma/client';
import { SellpiaInventoryRefreshReasonSchema } from '@kiditem/shared/sellpia-inventory-freshness';
import { PrismaService } from '../../../../prisma/prisma.service';
import { lockSellpiaInventoryTransaction } from './sellpia-inventory-transaction-lock';
import type {
  ClaimedSellpiaImportExecution,
  SellpiaFileRunClaim,
  SellpiaImportRunRepositoryPort,
} from '../../../application/port/out/repository/sellpia-import-run.repository.port';

const SOURCE_TYPE = 'sellpia_inventory';
const SOURCE_ORIGIN = 'https://kiditem.sellpia.com';
const SOURCE_ACCOUNT_KEY = 'kiditem';
const CLAIM_LEASE_MS = 90_000;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type ClaimInput = Parameters<SellpiaImportRunRepositoryPort['claimFileRun']>[0];
type FailureInput = Parameters<SellpiaImportRunRepositoryPort['markRunFailed']>[0];

@Injectable()
export class SellpiaImportRunRepositoryAdapter
implements SellpiaImportRunRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  claimFileRun(input: ClaimInput): Promise<SellpiaFileRunClaim> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const state = await lockedState(tx, input.organizationId);
      assertConfirmedBinding(state);
      const now = new Date();
      const claimedExecution = input.execution.kind === 'browser'
        ? claimBrowserExecution(state, input, now)
        : await claimManualExecution(tx, state, input, now);
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
          activeGeneration: null,
          failedGeneration: generation,
          lastAttemptAt: now,
          lastAttemptStatus: 'failed',
          lastErrorCode: input.errorCode,
          lastErrorMessage: sanitizeErrorMessage(input.errorMessage),
          freshnessFence: randomUUID(),
        },
      });
    }, TRANSACTION_OPTIONS);
  }
}

async function claimManualExecution(
  tx: Prisma.TransactionClient,
  state: SellpiaInventoryState,
  input: ClaimInput,
  now: Date,
): Promise<ClaimedSellpiaImportExecution> {
  if (input.execution.kind !== 'manual' || input.execution.manualFreshExportConfirmed !== true) {
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
      syncNotBefore: hasPendingGeneration ? state.syncNotBefore : now,
      activeSyncToken: claimToken,
      activeSyncOwnerUserId: input.userId,
      activeSyncStartedAt: now,
      activeSyncLeaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
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

function claimBrowserExecution(
  state: SellpiaInventoryState,
  input: ClaimInput,
  now: Date,
): ClaimedSellpiaImportExecution {
  if (input.execution.kind !== 'browser') {
    throw new BadRequestException('Invalid Sellpia browser execution');
  }
  if (
    input.execution.sourceOrigin !== SOURCE_ORIGIN
    || input.execution.sourceAccountKey !== SOURCE_ACCOUNT_KEY
  ) {
    throw new ConflictException('Sellpia source binding does not match');
  }
  const activeGeneration = parseGeneration(input.execution.activeGeneration);
  if (
    state.activeSyncToken !== input.execution.claimToken
    || state.activeSyncOwnerUserId !== input.userId
    || state.activeGeneration !== activeGeneration
    || !state.activeSyncLeaseExpiresAt
    || state.activeSyncLeaseExpiresAt <= now
  ) {
    throw new ConflictException('Sellpia inventory generation claim is stale');
  }
  return {
    claimToken: input.execution.claimToken,
    activeGeneration: input.execution.activeGeneration,
    trigger: input.execution.trigger,
  };
}

async function createRun(
  tx: Prisma.TransactionClient,
  input: ClaimInput,
  execution: ClaimedSellpiaImportExecution,
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
      manualFreshExportConfirmedAt: input.execution.kind === 'manual' ? now : null,
      manualFreshExportConfirmedBy:
        input.execution.kind === 'manual' ? input.userId : null,
      createdBy: input.userId,
      attemptToken,
    },
  });
  return {
    kind: 'started',
    runId: run.id,
    attemptToken,
    claimedExecution: input.execution.kind === 'manual' ? execution : undefined,
  };
}

async function claimExistingRun(
  tx: Prisma.TransactionClient,
  run: SourceImportRun,
  currentCompletedRunId: string | null,
  input: ClaimInput,
  execution: ClaimedSellpiaImportExecution,
  now: Date,
): Promise<SellpiaFileRunClaim> {
  const claimedExecution = input.execution.kind === 'manual' ? execution : undefined;
  // A hash identifies a durable run, but only the state pointer identifies the
  // currently published snapshot. Historical completed hashes must be fenced
  // and published again before they can become authoritative.
  if (run.status === 'completed' && run.id === currentCompletedRunId) {
    return { kind: 'completed', runId: run.id, claimedExecution };
  }
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  if (
    run.status === 'running'
    && input.execution.kind === 'browser'
    && run.updatedAt >= staleBefore
  ) {
    return { kind: 'running' };
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
      manualFreshExportConfirmedAt: input.execution.kind === 'manual' ? now : null,
      manualFreshExportConfirmedBy:
        input.execution.kind === 'manual' ? input.userId : null,
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

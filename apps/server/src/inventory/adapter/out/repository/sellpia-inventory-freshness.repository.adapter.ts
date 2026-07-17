import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type SellpiaInventoryState } from '@prisma/client';
import {
  SellpiaInventoryCollectionFailureCodeSchema,
  SellpiaInventoryRefreshReasonSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  FailedSellpiaInventoryAttempt,
  SellpiaInventoryFreshnessRepositoryPort,
  SellpiaInventoryFreshnessRepositoryTransaction,
  SellpiaInventoryStateExpectation,
  SellpiaInventoryStatePatch,
} from '../../../application/port/out/repository/sellpia-inventory-freshness.repository.port';
import type { SellpiaInventoryFreshnessState } from '../../../domain/policy/sellpia-inventory-freshness.policy';

const SOURCE_TYPE = 'sellpia_inventory';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class SellpiaInventoryFreshnessRepositoryAdapter
implements SellpiaInventoryFreshnessRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  withLockedState<T>(
    input: {
      organizationId: string;
      createInitialState: () => SellpiaInventoryFreshnessState;
    },
    operation: (
      transaction: SellpiaInventoryFreshnessRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `inventory-sellpia:${input.organizationId}:${SOURCE_TYPE}`;
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;
      const initialState = input.createInitialState();
      await tx.sellpiaInventoryState.upsert({
        where: { organizationId: input.organizationId },
        create: toCreateData(initialState),
        update: {},
      });
      await tx.$queryRaw`
        SELECT organization_id
        FROM sellpia_inventory_states
        WHERE organization_id = ${input.organizationId}::uuid
        FOR UPDATE
      `;
      return operation(new LockedFreshnessTransaction(tx, input.organizationId));
    }, TRANSACTION_OPTIONS);
  }
}

class LockedFreshnessTransaction
implements SellpiaInventoryFreshnessRepositoryTransaction {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {}

  async getState(): Promise<SellpiaInventoryFreshnessState> {
    const [state, unresolvedOrderTransmissionIntentCount] = await Promise.all([
      this.tx.sellpiaInventoryState.findUniqueOrThrow({
        where: { organizationId: this.organizationId },
      }),
      this.tx.sellpiaOrderTransmissionIntent.count({
        where: {
          organizationId: this.organizationId,
          status: 'prepared',
        },
      }),
    ]);
    return mapState(state, unresolvedOrderTransmissionIntentCount);
  }

  async compareAndSetState(input: {
    expected: SellpiaInventoryStateExpectation;
    patch: SellpiaInventoryStatePatch;
  }): Promise<SellpiaInventoryFreshnessState> {
    const result = await this.tx.sellpiaInventoryState.updateMany({
      where: expectationWhere(this.organizationId, input.expected),
      data: input.patch,
    });
    if (result.count !== 1) {
      throw new ConflictException('Sellpia inventory freshness fence was lost');
    }
    return this.getState();
  }

  async prepareOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    preparedAt: Date;
  }): Promise<'prepared' | 'already_prepared' | 'already_finalized' | 'not_owned'> {
    const existing = await this.tx.sellpiaOrderTransmissionIntent.findFirst({
      where: {
        organizationId: this.organizationId,
        intentKey: input.intentKey,
      },
      select: { status: true, createdBy: true },
    });
    if (existing && existing.createdBy !== input.userId) return 'not_owned';
    if (existing?.status === 'prepared') return 'already_prepared';
    if (existing?.status === 'finalized') return 'already_finalized';
    if (existing?.status === 'aborted') {
      const reopened = await this.tx.sellpiaOrderTransmissionIntent.updateMany({
        where: {
          organizationId: this.organizationId,
          intentKey: input.intentKey,
          status: 'aborted',
        },
        data: {
          status: 'prepared',
          preparedAt: input.preparedAt,
          finalizedAt: null,
          abortedAt: null,
          finalizedGeneration: null,
        },
      });
      if (reopened.count !== 1) {
        throw new ConflictException('Sellpia order transmission intent reopen lost its fence');
      }
      return 'prepared';
    }
    if (existing) {
      throw new ConflictException('Sellpia order transmission intent has an invalid status');
    }

    await this.tx.sellpiaOrderTransmissionIntent.create({
      data: {
        organizationId: this.organizationId,
        intentKey: input.intentKey,
        status: 'prepared',
        createdBy: input.userId,
        preparedAt: input.preparedAt,
      },
    });
    return 'prepared';
  }

  async findOrderTransmissionIntent(intentKey: string, userId: string): Promise<{
    status: 'prepared' | 'finalized' | 'aborted';
    finalizedGeneration: bigint | null;
  } | null> {
    const intent = await this.tx.sellpiaOrderTransmissionIntent.findFirst({
      where: {
        organizationId: this.organizationId,
        intentKey,
        createdBy: userId,
      },
      select: { status: true, finalizedGeneration: true },
    });
    if (!intent) return null;
    if (
      intent.status !== 'prepared'
      && intent.status !== 'finalized'
      && intent.status !== 'aborted'
    ) {
      throw new ConflictException('Sellpia order transmission intent has an invalid status');
    }
    return {
      status: intent.status,
      finalizedGeneration: intent.finalizedGeneration,
    };
  }

  async finalizeOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    finalizedGeneration: bigint;
    finalizedAt: Date;
  }): Promise<void> {
    const finalized = await this.tx.sellpiaOrderTransmissionIntent.updateMany({
      where: {
        organizationId: this.organizationId,
        intentKey: input.intentKey,
        createdBy: input.userId,
        status: 'prepared',
      },
      data: {
        status: 'finalized',
        finalizedGeneration: input.finalizedGeneration,
        finalizedAt: input.finalizedAt,
        abortedAt: null,
      },
    });
    if (finalized.count !== 1) {
      throw new ConflictException('Sellpia order transmission intent finalize lost its fence');
    }
  }

  async abortOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    abortedAt: Date;
  }): Promise<void> {
    const aborted = await this.tx.sellpiaOrderTransmissionIntent.updateMany({
      where: {
        organizationId: this.organizationId,
        intentKey: input.intentKey,
        createdBy: input.userId,
        status: 'prepared',
      },
      data: {
        status: 'aborted',
        abortedAt: input.abortedAt,
      },
    });
    if (aborted.count !== 1) {
      throw new ConflictException('Sellpia order transmission intent abort lost its fence');
    }
  }

  async findOrderTransmissionIntentForReconciliation(intentKey: string): Promise<{
    status: 'prepared' | 'finalized' | 'aborted';
    finalizedGeneration: bigint | null;
    latestReconciliation: {
      reconciledBy: string;
      reconciledAt: Date;
      note: string;
      outcome: 'submitted' | 'not_submitted';
    } | null;
  } | null> {
    const intent = await this.tx.sellpiaOrderTransmissionIntent.findFirst({
      where: {
        organizationId: this.organizationId,
        intentKey,
      },
      select: {
        status: true,
        finalizedGeneration: true,
        reconciliations: {
          orderBy: [{ reconciledAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            reconciledBy: true,
            reconciledAt: true,
            note: true,
            outcome: true,
          },
        },
      },
    });
    if (!intent) return null;
    if (!isIntentStatus(intent.status)) {
      throw new ConflictException('Sellpia order transmission intent has an invalid status');
    }
    const reconciliation = intent.reconciliations[0] ?? null;
    let latestReconciliation = null;
    if (reconciliation) {
      const outcome = reconciliation.outcome;
      if (!isReconciliationOutcome(outcome)) {
        throw new ConflictException('Sellpia order transmission reconciliation has an invalid outcome');
      }
      latestReconciliation = {
        reconciledBy: reconciliation.reconciledBy,
        reconciledAt: reconciliation.reconciledAt,
        note: reconciliation.note,
        outcome,
      };
    }
    return {
      status: intent.status,
      finalizedGeneration: intent.finalizedGeneration,
      latestReconciliation,
    };
  }

  async reconcileOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    reconciledAt: Date;
    note: string;
    outcome: 'submitted' | 'not_submitted';
    finalizedGeneration: bigint | null;
  }): Promise<void> {
    const intent = await this.tx.sellpiaOrderTransmissionIntent.findFirstOrThrow({
      where: {
        organizationId: this.organizationId,
        intentKey: input.intentKey,
        status: 'prepared',
      },
      select: { id: true },
    });
    const resolved = await this.tx.sellpiaOrderTransmissionIntent.updateMany({
      where: {
        id: intent.id,
        organizationId: this.organizationId,
        status: 'prepared',
      },
      data: input.outcome === 'submitted'
        ? {
            status: 'finalized',
            finalizedGeneration: input.finalizedGeneration,
            finalizedAt: input.reconciledAt,
            abortedAt: null,
          }
        : {
            status: 'aborted',
            finalizedGeneration: null,
            finalizedAt: null,
            abortedAt: input.reconciledAt,
          },
    });
    if (resolved.count !== 1) {
      throw new ConflictException('Sellpia order transmission reconcile lost its fence');
    }
    await this.tx.sellpiaOrderTransmissionIntentReconciliation.create({
      data: {
        organizationId: this.organizationId,
        intentId: intent.id,
        reconciledBy: input.userId,
        reconciledAt: input.reconciledAt,
        note: input.note,
        outcome: input.outcome,
      },
    });
  }

  async hasFailedAttempt(input: {
    claimToken: string;
    createdBy: string;
  }): Promise<boolean> {
    const run = await this.tx.sourceImportRun.findFirst({
      where: {
        organizationId: this.organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId: null,
        fileHash: null,
        status: 'failed',
        attemptToken: input.claimToken,
        createdBy: input.createdBy,
        freshnessGeneration: { not: null },
      },
      select: { id: true },
    });
    return run !== null;
  }

  async upsertFailedAttempt(input: FailedSellpiaInventoryAttempt): Promise<void> {
    const runId = randomUUID();
    await this.tx.$executeRaw`
      INSERT INTO source_import_runs (
        id,
        organization_id,
        source_type,
        channel_account_id,
        file_name,
        file_hash,
        status,
        row_count,
        imported_at,
        last_verified_at,
        verification_count,
        last_trigger,
        freshness_generation,
        quality_report,
        error_code,
        error_message,
        created_by,
        attempt_token,
        created_at,
        updated_at
      ) VALUES (
        ${runId}::uuid,
        ${this.organizationId}::uuid,
        ${SOURCE_TYPE},
        NULL,
        NULL,
        NULL,
        'failed',
        0,
        NULL,
        NULL,
        0,
        ${input.trigger},
        ${input.generation},
        NULL,
        ${input.errorCode},
        ${input.errorMessage},
        ${input.createdBy},
        ${input.claimToken}::uuid,
        ${input.attemptedAt},
        ${input.attemptedAt}
      )
      ON CONFLICT (organization_id, source_type, freshness_generation)
      WHERE file_hash IS NULL
        AND source_type = 'sellpia_inventory'
        AND status = 'failed'
        AND freshness_generation IS NOT NULL
      DO UPDATE SET
        last_trigger = EXCLUDED.last_trigger,
        error_code = EXCLUDED.error_code,
        error_message = EXCLUDED.error_message,
        updated_at = EXCLUDED.updated_at
    `;
  }

  findInventorySkus(
    sellpiaInventorySkuIds: string[],
  ): Promise<Array<{ id: string; isActive: boolean; currentStock: number }>> {
    return this.tx.sellpiaInventorySku.findMany({
      where: {
        organizationId: this.organizationId,
        id: { in: sellpiaInventorySkuIds },
      },
      select: { id: true, isActive: true, currentStock: true },
    });
  }
}

function expectationWhere(
  organizationId: string,
  expected: SellpiaInventoryStateExpectation,
): Prisma.SellpiaInventoryStateWhereInput {
  const where: Prisma.SellpiaInventoryStateWhereInput = {
    organizationId,
    freshnessFence: expected.freshnessFence,
  };
  if (hasOwn(expected, 'requestedGeneration')) {
    where.requestedGeneration = expected.requestedGeneration;
  }
  if (hasOwn(expected, 'activeGeneration')) {
    where.activeGeneration = expected.activeGeneration;
  }
  if (hasOwn(expected, 'activeSyncToken')) {
    where.activeSyncToken = expected.activeSyncToken;
  }
  if (hasOwn(expected, 'activeSyncOwnerUserId')) {
    where.activeSyncOwnerUserId = expected.activeSyncOwnerUserId;
  }
  if (hasOwn(expected, 'activeSyncLeaseExpiresAt')) {
    where.activeSyncLeaseExpiresAt = expected.activeSyncLeaseExpiresAt;
  }
  return where;
}

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isIntentStatus(
  value: string,
): value is 'prepared' | 'finalized' | 'aborted' {
  return value === 'prepared' || value === 'finalized' || value === 'aborted';
}

function isReconciliationOutcome(
  value: string,
): value is 'submitted' | 'not_submitted' {
  return value === 'submitted' || value === 'not_submitted';
}

function toCreateData(
  state: SellpiaInventoryFreshnessState,
): Prisma.SellpiaInventoryStateUncheckedCreateInput {
  const { unresolvedOrderTransmissionIntentCount, ...persisted } = state;
  void unresolvedOrderTransmissionIntentCount;
  return persisted;
}

function mapState(
  row: SellpiaInventoryState,
  unresolvedOrderTransmissionIntentCount: number,
): SellpiaInventoryFreshnessState {
  return {
    organizationId: row.organizationId,
    sourceOrigin: row.sourceOrigin,
    sourceAccountKey: row.sourceAccountKey,
    lastVerifiedAt: row.lastVerifiedAt,
    lastCompletedImportRunId: row.lastCompletedImportRunId,
    refreshRequestedAt: row.refreshRequestedAt,
    refreshReason: row.refreshReason === null
      ? null
      : SellpiaInventoryRefreshReasonSchema.parse(row.refreshReason),
    syncNotBefore: row.syncNotBefore,
    activeSyncToken: row.activeSyncToken,
    activeSyncOwnerUserId: row.activeSyncOwnerUserId,
    activeSyncStartedAt: row.activeSyncStartedAt,
    activeSyncLeaseExpiresAt: row.activeSyncLeaseExpiresAt,
    requestedGeneration: row.requestedGeneration,
    activeGeneration: row.activeGeneration,
    verifiedGeneration: row.verifiedGeneration,
    failedGeneration: row.failedGeneration,
    lastAttemptAt: row.lastAttemptAt,
    lastAttemptStatus: parseAttemptStatus(row.lastAttemptStatus),
    lastErrorCode: row.lastErrorCode === null
      ? null
      : SellpiaInventoryCollectionFailureCodeSchema.parse(row.lastErrorCode),
    lastErrorMessage: row.lastErrorMessage,
    freshnessFence: row.freshnessFence,
    unresolvedOrderTransmissionIntentCount,
  };
}

function parseAttemptStatus(value: string | null): 'completed' | 'failed' | null {
  if (value === null || value === 'completed' || value === 'failed') return value;
  throw new ConflictException('Sellpia inventory state has an invalid attempt status');
}

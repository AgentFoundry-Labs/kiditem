import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type SellpiaInventoryState } from '@prisma/client';
import {
  SellpiaInventoryCollectionFailureCodeSchema,
  SellpiaInventoryRefreshReasonSchema,
  SellpiaSyncScopeSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { lockSellpiaInventoryTransaction } from './sellpia-inventory-transaction-lock';
import { sellpiaInventorySourceFailureAlert } from './sellpia-inventory-source-failure-alert';
import type {
  FailedSellpiaInventoryAttempt,
  SellpiaInventoryFreshnessRepositoryPort,
  SellpiaInventoryFreshnessRepositoryTransaction,
  SellpiaInventoryStateExpectation,
  SellpiaInventoryStatePatch,
} from '../../../application/port/out/repository/sellpia-inventory-freshness.repository.port';
import type {
  SellpiaInventoryFreshnessState,
} from '../../../domain/policy/sellpia-inventory-freshness.policy';

const SOURCE_TYPE = 'sellpia_inventory';
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class SellpiaInventoryFreshnessRepositoryAdapter
implements SellpiaInventoryFreshnessRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  readState(
    organizationId: string,
  ): Promise<SellpiaInventoryFreshnessState | null> {
    return this.prisma.$transaction(async (tx) => {
      const state = await tx.sellpiaInventoryState.findUnique({
        where: { organizationId },
      });
      if (!state) return null;
      return mapState(state);
    }, {
      ...TRANSACTION_OPTIONS,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

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
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
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
      return operation(new LockedFreshnessTransaction(
        tx,
        input.organizationId,
        this.alerts,
      ));
    }, TRANSACTION_OPTIONS);
  }
}

class LockedFreshnessTransaction
implements SellpiaInventoryFreshnessRepositoryTransaction {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly organizationId: string,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async getState(): Promise<SellpiaInventoryFreshnessState> {
    const state = await this.tx.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: this.organizationId },
    });
    return mapState(state);
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
    const run = await this.tx.sourceImportRun.findFirstOrThrow({
      where: {
        organizationId: this.organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId: null,
        fileHash: null,
        status: 'failed',
        freshnessGeneration: input.generation,
        attemptToken: input.claimToken,
        createdBy: input.createdBy,
      },
      select: { id: true },
    });
    await this.alerts.upsertSourceFailure(
      this.tx,
      sellpiaInventorySourceFailureAlert({
        organizationId: this.organizationId,
        attemptId: run.id,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      }),
    );
  }

  findInventorySkus(
    sellpiaInventorySkuIds: string[],
  ): Promise<Array<{
    id: string;
    isActive: boolean;
    currentStock: number;
  }>> {
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

function toCreateData(
  state: SellpiaInventoryFreshnessState,
): Prisma.SellpiaInventoryStateUncheckedCreateInput {
  return state;
}

function mapState(row: SellpiaInventoryState): SellpiaInventoryFreshnessState {
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
    requestedSyncScope: SellpiaSyncScopeSchema.parse(row.requestedSyncScope),
    syncNotBefore: row.syncNotBefore,
    activeSyncToken: row.activeSyncToken,
    activeSyncOwnerUserId: row.activeSyncOwnerUserId,
    activeSyncStartedAt: row.activeSyncStartedAt,
    activeSyncLeaseExpiresAt: row.activeSyncLeaseExpiresAt,
    activeSyncScope: row.activeSyncScope === null
      ? null
      : SellpiaSyncScopeSchema.parse(row.activeSyncScope),
    requestedGeneration: row.requestedGeneration,
    activeGeneration: row.activeGeneration,
    verifiedGeneration: row.verifiedGeneration,
    failedGeneration: row.failedGeneration,
    lastAttemptAt: row.lastAttemptAt,
    lastAttemptStatus: parseAttemptStatus(row.lastAttemptStatus),
    lastAttemptSyncScope: row.lastAttemptSyncScope === null
      ? null
      : SellpiaSyncScopeSchema.parse(row.lastAttemptSyncScope),
    lastErrorCode: row.lastErrorCode === null
      ? null
      : SellpiaInventoryCollectionFailureCodeSchema.parse(row.lastErrorCode),
    lastErrorMessage: row.lastErrorMessage,
    freshnessFence: row.freshnessFence,
  };
}

function parseAttemptStatus(value: string | null): 'completed' | 'failed' | null {
  if (value === null || value === 'completed' || value === 'failed') return value;
  throw new ConflictException('Sellpia inventory state has an invalid attempt status');
}

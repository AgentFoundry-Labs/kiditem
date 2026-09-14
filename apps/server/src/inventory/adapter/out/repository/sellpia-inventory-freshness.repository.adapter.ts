import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type SellpiaInventoryState } from '@prisma/client';
import {
  SellpiaInventoryCollectionFailureCodeSchema,
  SellpiaInventoryRefreshReasonSchema,
  SellpiaSyncScopeSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { PrismaService } from '../../../../prisma/prisma.service';
import { lockSellpiaInventoryTransaction } from './sellpia-inventory-transaction-lock';
import type {
  SellpiaInventoryFreshnessRepositoryPort,
  SellpiaInventoryFreshnessRepositoryTransaction,
  SellpiaInventoryStateExpectation,
  SellpiaInventoryStatePatch,
} from '../../../application/port/out/repository/sellpia-inventory-freshness.repository.port';
import type {
  SellpiaInventoryFreshnessState,
} from '../../../domain/policy/sellpia-inventory-freshness.policy';
import { readInventoryAvailability } from '../../../read/inventory-availability';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class SellpiaInventoryFreshnessRepositoryAdapter
implements SellpiaInventoryFreshnessRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
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
      ));
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

  findInventoryAvailability(
    sellpiaInventorySkuIds: string[],
  ): Promise<InventoryAvailabilityBatch> {
    return readInventoryAvailability(this.tx, {
      organizationId: this.organizationId,
      sellpiaInventorySkuIds,
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

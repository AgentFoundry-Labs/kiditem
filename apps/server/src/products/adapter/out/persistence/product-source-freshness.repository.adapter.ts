import { ProductSourceConflictError } from '../../../application/exception/product-source.error';
import { Injectable } from '@nestjs/common';
import { Prisma, type SellpiaInventoryState } from '@prisma/client';
import {
  SellpiaInventoryCollectionFailureCodeSchema,
  SellpiaInventoryStoredCollectionTriggerSchema,
  SellpiaSyncScopeSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  lockProductSource,
  type ProductSourceLock,
} from './transaction/product-source-lock';
import type {
  ProductCollectionFreshnessRepositoryPort,
  ProductCollectionFreshnessRepositoryTransaction,
  ProductSourceStateExpectation,
  ProductSourceStatePatch,
} from '../../../application/port/out/persistence/product-source-freshness.repository.port';
import type {
  SellpiaInventoryCollectionState,
} from '../../../domain/policy/product-source-freshness.policy';
import { readProductSourceAvailability } from './read/product-source-availability';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class ProductCollectionFreshnessRepositoryAdapter
implements ProductCollectionFreshnessRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  readState(
    organizationId: string,
  ): Promise<SellpiaInventoryCollectionState | null> {
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
      createInitialState: () => SellpiaInventoryCollectionState;
    },
    operation: (
      transaction: ProductCollectionFreshnessRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const inventoryLock = await lockProductSource(tx, input.organizationId);
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
        inventoryLock,
      ));
    }, TRANSACTION_OPTIONS);
  }
}

class LockedFreshnessTransaction
implements ProductCollectionFreshnessRepositoryTransaction {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly organizationId: string,
    private readonly inventoryLock: ProductSourceLock,
  ) {}

  async getState(): Promise<SellpiaInventoryCollectionState> {
    const state = await this.tx.sellpiaInventoryState.findUniqueOrThrow({
      where: { organizationId: this.organizationId },
    });
    return mapState(state);
  }

  async compareAndSetState(input: {
    expected: ProductSourceStateExpectation;
    patch: ProductSourceStatePatch;
  }): Promise<SellpiaInventoryCollectionState> {
    const result = await this.tx.sellpiaInventoryState.updateMany({
      where: expectationWhere(this.organizationId, input.expected),
      data: input.patch,
    });
    if (result.count !== 1) {
      throw new ProductSourceConflictError('Sellpia inventory freshness fence was lost');
    }
    return this.getState();
  }

  findProductAvailability(
    masterProductIds: string[],
  ): Promise<InventoryAvailabilityBatch> {
    return readProductSourceAvailability(this.tx, this.inventoryLock, {
      organizationId: this.organizationId,
      masterProductIds,
    });
  }
}

function expectationWhere(
  organizationId: string,
  expected: ProductSourceStateExpectation,
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
  state: SellpiaInventoryCollectionState,
): Prisma.SellpiaInventoryStateUncheckedCreateInput {
  return state;
}

function mapState(row: SellpiaInventoryState): SellpiaInventoryCollectionState {
  return {
    organizationId: row.organizationId,
    sourceOrigin: row.sourceOrigin,
    sourceAccountKey: row.sourceAccountKey,
    lastVerifiedAt: row.lastVerifiedAt,
    lastCompletedOperationId: row.lastCompletedOperationId,
    refreshReason: row.refreshReason === null
      ? null
      : SellpiaInventoryStoredCollectionTriggerSchema.parse(row.refreshReason),
    requestedSyncScope: SellpiaSyncScopeSchema.parse(row.requestedSyncScope),
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

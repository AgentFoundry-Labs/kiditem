import { ProductSourceConflictError } from '../../../application/exception/product-source.error';
import { Injectable } from '@nestjs/common';
import { Prisma, type SellpiaInventoryState } from '@prisma/client';
import {
  SellpiaInventoryStoredCollectionTriggerSchema,
  SellpiaSyncScopeSchema,
} from '@kiditem/shared/sellpia-inventory-freshness';
import {
  SELLPIA_INVENTORY_KIND,
  SELLPIA_PRODUCT_PROFITABILITY_KIND,
  SELLPIA_SALES_KIND,
} from '@kiditem/shared/sellpia-operations';
import { readLatestOperation } from '../../../../common/operation/transaction/operation-generations';
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
  SellpiaLatestOperation,
} from '../../../domain/policy/product-source-freshness.policy';
import { readProductSourceAvailability } from './read/product-source-availability';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/** 셀피아 로그인 잠금(`resource:sellpia:login`)을 나눠 쓰는 kind들 — 조직도의 셀피아 상태가 이 셋의 최신 실행을 본다. */
const SELLPIA_OPERATION_KINDS = [SELLPIA_INVENTORY_KIND, SELLPIA_SALES_KIND, SELLPIA_PRODUCT_PROFITABILITY_KIND] as const;

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

  async readLatestSellpiaOperation(organizationId: string): Promise<SellpiaLatestOperation | null> {
    const now = new Date();
    const latest = await Promise.all(SELLPIA_OPERATION_KINDS.map((kind) => readLatestOperation(this.prisma, { organizationId, kind, now })));
    const candidates = latest.flatMap((operation): SellpiaLatestOperation[] => {
      if (!operation || operation.status === 'cancelled' || operation.errorCode?.endsWith('_CANCELLED')) return [];
      if (!['prepared', 'executing', 'reconciling', 'succeeded', 'failed'].includes(operation.status)) return [];
      const plan = operation.plan && typeof operation.plan === 'object' && !Array.isArray(operation.plan) ? operation.plan : {};
      return [{
        id: operation.id,
        kind: operation.kind,
        status: operation.status as SellpiaLatestOperation['status'],
        errorCode: operation.errorCode,
        errorMessage: operation.errorMessage,
        startedAt: operation.startedAt,
        expiresAt: operation.expiresAt,
        trigger: typeof plan.trigger === 'string' ? plan.trigger : null,
      }];
    });
    return candidates.sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0] ?? null;
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
    requestedGeneration: row.requestedGeneration,
    verifiedGeneration: row.verifiedGeneration,
    freshnessFence: row.freshnessFence,
  };
}

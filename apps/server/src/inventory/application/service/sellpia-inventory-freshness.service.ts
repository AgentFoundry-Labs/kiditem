import { randomUUID } from 'node:crypto';
import { AppException } from '@kiditem/shared/server-errors';
import { ErrorCodes } from '@kiditem/shared/errors';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT,
  type SellpiaInventoryFreshnessRepositoryPort,
  type SellpiaInventoryFreshnessRepositoryTransaction,
  type SellpiaInventoryStateExpectation,
} from '../port/out/repository/sellpia-inventory-freshness.repository.port';
import {
  createInitialFreshnessState,
  deriveFreshnessStatus,
  hasLiveLease,
  isSourceBindingConfirmed,
  planRefreshRequest,
  planSourceBindingConfirmation,
  SELLPIA_FRESHNESS_TTL_MS,
  SELLPIA_SOURCE_ACCOUNT_KEY,
  SELLPIA_SOURCE_ORIGIN,
  toFreshnessView,
  type SellpiaInventoryFreshnessState,
} from '../../domain/policy/sellpia-inventory-freshness.policy';
import type {
  SellpiaInventoryFreshnessView,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type { SellpiaInventoryFreshnessGatePort } from '../port/in/stock/sellpia-inventory-freshness-gate.port';
import type {
  SellpiaFreshCapacity,
  SellpiaFreshCapacityPreflightResult,
} from '../port/in/stock/sellpia-inventory-freshness-gate.port';
import type { SellpiaInventoryFreshnessPort } from '../port/in/stock/sellpia-inventory-freshness.port';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

type ActorScope = { organizationId: string; userId: string };

@Injectable()
export class SellpiaInventoryFreshnessService
implements
  SellpiaInventoryFreshnessPort,
  SellpiaInventoryFreshnessGatePort {
  constructor(
    @Inject(SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT)
    private readonly repository: SellpiaInventoryFreshnessRepositoryPort,
  ) {}

  async getState(input: ActorScope): Promise<SellpiaInventoryFreshnessView> {
    const state = await this.repository.readState(input.organizationId)
      ?? await this.withLockedState(
        input.organizationId,
        (transaction) => transaction.getState(),
      );
    return this.view(input, state);
  }

  async confirmSourceBinding(input: ActorScope & {
    sourceOrigin: typeof SELLPIA_SOURCE_ORIGIN;
    sourceAccountKey: typeof SELLPIA_SOURCE_ACCOUNT_KEY;
    confirmed: true;
  }): Promise<SellpiaInventoryFreshnessView> {
    if (
      input.sourceOrigin !== SELLPIA_SOURCE_ORIGIN
      || input.sourceAccountKey !== SELLPIA_SOURCE_ACCOUNT_KEY
      || input.confirmed !== true
    ) {
      throw new BadRequestException('Invalid Sellpia source binding');
    }
    const state = await this.withLockedState(input.organizationId, async (transaction) => {
      const current = await transaction.getState();
      if (isSourceBindingConfirmed(current)) return current;
      return transaction.compareAndSetState({
        expected: expectation(current),
        patch: planSourceBindingConfirmation(current, randomUUID()),
      });
    });
    return this.view(input, state);
  }

  // A live lease names the source attempt holding it, so an operator can stop
  // that attempt by id from any browser.
  private async view(
    input: ActorScope,
    state: SellpiaInventoryFreshnessState,
  ): Promise<SellpiaInventoryFreshnessView> {
    const now = new Date();
    const leaseAttemptId = hasLiveLease(state, now) && state.activeSyncToken
      ? await this.repository.findLeaseAttemptId({
        organizationId: input.organizationId,
        activeSyncToken: state.activeSyncToken,
      })
      : null;
    return toFreshnessView(state, now, input.userId, leaseAttemptId);
  }

  async assertFreshAndActive(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<{ fence: string; lastVerifiedAt: string; expiresAt: string }> {
    const snapshot = await this.readFreshInventorySkus(input);
    if (snapshot.availability.items.some((sku) => !sku.isActive)) {
      throw new AppException(
        422,
        ErrorCodes.PURCHASE.ITEM_INACTIVE,
        'A purchase item is inactive in the Sellpia inventory snapshot.',
      );
    }
    return freshnessMetadata(snapshot.state);
  }

  async readFreshCapacity(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<SellpiaFreshCapacity> {
    const snapshot = await this.readFreshInventorySkus(input);
    return toFreshCapacity(snapshot);
  }

  async readFreshCapacityOrRequest(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<SellpiaFreshCapacityPreflightResult> {
    validateInventorySkuIds(input.sellpiaInventorySkuIds);
    const sellpiaInventorySkuIds = [...new Set(input.sellpiaInventorySkuIds)];
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const availability = await readAvailability(
        transaction,
        sellpiaInventorySkuIds,
      );

      const now = new Date();
      const isFresh = isSourceBindingConfirmed(state)
        && deriveFreshnessStatus(state, now) === 'fresh'
        && state.lastVerifiedAt !== null
        && !(
          state.refreshRequestedAt !== null
          && state.refreshRequestedAt > state.lastVerifiedAt
        );
      if (isFresh && hasCompleteAvailability(availability, sellpiaInventorySkuIds)) {
        return {
          status: 'fresh',
          ...toFreshCapacity({ state, sellpiaInventorySkuIds, availability }),
        };
      }

      const hasPendingGeneration = state.requestedGeneration > state.verifiedGeneration
        || state.activeGeneration !== null;
      if (hasPendingGeneration) {
        const target = state.activeGeneration !== null
          && state.activeGeneration > state.requestedGeneration
          ? state.activeGeneration
          : state.requestedGeneration;
        return {
          status: 'refresh_required',
          requestedGeneration: target.toString(),
        };
      }

      const updated = await transaction.compareAndSetState({
        expected: expectation(state),
        patch: planRefreshRequest(
          state,
          'purchase_preflight',
          'inventory',
          now,
          randomUUID(),
        ),
      });
      return {
        status: 'refresh_required',
        requestedGeneration: updated.requestedGeneration.toString(),
      };
    });
  }

  private readFreshInventorySkus(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<{
    state: SellpiaInventoryFreshnessState;
    sellpiaInventorySkuIds: string[];
    availability: InventoryAvailabilityBatch;
  }> {
    validateInventorySkuIds(input.sellpiaInventorySkuIds);
    const sellpiaInventorySkuIds = [...new Set(input.sellpiaInventorySkuIds)];
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const availability = await readAvailability(
        transaction,
        sellpiaInventorySkuIds,
      );

      const now = new Date();
      if (
        !isSourceBindingConfirmed(state)
        || deriveFreshnessStatus(state, now) !== 'fresh'
        || state.lastVerifiedAt === null
        || (
          state.refreshRequestedAt !== null
          && state.refreshRequestedAt > state.lastVerifiedAt
        )
        || !hasCompleteAvailability(availability, sellpiaInventorySkuIds)
      ) {
        throw syncRequired();
      }

      return {
        state,
        sellpiaInventorySkuIds,
        availability,
      };
    });
  }

  private withLockedState<T>(
    organizationId: string,
    operation: (
      transaction: SellpiaInventoryFreshnessRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    return this.repository.withLockedState(
      {
        organizationId,
        createInitialState: () => createInitialFreshnessState({
          organizationId,
          now: new Date(),
          freshnessFence: randomUUID(),
        }),
      },
      operation,
    );
  }
}

type FreshCapacitySnapshot = {
  state: SellpiaInventoryFreshnessState;
  sellpiaInventorySkuIds: string[];
  availability: InventoryAvailabilityBatch;
};

function validateInventorySkuIds(sellpiaInventorySkuIds: string[]): void {
  if (
    sellpiaInventorySkuIds.length === 0
    || sellpiaInventorySkuIds.some((id) => !isUuid(id))
  ) {
    throw referenceInvalid();
  }
}

function toFreshCapacity(snapshot: FreshCapacitySnapshot): SellpiaFreshCapacity {
  const metadata = freshnessMetadata(snapshot.state);
  const byId = new Map(snapshot.availability.items.map((sku) => [
    sku.sellpiaInventorySkuId,
    sku,
  ]));
  return {
    ...metadata,
    generation: snapshot.availability.snapshot.generation!,
    inventorySkus: snapshot.sellpiaInventorySkuIds.map((sellpiaInventorySkuId) => {
      const sku = byId.get(sellpiaInventorySkuId)!;
      return {
        sellpiaInventorySkuId,
        currentStock: sku.currentStock,
        availableStock: sku.availableStock,
        isActive: sku.isActive,
      };
    }),
  };
}

async function readAvailability(
  transaction: SellpiaInventoryFreshnessRepositoryTransaction,
  sellpiaInventorySkuIds: string[],
): Promise<InventoryAvailabilityBatch> {
  try {
    return await transaction.findInventoryAvailability(sellpiaInventorySkuIds);
  } catch (error) {
    if (error instanceof NotFoundException) throw referenceInvalid();
    throw error;
  }
}

function hasCompleteAvailability(
  availability: InventoryAvailabilityBatch,
  sellpiaInventorySkuIds: string[],
): boolean {
  if (!availability.snapshot.collected) return false;
  const availableIds = new Set(availability.items.map((item) =>
    item.sellpiaInventorySkuId));
  return sellpiaInventorySkuIds.every((id) => availableIds.has(id));
}

function freshnessMetadata(state: SellpiaInventoryFreshnessState) {
  if (state.lastVerifiedAt === null) throw syncRequired();
  return {
    fence: state.freshnessFence,
    lastVerifiedAt: state.lastVerifiedAt.toISOString(),
    expiresAt: new Date(
      state.lastVerifiedAt.getTime() + SELLPIA_FRESHNESS_TTL_MS,
    ).toISOString(),
  };
}

function syncRequired(): AppException {
  return new AppException(
    409,
    ErrorCodes.INVENTORY.SELLPIA_SYNC_REQUIRED,
    'A fresh Sellpia inventory snapshot is required before purchase.',
  );
}

function expectation(
  state: SellpiaInventoryFreshnessState,
): SellpiaInventoryStateExpectation {
  return {
    freshnessFence: state.freshnessFence,
    requestedGeneration: state.requestedGeneration,
    activeGeneration: state.activeGeneration,
    activeSyncToken: state.activeSyncToken,
    activeSyncOwnerUserId: state.activeSyncOwnerUserId,
    activeSyncLeaseExpiresAt: state.activeSyncLeaseExpiresAt,
  };
}

function referenceInvalid(): AppException {
  return new AppException(
    422,
    ErrorCodes.PURCHASE.REFERENCE_INVALID,
    'A purchase item reference is invalid for this organization.',
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

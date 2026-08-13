import { randomUUID } from 'node:crypto';
import { AppException } from '@kiditem/shared/server-errors';
import { ErrorCodes } from '@kiditem/shared/errors';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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
  isSourceBindingConfirmed,
  planCancel,
  planClaim,
  planFailure,
  planHeartbeat,
  planRefreshRequest,
  planSourceBindingConfirmation,
  SELLPIA_EXPIRED_LEASE_ERROR_MESSAGE,
  SELLPIA_FRESHNESS_TTL_MS,
  SELLPIA_SOURCE_ACCOUNT_KEY,
  SELLPIA_SOURCE_ORIGIN,
  toFreshnessView,
  type SellpiaInventoryFreshnessState,
} from '../../domain/policy/sellpia-inventory-freshness.policy';
import {
  INVENTORY_OPERATION_ALERT_PORT,
  type InventoryOperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
import type {
  SellpiaInventoryClaimResponse,
  SellpiaInventoryCollectionFailureCode,
  SellpiaInventoryFreshnessView,
  SellpiaInventoryRefreshReason,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type { SellpiaInventoryFreshnessGatePort } from '../port/in/stock/sellpia-inventory-freshness-gate.port';
import type {
  SellpiaFreshCapacity,
  SellpiaFreshCapacityPreflightResult,
} from '../port/in/stock/sellpia-inventory-freshness-gate.port';
import type { SellpiaInventoryFreshnessPort } from '../port/in/stock/sellpia-inventory-freshness.port';

type ActorScope = { organizationId: string; userId: string };
type ActorRefreshInput = ActorScope & {
  reason: SellpiaInventoryRefreshReason;
  /** Internal callers written before scoped collection remain inventory-only. */
  scope?: 'full' | 'inventory';
};

@Injectable()
export class SellpiaInventoryFreshnessService
implements
  SellpiaInventoryFreshnessPort,
  SellpiaInventoryFreshnessGatePort {
  constructor(
    @Inject(SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT)
    private readonly repository: SellpiaInventoryFreshnessRepositoryPort,
    @Inject(INVENTORY_OPERATION_ALERT_PORT)
    private readonly operationAlerts: InventoryOperationAlertPort,
  ) {}

  async getState(input: ActorScope): Promise<SellpiaInventoryFreshnessView> {
    const state = await this.repository.readState(input.organizationId);
    if (state) {
      return toFreshnessView(state, new Date(), input.userId);
    }
    return this.withLockedState(input.organizationId, async (transaction) => {
      const initializedState = await transaction.getState();
      const now = new Date();
      return toFreshnessView(initializedState, now, input.userId);
    });
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
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      if (isSourceBindingConfirmed(state)) {
        return toFreshnessView(state, new Date(), input.userId);
      }
      const updated = await transaction.compareAndSetState({
        expected: expectation(state),
        patch: planSourceBindingConfirmation(state, randomUUID()),
      });
      return toFreshnessView(updated, new Date(), input.userId);
    });
  }

  async requestRefresh(
    input: ActorRefreshInput,
  ): Promise<SellpiaInventoryFreshnessView> {
    const view = await this.withLockedState(
      input.organizationId,
      async (transaction) => {
        const state = await transaction.getState();
        const now = new Date();
        const updated = await transaction.compareAndSetState({
          expected: expectation(state),
          patch: planRefreshRequest(
            state,
            input.reason,
            input.scope ?? 'inventory',
            now,
            randomUUID(),
          ),
        });
        return toFreshnessView(updated, now, input.userId);
      },
    );
    return view;
  }

  async claimDue(input: ActorScope): Promise<SellpiaInventoryClaimResponse> {
    const result = await this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const now = new Date();
      const claimToken = randomUUID();
      const decision = planClaim(state, {
        now,
        userId: input.userId,
        claimToken,
        freshnessFence: randomUUID(),
      });
      if (decision.kind === 'joined') {
        return {
          response: {
            claimed: false as const,
            state: toFreshnessView(state, now, input.userId),
          },
          expiredClaimToken: null,
        };
      }
      if (decision.kind === 'expired') {
        const updated = await transaction.compareAndSetState({
          expected: expectation(state),
          patch: decision.patch,
        });
        await transaction.upsertFailedAttempt({
          organizationId: input.organizationId,
          generation: decision.generation,
          claimToken: decision.claimToken,
          trigger: state.refreshReason,
          errorCode: 'sellpia_background_timeout',
          errorMessage: SELLPIA_EXPIRED_LEASE_ERROR_MESSAGE,
          attemptedAt: now,
          createdBy: decision.createdBy,
        });
        return {
          response: {
            claimed: false as const,
            state: toFreshnessView(updated, now, input.userId),
          },
          expiredClaimToken: decision.claimToken,
        };
      }
      const updated = await transaction.compareAndSetState({
        expected: expectation(state),
        patch: decision.patch,
      });
      return {
        response: {
          claimed: true as const,
          claimToken,
          activeGeneration: decision.generation.toString(),
          leaseExpiresAt: decision.leaseExpiresAt.toISOString(),
          state: toFreshnessView(updated, now, input.userId),
        },
        expiredClaimToken: null,
      };
    });
    if (result.expiredClaimToken !== null) {
      await this.operationAlerts.fail(
        input.organizationId,
        `browser-collection:${result.expiredClaimToken}`,
        {
          message: SELLPIA_EXPIRED_LEASE_ERROR_MESSAGE,
          severity: 'error',
          metadata: {
            staleReconciled: true,
            staleReconciledReason: 'sellpia_lease_expired',
          },
        },
      ).catch(() => undefined);
    }
    return result.response;
  }

  async heartbeat(input: ActorScope & {
    claimToken: string;
  }): Promise<SellpiaInventoryFreshnessView> {
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const now = new Date();
      const patch = planHeartbeat(state, {
        ...input,
        now,
        freshnessFence: randomUUID(),
      });
      if (!patch) throw lostLease();
      const updated = await transaction.compareAndSetState({
        expected: expectation(state),
        patch,
      });
      return toFreshnessView(updated, now, input.userId);
    });
  }

  async fail(input: ActorScope & {
    claimToken: string;
    errorCode: SellpiaInventoryCollectionFailureCode;
    errorMessage: string;
  }): Promise<SellpiaInventoryFreshnessView> {
    const errorMessage = sanitizeErrorMessage(input.errorMessage);
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const now = new Date();
      const patch = planFailure(state, {
        ...input,
        errorMessage,
        now,
        freshnessFence: randomUUID(),
      });
      if (!patch) {
        if (await transaction.hasFailedAttempt({
          claimToken: input.claimToken,
          createdBy: input.userId,
        })) {
          return toFreshnessView(state, now, input.userId);
        }
        throw lostLease();
      }
      const generation = state.activeGeneration;
      if (generation === null) throw lostLease();
      const updated = await transaction.compareAndSetState({
        expected: expectation(state),
        patch,
      });
      await transaction.upsertFailedAttempt({
        organizationId: input.organizationId,
        generation,
        claimToken: input.claimToken,
        trigger: state.refreshReason,
        errorCode: input.errorCode,
        errorMessage,
        attemptedAt: now,
        createdBy: input.userId,
      });
      return toFreshnessView(updated, now, input.userId);
    });
  }

  async cancel(input: ActorScope & {
    claimToken: string;
  }): Promise<SellpiaInventoryFreshnessView> {
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const now = new Date();
      const patch = planCancel(state, {
        ...input,
        now,
        freshnessFence: randomUUID(),
      });
      if (!patch) throw lostLease();
      const updated = await transaction.compareAndSetState({
        expected: expectation(state),
        patch,
      });
      return toFreshnessView(updated, now, input.userId);
    });
  }

  async assertFreshAndActive(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<{ fence: string; lastVerifiedAt: string; expiresAt: string }> {
    const snapshot = await this.readFreshInventorySkus(input);
    if (snapshot.inventorySkus.some((sku) => !sku.isActive)) {
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
      const inventorySkus = await transaction.findInventorySkus(
        sellpiaInventorySkuIds,
      );
      if (inventorySkus.length !== sellpiaInventorySkuIds.length) {
        throw referenceInvalid();
      }

      const now = new Date();
      const isFresh = isSourceBindingConfirmed(state)
        && deriveFreshnessStatus(state, now) === 'fresh'
        && state.lastVerifiedAt !== null
        && !(
          state.refreshRequestedAt !== null
          && state.refreshRequestedAt > state.lastVerifiedAt
        );
      if (isFresh) {
        return {
          status: 'fresh',
          ...toFreshCapacity({ state, sellpiaInventorySkuIds, inventorySkus }),
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
    inventorySkus: Array<{
      id: string;
      isActive: boolean;
      currentStock: number;
    }>;
  }> {
    validateInventorySkuIds(input.sellpiaInventorySkuIds);
    const sellpiaInventorySkuIds = [...new Set(input.sellpiaInventorySkuIds)];
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const inventorySkus = await transaction.findInventorySkus(
        sellpiaInventorySkuIds,
      );
      if (inventorySkus.length !== sellpiaInventorySkuIds.length) {
        throw referenceInvalid();
      }

      const now = new Date();
      if (
        !isSourceBindingConfirmed(state)
        || deriveFreshnessStatus(state, now) !== 'fresh'
        || state.lastVerifiedAt === null
        || (
          state.refreshRequestedAt !== null
          && state.refreshRequestedAt > state.lastVerifiedAt
        )
      ) {
        throw syncRequired();
      }

      return {
        state,
        sellpiaInventorySkuIds,
        inventorySkus,
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
  inventorySkus: Array<{
    id: string;
    isActive: boolean;
    currentStock: number;
  }>;
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
  const byId = new Map(snapshot.inventorySkus.map((sku) => [sku.id, sku]));
  return {
    ...metadata,
    generation: snapshot.state.verifiedGeneration.toString(),
    inventorySkus: snapshot.sellpiaInventorySkuIds.map((sellpiaInventorySkuId) => {
      const sku = byId.get(sellpiaInventorySkuId)!;
      return {
        sellpiaInventorySkuId,
        currentStock: sku.currentStock,
        availableStock: sku.currentStock,
        isActive: sku.isActive,
      };
    }),
  };
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

function sanitizeErrorMessage(message: string): string {
  return message.trim().slice(0, 300) || 'Sellpia inventory collection failed';
}

function lostLease(): ConflictException {
  return new ConflictException('Sellpia inventory claim is not controlled by this user');
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

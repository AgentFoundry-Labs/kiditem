import { randomUUID } from 'node:crypto';
import { AppException } from '@kiditem/shared/server-errors';
import { ErrorCodes } from '@kiditem/shared/errors';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type {
  SellpiaInventoryClaimResponse,
  SellpiaInventoryCollectionFailureCode,
  SellpiaInventoryFreshnessView,
  SellpiaInventoryRefreshReason,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type { SellpiaInventoryFreshnessGatePort } from '../port/in/stock/sellpia-inventory-freshness-gate.port';
import type { SellpiaInventoryFreshnessPort } from '../port/in/stock/sellpia-inventory-freshness.port';
import type { SellpiaInventoryRefreshRequestPort } from '../port/in/stock/sellpia-inventory-refresh-request.port';
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
  SELLPIA_FRESHNESS_TTL_MS,
  SELLPIA_SOURCE_ACCOUNT_KEY,
  SELLPIA_SOURCE_ORIGIN,
  toFreshnessView,
  type SellpiaInventoryFreshnessState,
} from '../../domain/policy/sellpia-inventory-freshness.policy';

type ActorScope = { organizationId: string; userId: string };
type ActorRefreshInput = ActorScope & {
  reason: 'order_transmission_requested' | 'manual_request' | 'retry';
};
type CrossDomainRefreshInput = {
  organizationId: string;
  reason: 'order_transmission_requested' | 'purchase_preflight';
};

@Injectable()
export class SellpiaInventoryFreshnessService
implements
  SellpiaInventoryFreshnessPort,
  SellpiaInventoryRefreshRequestPort,
  SellpiaInventoryFreshnessGatePort {
  constructor(
    @Inject(SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT)
    private readonly repository: SellpiaInventoryFreshnessRepositoryPort,
  ) {}

  async getState(input: ActorScope): Promise<SellpiaInventoryFreshnessView> {
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const now = new Date();
      return toFreshnessView(state, now, input.userId);
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

  requestRefresh(input: ActorRefreshInput): Promise<SellpiaInventoryFreshnessView>;
  requestRefresh(input: CrossDomainRefreshInput): Promise<void>;
  async requestRefresh(
    input: ActorRefreshInput | CrossDomainRefreshInput,
  ): Promise<SellpiaInventoryFreshnessView | void> {
    const userId = 'userId' in input ? input.userId : null;
    const view = await this.withLockedState(
      input.organizationId,
      async (transaction) => {
        const state = await transaction.getState();
        const now = new Date();
        const updated = await transaction.compareAndSetState({
          expected: expectation(state),
          patch: planRefreshRequest(
            state,
            input.reason as SellpiaInventoryRefreshReason,
            now,
            randomUUID(),
          ),
        });
        return toFreshnessView(updated, now, userId);
      },
    );
    if (userId !== null) return view;
  }

  async claimDue(input: ActorScope): Promise<SellpiaInventoryClaimResponse> {
    return this.withLockedState(input.organizationId, async (transaction) => {
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
          claimed: false,
          state: toFreshnessView(state, now, input.userId),
        };
      }
      const updated = await transaction.compareAndSetState({
        expected: expectation(state),
        patch: decision.patch,
      });
      return {
        claimed: true,
        claimToken,
        activeGeneration: decision.generation.toString(),
        leaseExpiresAt: decision.leaseExpiresAt.toISOString(),
        state: toFreshnessView(updated, now, input.userId),
      };
    });
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
    masterProductIds: string[];
  }): Promise<{ fence: string; lastVerifiedAt: string; expiresAt: string }> {
    if (
      input.masterProductIds.length === 0
      || input.masterProductIds.some((id) => !isUuid(id))
    ) {
      throw referenceInvalid();
    }
    const masterProductIds = [...new Set(input.masterProductIds)];
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      const products = await transaction.findMasterProducts(masterProductIds);
      if (products.length !== masterProductIds.length) throw referenceInvalid();

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
        throw new AppException(
          409,
          ErrorCodes.INVENTORY.SELLPIA_SYNC_REQUIRED,
          'A fresh Sellpia inventory snapshot is required before purchase.',
        );
      }

      if (products.some((product) => !product.isActive)) {
        throw new AppException(
          422,
          ErrorCodes.PURCHASE.ITEM_INACTIVE,
          'A purchase item is inactive in the Sellpia inventory snapshot.',
        );
      }

      return {
        fence: state.freshnessFence,
        lastVerifiedAt: state.lastVerifiedAt.toISOString(),
        expiresAt: new Date(
          state.lastVerifiedAt.getTime() + SELLPIA_FRESHNESS_TTL_MS,
        ).toISOString(),
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

import { randomUUID } from 'node:crypto';
import { AppException } from '@kiditem/shared/server-errors';
import { ErrorCodes } from '@kiditem/shared/errors';
import {
  BadRequestException,
  ConflictException,
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
  isSourceBindingConfirmed,
  planCancel,
  planClaim,
  planFailure,
  planHeartbeat,
  planOrderTransmissionFinalization,
  planRefreshRequest,
  planSourceBindingConfirmation,
  SELLPIA_FRESHNESS_TTL_MS,
  SELLPIA_SOURCE_ACCOUNT_KEY,
  SELLPIA_SOURCE_ORIGIN,
  toFreshnessView,
  type SellpiaInventoryFreshnessState,
} from '../../domain/policy/sellpia-inventory-freshness.policy';
import type {
  SellpiaInventoryClaimResponse,
  SellpiaInventoryCollectionFailureCode,
  SellpiaInventoryFreshnessView,
  SellpiaInventoryRefreshReason,
  SellpiaOrderTransmissionIntentAbortResponse,
  SellpiaOrderTransmissionIntentFinalizeResponse,
  SellpiaOrderTransmissionIntentPrepareResponse,
  SellpiaOrderTransmissionIntentReconcileRequest,
  SellpiaOrderTransmissionIntentReconcileResponse,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type { SellpiaInventoryFreshnessGatePort } from '../port/in/stock/sellpia-inventory-freshness-gate.port';
import type { SellpiaInventoryFreshnessPort } from '../port/in/stock/sellpia-inventory-freshness.port';
import type { SellpiaInventoryRefreshRequestPort } from '../port/in/stock/sellpia-inventory-refresh-request.port';

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

  async prepareOrderTransmissionIntent(input: ActorScope & {
    intentKey: string;
  }): Promise<SellpiaOrderTransmissionIntentPrepareResponse> {
    return this.withLockedState(input.organizationId, async (transaction) => {
      const now = new Date();
      const disposition = await transaction.prepareOrderTransmissionIntent({
        intentKey: input.intentKey,
        userId: input.userId,
        preparedAt: now,
      });
      if (disposition === 'not_owned') throw intentNotFound();
      const state = await transaction.getState();
      return {
        intentKey: input.intentKey,
        disposition,
        state: toFreshnessView(state, now, input.userId),
      };
    });
  }

  async finalizeOrderTransmissionIntent(input: ActorScope & {
    intentKey: string;
  }): Promise<SellpiaOrderTransmissionIntentFinalizeResponse> {
    return this.withLockedState(input.organizationId, async (transaction) => {
      const intent = await transaction.findOrderTransmissionIntent(
        input.intentKey,
        input.userId,
      );
      if (!intent) throw intentNotFound();
      const now = new Date();
      if (intent.status === 'finalized') {
        if (intent.finalizedGeneration === null) {
          throw new ConflictException('Finalized Sellpia order intent has no generation');
        }
        const state = await transaction.getState();
        return {
          intentKey: input.intentKey,
          status: 'finalized',
          finalizedGeneration: intent.finalizedGeneration.toString(),
          state: toFreshnessView(state, now, input.userId),
        };
      }
      if (intent.status !== 'prepared') {
        throw new ConflictException('Sellpia order transmission intent is not prepared');
      }

      const state = await transaction.getState();
      const patch = planOrderTransmissionFinalization(
        state,
        now,
        randomUUID(),
      );
      const finalizedGeneration = patch.requestedGeneration;
      if (finalizedGeneration === undefined) {
        throw new ConflictException('Sellpia order transmission generation was not planned');
      }
      await transaction.compareAndSetState({
        expected: expectation(state),
        patch,
      });
      await transaction.finalizeOrderTransmissionIntent({
        intentKey: input.intentKey,
        userId: input.userId,
        finalizedGeneration,
        finalizedAt: now,
      });
      const updated = await transaction.getState();
      return {
        intentKey: input.intentKey,
        status: 'finalized',
        finalizedGeneration: finalizedGeneration.toString(),
        state: toFreshnessView(updated, now, input.userId),
      };
    });
  }

  async abortOrderTransmissionIntent(input: ActorScope & {
    intentKey: string;
  }): Promise<SellpiaOrderTransmissionIntentAbortResponse> {
    return this.withLockedState(input.organizationId, async (transaction) => {
      const intent = await transaction.findOrderTransmissionIntent(
        input.intentKey,
        input.userId,
      );
      if (!intent) throw intentNotFound();
      if (intent.status === 'finalized') {
        throw new ConflictException('Finalized Sellpia order transmission cannot be aborted');
      }
      const now = new Date();
      if (intent.status === 'prepared') {
        await transaction.abortOrderTransmissionIntent({
          intentKey: input.intentKey,
          userId: input.userId,
          abortedAt: now,
        });
      }
      const state = await transaction.getState();
      return {
        intentKey: input.intentKey,
        status: 'aborted',
        state: toFreshnessView(state, now, input.userId),
      };
    });
  }

  async reconcileOrderTransmissionIntent(
    input: ActorScope & SellpiaOrderTransmissionIntentReconcileRequest,
  ): Promise<SellpiaOrderTransmissionIntentReconcileResponse> {
    const note = input.note.trim();
    if (!note || note.length > 500) {
      throw new BadRequestException('Reconciliation note must be 1-500 characters');
    }
    return this.withLockedState(input.organizationId, async (transaction) => {
      const intent = await transaction.findOrderTransmissionIntentForReconciliation(
        input.intentKey,
      );
      if (!intent) throw intentNotFound();
      const now = new Date();
      if (intent.status !== 'prepared') {
        const audit = intent.latestReconciliation;
        if (!audit || audit.outcome !== input.outcome) {
          throw new ConflictException('Sellpia order transmission is already resolved');
        }
        const state = await transaction.getState();
        return reconciliationResponse({
          intentKey: input.intentKey,
          status: intent.status,
          finalizedGeneration: intent.finalizedGeneration,
          audit,
          state: toFreshnessView(state, now, input.userId),
        });
      }

      let finalizedGeneration: bigint | null = null;
      if (input.outcome === 'submitted') {
        const state = await transaction.getState();
        const patch = planOrderTransmissionFinalization(state, now, randomUUID());
        finalizedGeneration = patch.requestedGeneration ?? null;
        if (finalizedGeneration === null) {
          throw new ConflictException('Sellpia order transmission generation was not planned');
        }
        await transaction.compareAndSetState({
          expected: expectation(state),
          patch,
        });
      }
      await transaction.reconcileOrderTransmissionIntent({
        intentKey: input.intentKey,
        userId: input.userId,
        reconciledAt: now,
        note,
        outcome: input.outcome,
        finalizedGeneration,
      });
      const updated = await transaction.getState();
      return reconciliationResponse({
        intentKey: input.intentKey,
        status: input.outcome === 'submitted' ? 'finalized' : 'aborted',
        finalizedGeneration,
        audit: {
          reconciledBy: input.userId,
          reconciledAt: now,
          note,
          outcome: input.outcome,
        },
        state: toFreshnessView(updated, now, input.userId),
      });
    });
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
    const snapshot = await this.readFreshProducts(input);
    if (snapshot.products.some((product) => !product.isActive)) {
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
    masterProductIds: string[];
  }): Promise<{
    fence: string;
    generation: string;
    lastVerifiedAt: string;
    expiresAt: string;
    products: Array<{
      masterProductId: string;
      currentStock: number;
      isActive: boolean;
    }>;
  }> {
    const snapshot = await this.readFreshProducts(input);
    const metadata = freshnessMetadata(snapshot.state);
    if (snapshot.state.verifiedGeneration === null) throw syncRequired();
    const byId = new Map(snapshot.products.map((product) => [product.id, product]));
    return {
      ...metadata,
      generation: snapshot.state.verifiedGeneration.toString(),
      products: snapshot.masterProductIds.map((masterProductId) => {
        const product = byId.get(masterProductId)!;
        return {
          masterProductId,
          currentStock: product.currentStock,
          isActive: product.isActive,
        };
      }),
    };
  }

  private readFreshProducts(input: {
    organizationId: string;
    masterProductIds: string[];
  }): Promise<{
    state: SellpiaInventoryFreshnessState;
    masterProductIds: string[];
    products: Array<{ id: string; isActive: boolean; currentStock: number }>;
  }> {
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
        throw syncRequired();
      }

      return {
        state,
        masterProductIds,
        products,
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

function intentNotFound(): NotFoundException {
  return new NotFoundException('Sellpia order transmission intent was not found');
}

function reconciliationResponse(input: {
  intentKey: string;
  status: 'finalized' | 'aborted';
  finalizedGeneration: bigint | null;
  audit: {
    reconciledBy: string;
    reconciledAt: Date;
    note: string;
    outcome: 'submitted' | 'not_submitted';
  };
  state: SellpiaInventoryFreshnessView;
}): SellpiaOrderTransmissionIntentReconcileResponse {
  const common = {
    intentKey: input.intentKey,
    reconciledBy: input.audit.reconciledBy,
    reconciledAt: input.audit.reconciledAt.toISOString(),
    note: input.audit.note,
    state: input.state,
  };
  if (input.audit.outcome === 'submitted') {
    if (input.status !== 'finalized' || input.finalizedGeneration === null) {
      throw new ConflictException('Submitted reconciliation has invalid terminal state');
    }
    return {
      ...common,
      outcome: 'submitted',
      status: 'finalized',
      finalizedGeneration: input.finalizedGeneration.toString(),
    };
  }
  if (input.status !== 'aborted' || input.finalizedGeneration !== null) {
    throw new ConflictException('Non-submitted reconciliation has invalid terminal state');
  }
  return {
    ...common,
    outcome: 'not_submitted',
    status: 'aborted',
    finalizedGeneration: null,
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

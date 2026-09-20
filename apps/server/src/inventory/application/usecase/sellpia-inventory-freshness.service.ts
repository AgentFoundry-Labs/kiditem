import { InventoryImportInputError, InventoryCollectionRequiredError, InventoryReferenceInvalidError } from '../exception/inventory-operation.error';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FactNotFoundError } from '../../../common/errors/fact-errors';
import {
  SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT,
  type SellpiaInventoryFreshnessRepositoryPort,
  type SellpiaInventoryFreshnessRepositoryTransaction,
  type SellpiaInventoryStateExpectation,
} from '../port/out/persistence/sellpia-inventory-freshness.repository.port';
import {
  createInitialCollectionState,
  hasLiveLease,
  isSourceBindingConfirmed,
  planSourceBindingConfirmation,
  SELLPIA_SOURCE_ACCOUNT_KEY,
  SELLPIA_SOURCE_ORIGIN,
  toCollectionStatusView,
  type SellpiaInventoryCollectionState,
} from '../../domain/policy/sellpia-inventory-freshness.policy';
import type {
  SellpiaInventoryCollectionStatusView,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type { SellpiaInventoryFreshnessGatePort } from '../port/in/stock/sellpia-inventory-freshness-gate.port';
import type { SellpiaInventoryCollectionStatusPort } from '../port/in/stock/sellpia-inventory-freshness.port';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

type ActorScope = { organizationId: string; userId: string };

@Injectable()
export class SellpiaInventoryFreshnessService
implements
  SellpiaInventoryCollectionStatusPort,
  SellpiaInventoryFreshnessGatePort {
  constructor(
    @Inject(SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT)
    private readonly repository: SellpiaInventoryFreshnessRepositoryPort,
  ) {}

  async getState(input: ActorScope): Promise<SellpiaInventoryCollectionStatusView> {
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
  }): Promise<SellpiaInventoryCollectionStatusView> {
    if (
      input.sourceOrigin !== SELLPIA_SOURCE_ORIGIN
      || input.sourceAccountKey !== SELLPIA_SOURCE_ACCOUNT_KEY
      || input.confirmed !== true
    ) {
      throw new InventoryImportInputError('Invalid Sellpia source binding');
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
    state: SellpiaInventoryCollectionState,
  ): Promise<SellpiaInventoryCollectionStatusView> {
    const now = new Date();
    const leaseAttemptId = hasLiveLease(state, now) && state.activeSyncToken
      ? await this.repository.findLeaseAttemptId({
        organizationId: input.organizationId,
        activeSyncToken: state.activeSyncToken,
      })
      : null;
    const lastAttemptId = this.repository.findLastAttemptId
      ? await this.repository.findLastAttemptId({ organizationId: input.organizationId })
      : leaseAttemptId ?? state.lastCompletedImportRunId;
    return toCollectionStatusView(state, now, input.userId, leaseAttemptId, lastAttemptId);
  }

  async requireCollectedStock(input: {
    organizationId: string;
    attemptId: string;
    sellpiaInventorySkuIds: string[];
  }) {
    if (!isUuid(input.attemptId)) throw referenceInvalid();
    validateInventorySkuIds(input.sellpiaInventorySkuIds);
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      if (state.lastCompletedImportRunId !== input.attemptId || state.lastVerifiedAt === null
        || !isSourceBindingConfirmed(state)
        || state.requestedGeneration !== state.verifiedGeneration
        || state.activeGeneration !== null) {
        throw syncRequired();
      }
      const availability = await readAvailability(transaction, [...new Set(input.sellpiaInventorySkuIds)]);
      if (
        !availability.snapshot.collected
        || availability.snapshot.generation !== state.verifiedGeneration.toString()
      ) {
        throw syncRequired();
      }
      return {
        attemptId: input.attemptId,
        fence: state.freshnessFence,
        generation: state.verifiedGeneration.toString(),
        completedAt: state.lastVerifiedAt.toISOString(),
        inventorySkus: availability.items.map(({ sellpiaInventorySkuId, currentStock }) => ({ sellpiaInventorySkuId, currentStock })),
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
        createInitialState: () => createInitialCollectionState({
          organizationId,
          now: new Date(),
          freshnessFence: randomUUID(),
        }),
      },
      operation,
    );
  }
}

function validateInventorySkuIds(sellpiaInventorySkuIds: string[]): void {
  if (sellpiaInventorySkuIds.some((id) => !isUuid(id))) {
    throw referenceInvalid();
  }
}

async function readAvailability(
  transaction: SellpiaInventoryFreshnessRepositoryTransaction,
  sellpiaInventorySkuIds: string[],
): Promise<InventoryAvailabilityBatch> {
  try {
    return await transaction.findInventoryAvailability(sellpiaInventorySkuIds);
  } catch (error) {
    if (error instanceof FactNotFoundError) throw referenceInvalid();
    throw error;
  }
}

function syncRequired(): InventoryCollectionRequiredError {
  return new InventoryCollectionRequiredError();
}

function expectation(
  state: SellpiaInventoryCollectionState,
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

function referenceInvalid(): InventoryReferenceInvalidError {
  return new InventoryReferenceInvalidError();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

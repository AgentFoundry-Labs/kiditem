import { ProductSourceInputError, ProductCollectionRequiredError, ProductSourceReferenceInvalidError } from '../exception/product-source.error';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FactNotFoundError } from '../../../common/errors/fact-errors';
import {
  PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT,
  type ProductCollectionFreshnessRepositoryPort,
  type ProductCollectionFreshnessRepositoryTransaction,
  type ProductSourceStateExpectation,
} from '../port/out/persistence/product-source-freshness.repository.port';
import {
  createInitialCollectionState,
  isSourceBindingConfirmed,
  planSourceBindingConfirmation,
  SELLPIA_SOURCE_ACCOUNT_KEY,
  SELLPIA_SOURCE_ORIGIN,
  toCollectionStatusView,
  type SellpiaInventoryCollectionState,
} from '../../domain/policy/product-source-freshness.policy';
import type {
  SellpiaInventoryCollectionStatusView,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type { ProductCollectionFreshnessGatePort } from '../port/in/product-collection-freshness-gate.port';
import type { SellpiaSourceAccountPort } from '../port/in/sellpia-source-account.port';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

type ActorScope = { organizationId: string; userId: string };

@Injectable()
export class ProductCollectionFreshnessUseCase
implements
  SellpiaSourceAccountPort,
  ProductCollectionFreshnessGatePort {
  constructor(
    @Inject(PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT)
    private readonly repository: ProductCollectionFreshnessRepositoryPort,
  ) {}

  async getCollectionState(input: ActorScope): Promise<SellpiaInventoryCollectionStatusView> {
    const state = await this.repository.readState(input.organizationId)
      ?? await this.withLockedState(
        input.organizationId,
        (transaction) => transaction.getState(),
      );
    return this.view(input, state);
  }

  async isSourceBindingConfirmed(organizationId: string): Promise<boolean> {
    const state = await this.repository.readState(organizationId);
    return state !== null && isSourceBindingConfirmed(state);
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
      throw new ProductSourceInputError('Invalid Sellpia source binding');
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

  // 계정 연결·마지막 발행은 원천 줄이, 도는 수집·실패는 셀피아 세 kind의 최신 실행이 말한다(ADR-0025, KID-355 정책 B).
  private async view(
    input: ActorScope,
    state: SellpiaInventoryCollectionState,
  ): Promise<SellpiaInventoryCollectionStatusView> {
    return toCollectionStatusView(state, await this.repository.readLatestSellpiaOperation(input.organizationId));
  }

  async requireCollectedStock(input: {
    organizationId: string;
    operationId: string;
    masterProductIds: string[];
  }) {
    if (!isUuid(input.operationId)) throw referenceInvalid();
    validateMasterProductIds(input.masterProductIds);
    return this.withLockedState(input.organizationId, async (transaction) => {
      const state = await transaction.getState();
      if (state.lastCompletedOperationId !== input.operationId || state.lastVerifiedAt === null
        || !isSourceBindingConfirmed(state)
        || state.requestedGeneration !== state.verifiedGeneration) {
        throw syncRequired();
      }
      const availability = await readProductAvailability(transaction, [...new Set(input.masterProductIds)]);
      if (
        !availability.snapshot.collected
        || availability.snapshot.generation !== state.verifiedGeneration.toString()
      ) {
        throw syncRequired();
      }
      return {
        operationId: input.operationId,
        fence: state.freshnessFence,
        generation: state.verifiedGeneration.toString(),
        completedAt: state.lastVerifiedAt.toISOString(),
        products: availability.items.map(({ masterProductId, currentStock }) => ({
          masterProductId,
          currentStock,
        })),
      };
    });
  }

  private withLockedState<T>(
    organizationId: string,
    operation: (
      transaction: ProductCollectionFreshnessRepositoryTransaction,
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

function validateMasterProductIds(masterProductIds: string[]): void {
  if (masterProductIds.some((id) => !isUuid(id))) {
    throw referenceInvalid();
  }
}

async function readProductAvailability(
  transaction: ProductCollectionFreshnessRepositoryTransaction,
  masterProductIds: string[],
): Promise<InventoryAvailabilityBatch> {
  try {
    return await transaction.findProductAvailability(masterProductIds);
  } catch (error) {
    if (error instanceof FactNotFoundError) throw referenceInvalid();
    throw error;
  }
}

function syncRequired(): ProductCollectionRequiredError {
  return new ProductCollectionRequiredError();
}

function expectation(
  state: SellpiaInventoryCollectionState,
): ProductSourceStateExpectation {
  return {
    freshnessFence: state.freshnessFence,
    requestedGeneration: state.requestedGeneration,
  };
}

function referenceInvalid(): ProductSourceReferenceInvalidError {
  return new ProductSourceReferenceInvalidError();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

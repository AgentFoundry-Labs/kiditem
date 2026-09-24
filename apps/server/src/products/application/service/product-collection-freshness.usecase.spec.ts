import { describe, expect, it } from 'vitest';
import { ProductCollectionFreshnessUseCase } from './product-collection-freshness.usecase';
import {
  createInitialCollectionState,
  type SellpiaInventoryCollectionState,
} from '../../domain/policy/product-source-freshness.policy';
import type {
  ProductCollectionFreshnessRepositoryPort,
  ProductCollectionFreshnessRepositoryTransaction,
  ProductSourceStateExpectation,
  ProductSourceStatePatch,
} from '../port/out/persistence/product-source-freshness.repository.port';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';
const MASTER_PRODUCT_ID = '00000000-0000-4000-8000-000000000003';

describe('ProductCollectionFreshnessUseCase', () => {
  it('returns stock only for the exact completed source attempt generation', async () => {
    const repository = new MemoryRepository();
    repository.state = makeState({
      sourceAccountKey: 'kiditem',
      lastCompletedImportRunId: ATTEMPT_ID,
      lastVerifiedAt: new Date('2026-07-15T00:00:01.000Z'),
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
    });
    const useCase = new ProductCollectionFreshnessUseCase(repository);

    await expect(useCase.requireCollectedStock({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      masterProductIds: [MASTER_PRODUCT_ID],
    })).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      fence: repository.state.freshnessFence,
      generation: '4',
      completedAt: '2026-07-15T00:00:01.000Z',
      products: [{ masterProductId: MASTER_PRODUCT_ID, currentStock: 7 }],
    });
  });

  it('rejects a source attempt after a newer generation is requested', async () => {
    const repository = new MemoryRepository();
    repository.state = makeState({
      sourceAccountKey: 'kiditem',
      lastCompletedImportRunId: ATTEMPT_ID,
      lastVerifiedAt: new Date('2026-07-15T00:00:01.000Z'),
      requestedGeneration: 5n,
      verifiedGeneration: 4n,
    });
    const useCase = new ProductCollectionFreshnessUseCase(repository);

    await expect(useCase.requireCollectedStock({
      organizationId: ORGANIZATION_ID,
      attemptId: ATTEMPT_ID,
      masterProductIds: [MASTER_PRODUCT_ID],
    })).rejects.toMatchObject({ code: 'SELLPIA_SYNC_REQUIRED' });
  });
});

class MemoryRepository implements ProductCollectionFreshnessRepositoryPort {
  state = makeState();
  readonly availability: InventoryAvailabilityBatch = {
    snapshot: {
      collected: true,
      generation: '4',
      verifiedAt: '2026-07-15T00:00:01.000Z',
    },
    items: [{
      masterProductId: MASTER_PRODUCT_ID,
      currentStock: 7,
      generation: '4',
    }],
  };

  readState(): Promise<SellpiaInventoryCollectionState | null> {
    return Promise.resolve(this.state);
  }

  findLeaseAttemptId(): Promise<string | null> {
    return Promise.resolve(null);
  }

  withLockedState<T>(
    input: { createInitialState: () => SellpiaInventoryCollectionState },
    operation: (transaction: ProductCollectionFreshnessRepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const transaction: ProductCollectionFreshnessRepositoryTransaction = {
      getState: async () => this.state ?? input.createInitialState(),
      compareAndSetState: async (change: {
        expected: ProductSourceStateExpectation;
        patch: ProductSourceStatePatch;
      }) => {
        this.state = { ...this.state, ...change.patch };
        return this.state;
      },
      findProductAvailability: async (masterProductIds) => ({
        ...this.availability,
        items: this.availability.items.filter(({ masterProductId }) =>
          masterProductIds.includes(masterProductId),
        ),
      }),
    };
    return operation(transaction);
  }
}

function makeState(
  overrides: Partial<SellpiaInventoryCollectionState> = {},
): SellpiaInventoryCollectionState {
  return {
    ...createInitialCollectionState({
      organizationId: ORGANIZATION_ID,
      now: new Date('2026-07-15T00:00:00.000Z'),
      freshnessFence: '00000000-0000-4000-8000-000000000004',
    }),
    ...overrides,
  };
}

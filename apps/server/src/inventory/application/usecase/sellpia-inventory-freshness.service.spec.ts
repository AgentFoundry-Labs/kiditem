import { describe, expect, it } from 'vitest';
import { SellpiaInventoryFreshnessService } from './sellpia-inventory-freshness.service';
import {
  createInitialCollectionState,
  type SellpiaInventoryCollectionState,
} from '../../domain/policy/sellpia-inventory-freshness.policy';
import type {
  SellpiaInventoryFreshnessRepositoryPort,
  SellpiaInventoryFreshnessRepositoryTransaction,
  SellpiaInventoryStateExpectation,
  SellpiaInventoryStatePatch,
} from '../port/out/persistence/sellpia-inventory-freshness.repository.port';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000002';
const SKU_ID = '00000000-0000-4000-8000-000000000003';

describe('SellpiaInventoryFreshnessService collection capability', () => {
  it('requires the exact completed current generation and returns current stock only', async () => {
    const repository = new MemoryRepository();
    repository.state = state({
      sourceAccountKey: 'kiditem',
      lastCompletedImportRunId: ATTEMPT_ID,
      lastVerifiedAt: new Date('2026-07-15T00:00:01.000Z'),
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
    });
    repository.attemptId = ATTEMPT_ID;
    const service = new SellpiaInventoryFreshnessService(repository);

    await expect(service.requireCollectedStock({
      organizationId: ORG_ID,
      attemptId: ATTEMPT_ID,
      sellpiaInventorySkuIds: [SKU_ID],
    })).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      fence: repository.state.freshnessFence,
      generation: '4',
      completedAt: '2026-07-15T00:00:01.000Z',
      inventorySkus: [{ sellpiaInventorySkuId: SKU_ID, currentStock: 7 }],
    });
  });

  it('accepts an exact completed attempt with no SKU references', async () => {
    const repository = new MemoryRepository();
    repository.state = state({
      sourceAccountKey: 'kiditem',
      lastCompletedImportRunId: ATTEMPT_ID,
      lastVerifiedAt: new Date('2026-07-15T00:00:01.000Z'),
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
    });
    const service = new SellpiaInventoryFreshnessService(repository);

    await expect(service.requireCollectedStock({
      organizationId: ORG_ID,
      attemptId: ATTEMPT_ID,
      sellpiaInventorySkuIds: [],
    })).resolves.toMatchObject({
      attemptId: ATTEMPT_ID,
      generation: '4',
      inventorySkus: [],
    });
  });

  it('rejects a completed attempt after a newer generation is requested', async () => {
    const repository = new MemoryRepository();
    repository.state = state({
      sourceAccountKey: 'kiditem',
      lastCompletedImportRunId: ATTEMPT_ID,
      lastVerifiedAt: new Date('2026-07-15T00:00:01.000Z'),
      requestedGeneration: 5n,
      verifiedGeneration: 4n,
    });
    const service = new SellpiaInventoryFreshnessService(repository);

    await expect(service.requireCollectedStock({
      organizationId: ORG_ID,
      attemptId: ATTEMPT_ID,
      sellpiaInventorySkuIds: [SKU_ID],
    })).rejects.toMatchObject({ code: 'SELLPIA_SYNC_REQUIRED' });
  });

  it('publishes collection status with the latest attempt identity', async () => {
    const repository = new MemoryRepository();
    repository.state = state();
    repository.attemptId = ATTEMPT_ID;
    const service = new SellpiaInventoryFreshnessService(repository);

    await expect(service.getState({ organizationId: ORG_ID, userId: ORG_ID }))
      .resolves.toMatchObject({
        status: 'not_collected',
        lastCompletedAttemptId: null,
        lastAttemptId: ATTEMPT_ID,
      });
  });
});

class MemoryRepository implements SellpiaInventoryFreshnessRepositoryPort {
  state = state();
  attemptId: string | null = null;
  readonly availability: InventoryAvailabilityBatch = {
    snapshot: {
      collected: true,
      generation: '4',
      verifiedAt: '2026-07-15T00:00:01.000Z',
    },
    items: [{ sellpiaInventorySkuId: SKU_ID, currentStock: 7, generation: '4' }],
  };

  readState(): Promise<SellpiaInventoryCollectionState | null> {
    return Promise.resolve(this.state);
  }

  findLeaseAttemptId(): Promise<string | null> {
    return Promise.resolve(this.attemptId);
  }

  findLastAttemptId(): Promise<string | null> {
    return Promise.resolve(this.attemptId);
  }

  withLockedState<T>(input: {
    createInitialState: () => SellpiaInventoryCollectionState;
  }, operation: (transaction: SellpiaInventoryFreshnessRepositoryTransaction) => Promise<T>): Promise<T> {
    if (!this.state) this.state = input.createInitialState();
    const transaction: SellpiaInventoryFreshnessRepositoryTransaction = {
      getState: async () => this.state,
      compareAndSetState: async (change: {
        expected: SellpiaInventoryStateExpectation;
        patch: SellpiaInventoryStatePatch;
      }) => {
        this.state = { ...this.state, ...change.patch };
        return this.state;
      },
      findInventoryAvailability: async (sellpiaInventorySkuIds) => ({
        ...this.availability,
        items: this.availability.items.filter(({ sellpiaInventorySkuId }) =>
          sellpiaInventorySkuIds.includes(sellpiaInventorySkuId)),
      }),
    };
    return operation(transaction);
  }
}

function state(overrides: Partial<SellpiaInventoryCollectionState> = {}): SellpiaInventoryCollectionState {
  return {
    ...createInitialCollectionState({
      organizationId: ORG_ID,
      now: new Date('2026-07-15T00:00:00.000Z'),
      freshnessFence: '00000000-0000-4000-8000-000000000004',
    }),
    ...overrides,
  };
}

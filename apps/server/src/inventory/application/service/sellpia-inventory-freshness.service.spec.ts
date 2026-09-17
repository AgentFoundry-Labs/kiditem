import { AppException } from '@kiditem/shared/server-errors';
import { FactNotFoundError } from '../../../common/errors/fact-errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellpiaInventoryFreshnessService } from './sellpia-inventory-freshness.service';
import type { SellpiaInventoryFreshnessState } from '../../domain/policy/sellpia-inventory-freshness.policy';
import type {
  SellpiaInventoryFreshnessRepositoryPort,
  SellpiaInventoryFreshnessRepositoryTransaction,
  SellpiaInventoryStateExpectation,
  SellpiaInventoryStatePatch,
} from '../port/out/repository/sellpia-inventory-freshness.repository.port';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000004';
const SKU_ID = '00000000-0000-4000-8000-000000000005';
const FOREIGN_SKU_ID = '00000000-0000-4000-8000-000000000006';

describe('SellpiaInventoryFreshnessService', () => {
  let repository: MemoryFreshnessRepository;
  let service: SellpiaInventoryFreshnessService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
    repository = new MemoryFreshnessRepository();
    service = new SellpiaInventoryFreshnessService(repository);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lazy-initializes once without advancing generation on later GETs', async () => {
    const first = await service.getState({ organizationId: ORG_ID, userId: USER_ID });
    vi.setSystemTime(new Date('2026-07-15T00:02:00.000Z'));
    const second = await service.getState({ organizationId: ORG_ID, userId: USER_ID });

    expect(first).toMatchObject({
      status: 'refresh_required',
      sourceBinding: {
        origin: 'https://kiditem.sellpia.com',
        accountKey: null,
        confirmed: false,
      },
      requestedGeneration: '1',
      verifiedGeneration: '0',
      refreshReason: 'initial_snapshot',
    });
    expect(second.requestedGeneration).toBe('1');
    expect(repository.initializeCount).toBe(1);
    expect(repository.readCount).toBe(2);
    expect(repository.lockCount).toBe(1);
  });

  it('timestamps lazy initialization after the organization lock is acquired', async () => {
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:00:30.000Z'));
    };

    const view = await service.getState({ organizationId: ORG_ID, userId: USER_ID });

    expect(view.refreshRequestedAt).toBe('2026-07-15T00:00:30.000Z');
  });

  it('derives GET freshness without acquiring the mutation lock for existing state', async () => {
    repository.seedState({
      lastVerifiedAt: new Date('2026-07-14T23:50:00.001Z'),
    });
    vi.setSystemTime(new Date('2026-07-15T00:00:00.001Z'));

    const view = await service.getState({ organizationId: ORG_ID, userId: USER_ID });

    expect(view.status).toBe('refresh_required');
    expect(repository.readCount).toBe(1);
    expect(repository.lockCount).toBe(0);
  });

  it('serializes BigInt generations as decimal strings', async () => {
    repository.seedState({
      requestedGeneration: 9_007_199_254_740_993n,
      verifiedGeneration: 9_007_199_254_740_992n,
    });

    const state = await service.getState({ organizationId: ORG_ID, userId: USER_ID });

    expect(state.requestedGeneration).toBe('9007199254740993');
    expect(state.verifiedGeneration).toBe('9007199254740992');
  });

  it('rejects a snapshot crossing the exact ttl while waiting for the lock', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:50:00.001Z'),
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, true);
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:00:00.001Z'));
    };

    await expectCode(
      service.assertFreshAndActive({
        organizationId: ORG_ID,
        sellpiaInventorySkuIds: [SKU_ID],
      }),
      'SELLPIA_SYNC_REQUIRED',
    );
  });

  it('rejects empty and malformed references before entering the lock', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
    });

    await expectCode(
      service.assertFreshAndActive({
        organizationId: ORG_ID,
        sellpiaInventorySkuIds: [],
      }),
      'PURCHASE_REFERENCE_INVALID',
    );
    await expectCode(
      service.assertFreshAndActive({
        organizationId: ORG_ID,
        sellpiaInventorySkuIds: ['not-a-uuid'],
      }),
      'PURCHASE_REFERENCE_INVALID',
    );
    expect(repository.lockCount).toBe(0);
  });

  it('rejects stale missing and foreign references before freshness', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
    });
    repository.seedInventorySku(OTHER_ORG_ID, FOREIGN_SKU_ID, true);

    await expectCode(
      service.assertFreshAndActive({
        organizationId: ORG_ID,
        sellpiaInventorySkuIds: [SKU_ID],
      }),
      'PURCHASE_REFERENCE_INVALID',
    );
    await expectCode(
      service.assertFreshAndActive({
        organizationId: ORG_ID,
        sellpiaInventorySkuIds: [FOREIGN_SKU_ID],
      }),
      'PURCHASE_REFERENCE_INVALID',
    );
  });

  it('keeps freshness ahead of inactive status for a valid reference', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, false);

    await expectCode(
      service.assertFreshAndActive({
        organizationId: ORG_ID,
        sellpiaInventorySkuIds: [SKU_ID],
      }),
      'SELLPIA_SYNC_REQUIRED',
    );
  });

  it('separates stale, inactive, and cross-tenant purchase failures', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, true);
    await expectCode(
      service.assertFreshAndActive({ organizationId: ORG_ID, sellpiaInventorySkuIds: [SKU_ID] }),
      'SELLPIA_SYNC_REQUIRED',
    );

    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, false);
    await expectCode(
      service.assertFreshAndActive({ organizationId: ORG_ID, sellpiaInventorySkuIds: [SKU_ID] }),
      'PURCHASE_ITEM_INACTIVE',
    );

    repository.seedInventorySku(OTHER_ORG_ID, FOREIGN_SKU_ID, true);
    await expectCode(
      service.assertFreshAndActive({
        organizationId: ORG_ID,
        sellpiaInventorySkuIds: [FOREIGN_SKU_ID],
      }),
      'PURCHASE_REFERENCE_INVALID',
    );
  });

  it('deduplicates purchase item IDs and returns the freshness fence', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
      freshnessFence: '00000000-0000-4000-8000-000000000200',
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, true);

    await expect(service.assertFreshAndActive({
      organizationId: ORG_ID,
      sellpiaInventorySkuIds: [SKU_ID, SKU_ID],
    })).resolves.toEqual({
      fence: '00000000-0000-4000-8000-000000000200',
      lastVerifiedAt: '2026-07-14T23:59:00.000Z',
      expiresAt: '2026-07-15T00:09:00.000Z',
    });
    expect(repository.lastInventorySkuIds).toEqual([SKU_ID]);
  });

  it('reads component stock under the same Inventory-owned freshness lock', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
      verifiedGeneration: 7n,
      freshnessFence: '00000000-0000-4000-8000-000000000207',
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, true, 100);
    const capacityReader = service as unknown as {
      readFreshCapacity(input: {
        organizationId: string;
        sellpiaInventorySkuIds: string[];
      }): Promise<unknown>;
    };

    expect(typeof capacityReader.readFreshCapacity).toBe('function');
    await expect(capacityReader.readFreshCapacity({
      organizationId: ORG_ID,
      sellpiaInventorySkuIds: [SKU_ID, SKU_ID],
    })).resolves.toEqual({
      fence: '00000000-0000-4000-8000-000000000207',
      generation: '7',
      lastVerifiedAt: '2026-07-14T23:59:00.000Z',
      expiresAt: '2026-07-15T00:09:00.000Z',
      inventorySkus: [{
        sellpiaInventorySkuId: SKU_ID,
        currentStock: 100,
        availableStock: 100,
        isActive: true,
      }],
    });
  });

  it('returns fresh component capacity without advancing the generation', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
      requestedGeneration: 7n,
      verifiedGeneration: 7n,
      freshnessFence: '00000000-0000-4000-8000-000000000217',
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, true, 100);

    await expect(readFreshCapacityOrRequest(service, [SKU_ID, SKU_ID]))
      .resolves.toEqual({
        status: 'fresh',
        fence: '00000000-0000-4000-8000-000000000217',
        generation: '7',
        lastVerifiedAt: '2026-07-14T23:59:00.000Z',
        expiresAt: '2026-07-15T00:09:00.000Z',
        inventorySkus: [{
          sellpiaInventorySkuId: SKU_ID,
          currentStock: 100,
          availableStock: 100,
          isActive: true,
        }],
      });
    expect(repository.state(ORG_ID).requestedGeneration).toBe(7n);
    expect(repository.lastInventorySkuIds).toEqual([SKU_ID]);
  });

  it('schedules a purchase preflight generation without exposing stale stock', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:49:00.000Z'),
      requestedGeneration: 7n,
      verifiedGeneration: 7n,
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, true, 100);

    await expect(readFreshCapacityOrRequest(service, [SKU_ID])).resolves.toEqual({
      status: 'refresh_required',
      requestedGeneration: '8',
    });
    expect(repository.state(ORG_ID)).toMatchObject({
      requestedGeneration: 8n,
      refreshReason: 'purchase_preflight',
      refreshRequestedAt: new Date('2026-07-15T00:00:00.000Z'),
      syncNotBefore: new Date('2026-07-15T00:00:00.000Z'),
    });
  });

  it('joins an active or already-pending generation without scheduling another refresh', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 8n,
      verifiedGeneration: 7n,
      activeGeneration: 8n,
      activeSyncToken: '00000000-0000-4000-8000-000000000218',
      activeSyncOwnerUserId: USER_ID,
      activeSyncStartedAt: new Date('2026-07-15T00:00:00.000Z'),
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
      refreshRequestedAt: new Date('2026-07-15T00:00:00.000Z'),
      refreshReason: 'manual_request',
      syncNotBefore: new Date('2026-07-15T00:00:00.000Z'),
    });
    repository.seedInventorySku(ORG_ID, SKU_ID, true, 100);

    await expect(readFreshCapacityOrRequest(service, [SKU_ID])).resolves.toEqual({
      status: 'refresh_required',
      requestedGeneration: '8',
    });
    expect(repository.state(ORG_ID).requestedGeneration).toBe(8n);

    repository.seedState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 9n,
      verifiedGeneration: 8n,
      activeGeneration: null,
      activeSyncToken: null,
      activeSyncOwnerUserId: null,
      activeSyncStartedAt: null,
      activeSyncLeaseExpiresAt: null,
      failedGeneration: 9n,
      lastAttemptAt: new Date('2026-07-15T00:00:00.000Z'),
      refreshRequestedAt: new Date('2026-07-15T00:00:00.000Z'),
      refreshReason: 'purchase_preflight',
    });

    await expect(readFreshCapacityOrRequest(service, [SKU_ID])).resolves.toEqual({
      status: 'refresh_required',
      requestedGeneration: '9',
    });
    expect(repository.state(ORG_ID).requestedGeneration).toBe(9n);
  });

  it('rejects invalid preflight references before acquiring the freshness lock', async () => {
    await expectCode(
      readFreshCapacityOrRequest(service, []),
      'PURCHASE_REFERENCE_INVALID',
    );
    await expectCode(
      readFreshCapacityOrRequest(service, ['not-a-uuid']),
      'PURCHASE_REFERENCE_INVALID',
    );
    expect(repository.lockCount).toBe(0);
  });
});

function readFreshCapacityOrRequest(
  service: SellpiaInventoryFreshnessService,
  sellpiaInventorySkuIds: string[],
): Promise<unknown> {
  return (service as unknown as {
    readFreshCapacityOrRequest(input: {
      organizationId: string;
      sellpiaInventorySkuIds: string[];
    }): Promise<unknown>;
  }).readFreshCapacityOrRequest({ organizationId: ORG_ID, sellpiaInventorySkuIds });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error('expected AppException');
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
  }
}

class MemoryFreshnessRepository
implements SellpiaInventoryFreshnessRepositoryPort {
  private readonly states = new Map<string, SellpiaInventoryFreshnessState>();
  private readonly inventorySkus = new Map<
    string,
    Map<string, {
      isActive: boolean;
      currentStock: number;
    }>
  >();
  private tail: Promise<void> = Promise.resolve();
  initializeCount = 0;
  readCount = 0;
  lockCount = 0;
  onLockAcquired: (() => void) | null = null;
  lastInventorySkuIds: string[] = [];

  async readState(
    organizationId: string,
  ): Promise<SellpiaInventoryFreshnessState | null> {
    this.readCount += 1;
    const state = this.states.get(organizationId);
    return state ? { ...state } : null;
  }

  async findLeaseAttemptId(): Promise<string | null> {
    return null;
  }

  async withLockedState<T>(
    input: {
      organizationId: string;
      createInitialState: () => SellpiaInventoryFreshnessState;
    },
    operation: (
      transaction: SellpiaInventoryFreshnessRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      this.lockCount += 1;
      this.onLockAcquired?.();
      if (!this.states.has(input.organizationId)) {
        this.states.set(input.organizationId, { ...input.createInitialState() });
        this.initializeCount += 1;
      }
      return await operation(new MemoryFreshnessTransaction(this, input.organizationId));
    } finally {
      release();
    }
  }

  seedState(overrides: Partial<SellpiaInventoryFreshnessState>) {
    this.states.set(ORG_ID, makeState(ORG_ID, overrides));
  }

  seedPendingState() {
    this.seedState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      refreshRequestedAt: new Date(),
      refreshReason: 'manual_request',
      syncNotBefore: new Date(),
    });
  }

  seedInventorySku(
    organizationId: string,
    id: string,
    isActive: boolean,
    currentStock = 0,
  ) {
    const byOrganization = this.inventorySkus.get(organizationId) ?? new Map();
    byOrganization.set(id, { isActive, currentStock });
    this.inventorySkus.set(organizationId, byOrganization);
  }

  state(organizationId: string): SellpiaInventoryFreshnessState {
    const state = this.states.get(organizationId);
    if (!state) throw new Error('state not seeded');
    return { ...state };
  }

  compareAndSet(
    organizationId: string,
    expected: SellpiaInventoryStateExpectation,
    patch: SellpiaInventoryStatePatch,
  ): SellpiaInventoryFreshnessState {
    const state = this.state(organizationId);
    for (const [key, value] of Object.entries(expected)) {
      const current = state[key as keyof SellpiaInventoryFreshnessState];
      const equal = current instanceof Date && value instanceof Date
        ? current.getTime() === value.getTime()
        : current === value;
    if (!equal) throw new Error('freshness compare-and-swap lost');
    }
    const updated = { ...state, ...patch };
    this.states.set(organizationId, updated);
    return updated;
  }

  findInventoryAvailability(organizationId: string, ids: string[]) {
    this.lastInventorySkuIds = ids;
    const byOrganization = this.inventorySkus.get(organizationId) ?? new Map();
    const items = ids.flatMap((id) => {
      const sku = byOrganization.get(id);
      return sku === undefined ? [] : [{
        sellpiaInventorySkuId: id,
        currentStock: sku.currentStock,
        availableStock: sku.currentStock,
        isActive: sku.isActive,
        generation: this.state(organizationId).verifiedGeneration.toString(),
      }];
    });
    if (items.length !== ids.length) {
      throw new FactNotFoundError('One or more Sellpia inventory SKUs were not found in this organization');
    }
    const state = this.state(organizationId);
    return {
      snapshot: {
        collected: state.verifiedGeneration > 0n && state.lastVerifiedAt !== null,
        generation: state.verifiedGeneration > 0n
          ? state.verifiedGeneration.toString()
          : null,
        verifiedAt: state.lastVerifiedAt?.toISOString() ?? null,
      },
      items,
    };
  }
}

class MemoryFreshnessTransaction
implements SellpiaInventoryFreshnessRepositoryTransaction {
  constructor(
    private readonly repository: MemoryFreshnessRepository,
    private readonly organizationId: string,
  ) {}

  async getState(): Promise<SellpiaInventoryFreshnessState> {
    return this.repository.state(this.organizationId);
  }

  async compareAndSetState(input: {
    expected: SellpiaInventoryStateExpectation;
    patch: SellpiaInventoryStatePatch;
  }): Promise<SellpiaInventoryFreshnessState> {
    return this.repository.compareAndSet(
      this.organizationId,
      input.expected,
      input.patch,
    );
  }

  async findInventoryAvailability(sellpiaInventorySkuIds: string[]) {
    return this.repository.findInventoryAvailability(
      this.organizationId,
      sellpiaInventorySkuIds,
    );
  }
}

function makeState(
  organizationId: string,
  overrides: Partial<SellpiaInventoryFreshnessState> = {},
): SellpiaInventoryFreshnessState {
  return {
    organizationId,
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
    lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    lastCompletedImportRunId: null,
    refreshRequestedAt: null,
    refreshReason: 'legacy_manual_import',
    requestedSyncScope: 'inventory',
    syncNotBefore: null,
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    activeSyncScope: null,
    requestedGeneration: 1n,
    activeGeneration: null,
    verifiedGeneration: 1n,
    failedGeneration: null,
    lastAttemptAt: null,
    lastAttemptSyncScope: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    freshnessFence: '00000000-0000-4000-8000-000000000099',
    ...overrides,
  };
}

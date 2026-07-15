import { AppException } from '@kiditem/shared/server-errors';
import { ConflictException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FailedSellpiaInventoryAttempt,
  SellpiaInventoryFreshnessRepositoryPort,
  SellpiaInventoryFreshnessRepositoryTransaction,
  SellpiaInventoryStateExpectation,
  SellpiaInventoryStatePatch,
} from '../port/out/repository/sellpia-inventory-freshness.repository.port';
import type { SellpiaInventoryFreshnessState } from '../../domain/policy/sellpia-inventory-freshness.policy';
import { SellpiaInventoryFreshnessService } from './sellpia-inventory-freshness.service';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000004';
const MASTER_ID = '00000000-0000-4000-8000-000000000005';
const FOREIGN_MASTER_ID = '00000000-0000-4000-8000-000000000006';

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

  it('coalesces order transmissions and caps syncNotBefore at five minutes', async () => {
    vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
    repository.seedState({
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    await service.requestRefresh({
      organizationId: ORG_ID,
      userId: USER_ID,
      reason: 'order_transmission_requested',
    });
    vi.setSystemTime(new Date('2026-07-15T00:04:30.000Z'));
    const view = await service.requestRefresh({
      organizationId: ORG_ID,
      userId: USER_ID,
      reason: 'order_transmission_requested',
    });
    expect(view.syncNotBefore).toBe('2026-07-15T00:05:00.000Z');
    expect(view.requestedGeneration).toBe('2');
  });

  it('atomically creates only one ttl_expired generation for concurrent claimers', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 7n,
      verifiedGeneration: 7n,
      lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
    });

    const claims = await Promise.all([
      service.claimDue({ organizationId: ORG_ID, userId: USER_ID }),
      service.claimDue({ organizationId: ORG_ID, userId: OTHER_USER_ID }),
    ]);

    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.claimed)).toHaveLength(1);
    expect(repository.state(ORG_ID)).toMatchObject({
      requestedGeneration: 8n,
      activeGeneration: 8n,
      refreshReason: 'ttl_expired',
    });
  });

  it('joins one pending follow-up request during an active generation', async () => {
    repository.seedState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: '00000000-0000-4000-8000-000000000100',
      activeSyncOwnerUserId: USER_ID,
      activeSyncStartedAt: new Date(),
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
    });

    const first = await service.requestRefresh({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      reason: 'manual_request',
    });
    const joined = await service.requestRefresh({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      reason: 'manual_request',
    });

    expect(first.requestedGeneration).toBe('3');
    expect(joined.requestedGeneration).toBe('3');
    expect(joined.activeSync?.canControl).toBe(false);
  });

  it('moves a failed request to a new retry generation', async () => {
    repository.seedState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      failedGeneration: 2n,
      lastAttemptAt: new Date('2026-07-14T23:59:00.000Z'),
      lastAttemptStatus: 'failed',
      lastErrorCode: 'sellpia_network_failed',
      lastErrorMessage: 'network failed',
    });

    const view = await service.requestRefresh({
      organizationId: ORG_ID,
      userId: USER_ID,
      reason: 'retry',
    });

    expect(view).toMatchObject({
      status: 'refresh_required',
      requestedGeneration: '3',
      verifiedGeneration: '1',
      refreshReason: 'retry',
    });
  });

  it('claims only when due and blocks claims until source binding is confirmed', async () => {
    repository.seedState({
      sourceAccountKey: null,
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      syncNotBefore: new Date('2026-07-15T00:01:00.000Z'),
    });

    expect(await service.claimDue({ organizationId: ORG_ID, userId: USER_ID }))
      .toMatchObject({ claimed: false });
    await service.confirmSourceBinding({
      organizationId: ORG_ID,
      userId: USER_ID,
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    });
    expect(await service.claimDue({ organizationId: ORG_ID, userId: USER_ID }))
      .toMatchObject({ claimed: false });

    vi.setSystemTime(new Date('2026-07-15T00:01:00.000Z'));
    expect(await service.claimDue({ organizationId: ORG_ID, userId: USER_ID }))
      .toMatchObject({
        claimed: true,
        activeGeneration: '2',
        leaseExpiresAt: '2026-07-15T00:02:30.000Z',
      });
  });

  it('allows only the live lease owner to heartbeat, fail, or cancel', async () => {
    repository.seedPendingState();
    const claim = await service.claimDue({ organizationId: ORG_ID, userId: USER_ID });
    if (!claim.claimed) throw new Error('expected winning claim');

    await expect(service.heartbeat({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      claimToken: claim.claimToken,
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.fail({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      claimToken: claim.claimToken,
      errorCode: 'sellpia_network_failed',
      errorMessage: 'other user',
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.cancel({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      claimToken: claim.claimToken,
    })).rejects.toBeInstanceOf(ConflictException);

    vi.setSystemTime(new Date('2026-07-15T00:00:20.000Z'));
    const heartbeat = await service.heartbeat({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken: claim.claimToken,
    });
    expect(heartbeat.activeSync?.leaseExpiresAt).toBe(
      '2026-07-15T00:01:50.000Z',
    );
    const cancelled = await service.cancel({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken: claim.claimToken,
    });
    expect(cancelled).toMatchObject({
      status: 'refresh_required',
      activeSync: null,
      requestedGeneration: '2',
      verifiedGeneration: '1',
    });
  });

  it('records a bounded failed run once and makes repeated fail idempotent', async () => {
    repository.seedPendingState();
    const claim = await service.claimDue({ organizationId: ORG_ID, userId: USER_ID });
    if (!claim.claimed) throw new Error('expected winning claim');
    const message = `  ${'failure '.repeat(60)}  `;

    const first = await service.fail({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken: claim.claimToken,
      errorCode: 'sellpia_network_failed',
      errorMessage: message,
    });
    const repeated = await service.fail({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken: claim.claimToken,
      errorCode: 'sellpia_network_failed',
      errorMessage: message,
    });

    expect(first.status).toBe('failed');
    expect(repeated).toEqual(first);
    expect(repository.failedAttempts).toHaveLength(1);
    expect(repository.failedAttempts[0]).toMatchObject({
      organizationId: ORG_ID,
      generation: 2n,
      claimToken: claim.claimToken,
      createdBy: USER_ID,
    });
    expect(repository.failedAttempts[0]?.errorMessage).toHaveLength(300);
  });

  it('lets another user reclaim at the exact lease expiry boundary', async () => {
    repository.seedPendingState();
    const first = await service.claimDue({ organizationId: ORG_ID, userId: USER_ID });
    expect(first.claimed).toBe(true);

    vi.setSystemTime(new Date('2026-07-15T00:01:30.000Z'));
    const reclaimed = await service.claimDue({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
    });

    expect(reclaimed).toMatchObject({
      claimed: true,
      activeGeneration: '2',
      state: { activeSync: { canControl: true } },
    });
    expect(repository.state(ORG_ID).activeSyncOwnerUserId).toBe(OTHER_USER_ID);
  });

  it('separates stale, inactive, and cross-tenant purchase failures', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:50:00.000Z'),
    });
    repository.seedMaster(ORG_ID, MASTER_ID, true);
    await expectCode(
      service.assertFreshAndActive({ organizationId: ORG_ID, masterProductIds: [MASTER_ID] }),
      'SELLPIA_SYNC_REQUIRED',
    );

    repository.seedState({
      sourceAccountKey: 'kiditem',
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    repository.seedMaster(ORG_ID, MASTER_ID, false);
    await expectCode(
      service.assertFreshAndActive({ organizationId: ORG_ID, masterProductIds: [MASTER_ID] }),
      'PURCHASE_ITEM_INACTIVE',
    );

    repository.seedMaster(OTHER_ORG_ID, FOREIGN_MASTER_ID, true);
    await expectCode(
      service.assertFreshAndActive({
        organizationId: ORG_ID,
        masterProductIds: [FOREIGN_MASTER_ID],
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
    repository.seedMaster(ORG_ID, MASTER_ID, true);

    await expect(service.assertFreshAndActive({
      organizationId: ORG_ID,
      masterProductIds: [MASTER_ID, MASTER_ID],
    })).resolves.toEqual({
      fence: '00000000-0000-4000-8000-000000000200',
      lastVerifiedAt: '2026-07-14T23:59:00.000Z',
      expiresAt: '2026-07-15T00:09:00.000Z',
    });
    expect(repository.lastMasterProductIds).toEqual([MASTER_ID]);
  });
});

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
  private readonly masters = new Map<string, Map<string, boolean>>();
  private tail: Promise<void> = Promise.resolve();
  initializeCount = 0;
  failedAttempts: FailedSellpiaInventoryAttempt[] = [];
  lastMasterProductIds: string[] = [];

  async withLockedState<T>(
    input: {
      organizationId: string;
      initialState: SellpiaInventoryFreshnessState;
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
      if (!this.states.has(input.organizationId)) {
        this.states.set(input.organizationId, { ...input.initialState });
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

  seedMaster(organizationId: string, id: string, isActive: boolean) {
    const byOrganization = this.masters.get(organizationId) ?? new Map();
    byOrganization.set(id, isActive);
    this.masters.set(organizationId, byOrganization);
  }

  state(organizationId: string): SellpiaInventoryFreshnessState {
    const state = this.states.get(organizationId);
    if (!state) throw new Error('state not seeded');
    return state;
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
      if (!equal) throw new ConflictException('freshness compare-and-swap lost');
    }
    const updated = { ...state, ...patch };
    this.states.set(organizationId, updated);
    return updated;
  }

  hasFailedAttempt(
    organizationId: string,
    claimToken: string,
    createdBy: string,
  ): boolean {
    return this.failedAttempts.some(
      (attempt) => attempt.organizationId === organizationId
        && attempt.claimToken === claimToken
        && attempt.createdBy === createdBy,
    );
  }

  upsertFailedAttempt(attempt: FailedSellpiaInventoryAttempt) {
    if (this.failedAttempts.some(
      (existing) => existing.organizationId === attempt.organizationId
        && existing.generation === attempt.generation,
    )) return;
    this.failedAttempts.push(attempt);
  }

  findMasters(organizationId: string, ids: string[]) {
    this.lastMasterProductIds = ids;
    const byOrganization = this.masters.get(organizationId) ?? new Map();
    return ids.flatMap((id) => {
      const isActive = byOrganization.get(id);
      return isActive === undefined ? [] : [{ id, isActive }];
    });
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

  async hasFailedAttempt(input: {
    claimToken: string;
    createdBy: string;
  }): Promise<boolean> {
    return this.repository.hasFailedAttempt(
      this.organizationId,
      input.claimToken,
      input.createdBy,
    );
  }

  async upsertFailedAttempt(input: FailedSellpiaInventoryAttempt): Promise<void> {
    this.repository.upsertFailedAttempt(input);
  }

  async findMasterProducts(
    masterProductIds: string[],
  ): Promise<Array<{ id: string; isActive: boolean }>> {
    return this.repository.findMasters(this.organizationId, masterProductIds);
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
    syncNotBefore: null,
    activeSyncToken: null,
    activeSyncOwnerUserId: null,
    activeSyncStartedAt: null,
    activeSyncLeaseExpiresAt: null,
    requestedGeneration: 1n,
    activeGeneration: null,
    verifiedGeneration: 1n,
    failedGeneration: null,
    lastAttemptAt: null,
    lastAttemptStatus: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    freshnessFence: '00000000-0000-4000-8000-000000000099',
    ...overrides,
  };
}

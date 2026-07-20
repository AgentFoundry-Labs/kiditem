import { AppException } from '@kiditem/shared/server-errors';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellpiaInventoryFreshnessService } from './sellpia-inventory-freshness.service';
import type {
  FailedSellpiaInventoryAttempt,
  SellpiaInventoryFreshnessRepositoryPort,
  SellpiaInventoryFreshnessRepositoryTransaction,
  SellpiaInventoryStateExpectation,
  SellpiaInventoryStatePatch,
} from '../port/out/repository/sellpia-inventory-freshness.repository.port';
import type { SellpiaInventoryFreshnessState } from '../../domain/policy/sellpia-inventory-freshness.policy';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ORG_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000004';
const SKU_ID = '00000000-0000-4000-8000-000000000005';
const FOREIGN_SKU_ID = '00000000-0000-4000-8000-000000000006';
const INTENT_KEY = '1721000000000-kidkids-browser';

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

  it('timestamps lazy initialization after the organization lock is acquired', async () => {
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:00:30.000Z'));
    };

    const view = await service.getState({ organizationId: ORG_ID, userId: USER_ID });

    expect(view.refreshRequestedAt).toBe('2026-07-15T00:00:30.000Z');
  });

  it('derives GET freshness from the time the lock is acquired', async () => {
    repository.seedState({
      lastVerifiedAt: new Date('2026-07-14T23:50:00.001Z'),
    });
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:00:00.001Z'));
    };

    const view = await service.getState({ organizationId: ORG_ID, userId: USER_ID });

    expect(view.status).toBe('refresh_required');
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

  it('starts an order settle window from the time the lock is acquired', async () => {
    repository.seedState({
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:00:30.000Z'));
    };

    const view = await service.requestRefresh({
      organizationId: ORG_ID,
      userId: USER_ID,
      reason: 'order_transmission_requested',
    });

    expect(view).toMatchObject({
      refreshRequestedAt: '2026-07-15T00:00:30.000Z',
      syncNotBefore: '2026-07-15T00:02:30.000Z',
    });
  });

  it('prepares one idempotent intent without duplicate unresolved counts', async () => {
    repository.seedState({
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    const first = await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });
    const repeated = await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });

    expect(first).toMatchObject({ disposition: 'prepared', state: { status: 'refresh_required' } });
    expect(repeated).toMatchObject({
      disposition: 'already_prepared',
      state: { status: 'refresh_required' },
    });
    expect(repository.unresolvedIntentCount(ORG_ID)).toBe(1);
  });

  it('keeps a crashed tab stale and prevents a collection claim', async () => {
    repository.seedState({
      sourceAccountKey: 'kiditem',
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });

    await expect(service.getState({ organizationId: ORG_ID, userId: USER_ID }))
      .resolves.toMatchObject({ status: 'refresh_required' });
    await expect(service.claimDue({ organizationId: ORG_ID, userId: USER_ID }))
      .resolves.toMatchObject({ claimed: false });
  });

  it('finalizes exactly once into a generation after a concurrent sync completion', async () => {
    repository.seedState({
      requestedGeneration: 3n,
      verifiedGeneration: 2n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });
    repository.seedState({
      requestedGeneration: 3n,
      verifiedGeneration: 3n,
      lastVerifiedAt: new Date('2026-07-15T00:00:30.000Z'),
    });

    const first = await service.finalizeOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });
    const retried = await service.finalizeOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });

    expect(first).toMatchObject({
      finalizedGeneration: '4',
      state: { requestedGeneration: '4', status: 'refresh_required' },
    });
    expect(retried.finalizedGeneration).toBe('4');
    expect(repository.state(ORG_ID).requestedGeneration).toBe(4n);
    expect(repository.unresolvedIntentCount(ORG_ID)).toBe(0);
  });

  it('scopes identical intent keys by organization and rejects cross-org finalize', async () => {
    await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });
    await expect(service.finalizeOrderTransmissionIntent({
      organizationId: OTHER_ORG_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);

    await expect(service.prepareOrderTransmissionIntent({
      organizationId: OTHER_ORG_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
    })).resolves.toMatchObject({ disposition: 'prepared' });
    expect(repository.unresolvedIntentCount(ORG_ID)).toBe(1);
    expect(repository.unresolvedIntentCount(OTHER_ORG_ID)).toBe(1);
  });

  it('allows only the creator to finalize, abort, or read a finalized generation', async () => {
    await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });

    await expect(service.abortOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.finalizeOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);

    await service.finalizeOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });
    await expect(service.finalizeOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let another user adopt an existing intent through prepare idempotency', async () => {
    await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });

    await expect(service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.unresolvedIntentCount(ORG_ID)).toBe(1);
  });

  it('reconciles an unknown submission as submitted with one durable audit', async () => {
    const reconcile = (service as unknown as {
      reconcileOrderTransmissionIntent?: (input: {
        organizationId: string;
        userId: string;
        intentKey: string;
        outcome: 'submitted' | 'not_submitted';
        note: string;
      }) => Promise<{
        status: string;
        outcome: string;
        finalizedGeneration: string | null;
        reconciledBy: string;
        note: string;
      }>;
    }).reconcileOrderTransmissionIntent;
    expect(reconcile).toBeTypeOf('function');
    if (!reconcile) return;
    repository.seedState({
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });

    const input = {
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
      outcome: 'submitted' as const,
      note: 'Sellpia 주문 내역에서 접수 확인',
    };
    const first = await reconcile.call(service, input);
    const repeated = await reconcile.call(service, input);

    expect(first).toMatchObject({
      status: 'finalized',
      outcome: 'submitted',
      finalizedGeneration: '5',
      reconciledBy: OTHER_USER_ID,
      note: input.note,
    });
    expect(repeated).toEqual(first);
    expect(repository.unresolvedIntentCount(ORG_ID)).toBe(0);
    expect(repository.reconciliationAudits).toHaveLength(1);
  });

  it('reconciles an unknown submission as not submitted without advancing generation', async () => {
    const reconcile = (service as unknown as {
      reconcileOrderTransmissionIntent?: (input: {
        organizationId: string;
        userId: string;
        intentKey: string;
        outcome: 'submitted' | 'not_submitted';
        note: string;
      }) => Promise<{ status: string; finalizedGeneration: string | null }>;
    }).reconcileOrderTransmissionIntent;
    expect(reconcile).toBeTypeOf('function');
    if (!reconcile) return;
    repository.seedState({
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });

    await expect(reconcile.call(service, {
      organizationId: ORG_ID,
      userId: OTHER_USER_ID,
      intentKey: INTENT_KEY,
      outcome: 'not_submitted',
      note: 'Sellpia 주문 내역에서 미접수 확인',
    })).resolves.toMatchObject({
      status: 'aborted',
      finalizedGeneration: null,
    });
    expect(repository.state(ORG_ID).requestedGeneration).toBe(4n);
    expect(repository.unresolvedIntentCount(ORG_ID)).toBe(0);
    expect(repository.reconciliationAudits).toHaveLength(1);
  });

  it('aborts an explicit non-submit idempotently and reopens it for a safe retry', async () => {
    repository.seedState({
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: new Date('2026-07-14T23:59:00.000Z'),
    });
    await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });
    const aborted = await service.abortOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });
    const repeatedAbort = await service.abortOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });
    const reopened = await service.prepareOrderTransmissionIntent({
      organizationId: ORG_ID,
      userId: USER_ID,
      intentKey: INTENT_KEY,
    });

    expect(aborted).toMatchObject({ status: 'aborted', state: { status: 'fresh' } });
    expect(repeatedAbort.status).toBe('aborted');
    expect(reopened).toMatchObject({
      disposition: 'prepared',
      state: { status: 'refresh_required' },
    });
    expect(repository.unresolvedIntentCount(ORG_ID)).toBe(1);
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

  it('blocks an ownerless future lease and reclaims it at exact expiry', async () => {
    repository.seedState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: '00000000-0000-4000-8000-000000000101',
      activeSyncOwnerUserId: null,
      activeSyncStartedAt: new Date('2026-07-15T00:00:00.000Z'),
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
    });

    await expect(service.claimDue({ organizationId: ORG_ID, userId: USER_ID }))
      .resolves.toMatchObject({ claimed: false });

    vi.setSystemTime(new Date('2026-07-15T00:01:30.000Z'));
    await expect(service.claimDue({ organizationId: ORG_ID, userId: USER_ID }))
      .resolves.toMatchObject({
        claimed: true,
        activeGeneration: '2',
        state: { activeSync: { canControl: true } },
      });
  });

  it('starts a claim lease from the time the lock is acquired', async () => {
    repository.seedPendingState();
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:00:45.000Z'));
    };

    await expect(service.claimDue({ organizationId: ORG_ID, userId: USER_ID }))
      .resolves.toMatchObject({
        claimed: true,
        leaseExpiresAt: '2026-07-15T00:02:15.000Z',
      });
  });

  it('starts a heartbeat lease extension from the time the lock is acquired', async () => {
    const claimToken = '00000000-0000-4000-8000-000000000102';
    repository.seedState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: claimToken,
      activeSyncOwnerUserId: USER_ID,
      activeSyncStartedAt: new Date('2026-07-15T00:00:00.000Z'),
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
    });
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:00:20.000Z'));
    };

    const view = await service.heartbeat({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken,
    });

    expect(view.activeSync?.leaseExpiresAt).toBe('2026-07-15T00:01:50.000Z');
  });

  it('does not revive a lease that expires while waiting for the lock', async () => {
    const claimToken = '00000000-0000-4000-8000-000000000103';
    vi.setSystemTime(new Date('2026-07-15T00:01:29.999Z'));
    repository.seedState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: claimToken,
      activeSyncOwnerUserId: USER_ID,
      activeSyncStartedAt: new Date('2026-07-15T00:00:00.000Z'),
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
    });
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:01:30.000Z'));
    };

    await expect(service.heartbeat({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not fail or cancel a lease that expires while waiting for the lock', async () => {
    const claimToken = '00000000-0000-4000-8000-000000000104';
    vi.setSystemTime(new Date('2026-07-15T00:01:29.999Z'));
    repository.seedState({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncToken: claimToken,
      activeSyncOwnerUserId: USER_ID,
      activeSyncStartedAt: new Date('2026-07-15T00:00:00.000Z'),
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:30.000Z'),
    });
    repository.onLockAcquired = () => {
      vi.setSystemTime(new Date('2026-07-15T00:01:30.000Z'));
    };

    await expect(service.fail({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken,
      errorCode: 'sellpia_network_failed',
      errorMessage: 'expired while waiting',
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.cancel({
      organizationId: ORG_ID,
      userId: USER_ID,
      claimToken,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(repository.failedAttempts).toHaveLength(0);
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
    repository.seedInventorySku(ORG_ID, SKU_ID, true, 100, 80);
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
        activeCommitmentQuantity: 80,
        availableStock: 20,
        isActive: true,
      }],
    });
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
  private readonly inventorySkus = new Map<
    string,
    Map<string, {
      isActive: boolean;
      currentStock: number;
      activeCommitmentQuantity: number;
    }>
  >();
  private tail: Promise<void> = Promise.resolve();
  private readonly intents = new Map<
    string,
    Map<string, {
      status: 'prepared' | 'finalized' | 'aborted';
      finalizedGeneration: bigint | null;
      createdBy: string;
    }>
  >();
  initializeCount = 0;
  lockCount = 0;
  onLockAcquired: (() => void) | null = null;
  failedAttempts: FailedSellpiaInventoryAttempt[] = [];
  reconciliationAudits: Array<{
    organizationId: string;
    intentKey: string;
    reconciledBy: string;
    reconciledAt: Date;
    note: string;
    outcome: 'submitted' | 'not_submitted';
  }> = [];
  lastInventorySkuIds: string[] = [];

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
    activeCommitmentQuantity = 0,
  ) {
    const byOrganization = this.inventorySkus.get(organizationId) ?? new Map();
    byOrganization.set(id, { isActive, currentStock, activeCommitmentQuantity });
    this.inventorySkus.set(organizationId, byOrganization);
  }

  state(organizationId: string): SellpiaInventoryFreshnessState {
    const state = this.states.get(organizationId);
    if (!state) throw new Error('state not seeded');
    return {
      ...state,
      unresolvedOrderTransmissionIntentCount:
        this.unresolvedIntentCount(organizationId),
    };
  }

  unresolvedIntentCount(organizationId: string): number {
    return [...(this.intents.get(organizationId)?.values() ?? [])]
      .filter((intent) => intent.status === 'prepared').length;
  }

  prepareIntent(organizationId: string, intentKey: string, userId: string) {
    const byOrganization = this.intents.get(organizationId) ?? new Map();
    const existing = byOrganization.get(intentKey);
    if (existing && existing.createdBy !== userId) return 'not_owned' as const;
    if (existing?.status === 'prepared') return 'already_prepared' as const;
    if (existing?.status === 'finalized') return 'already_finalized' as const;
    byOrganization.set(intentKey, {
      status: 'prepared',
      finalizedGeneration: null,
      createdBy: userId,
    });
    this.intents.set(organizationId, byOrganization);
    return 'prepared' as const;
  }

  findIntent(organizationId: string, intentKey: string, userId?: string) {
    const intent = this.intents.get(organizationId)?.get(intentKey) ?? null;
    return intent && (userId === undefined || intent.createdBy === userId)
      ? intent
      : null;
  }

  finalizeIntent(
    organizationId: string,
    intentKey: string,
    userId: string,
    generation: bigint,
  ) {
    const intent = this.findIntent(organizationId, intentKey, userId);
    if (!intent || intent.status !== 'prepared') {
      throw new ConflictException('intent is not prepared');
    }
    intent.status = 'finalized';
    intent.finalizedGeneration = generation;
  }

  abortIntent(organizationId: string, intentKey: string, userId: string) {
    const intent = this.findIntent(organizationId, intentKey, userId);
    if (!intent) throw new NotFoundException('intent not found');
    if (intent.status === 'finalized') {
      throw new ConflictException('finalized intent cannot be aborted');
    }
    intent.status = 'aborted';
  }

  findIntentForReconciliation(organizationId: string, intentKey: string) {
    const intent = this.findIntent(organizationId, intentKey);
    if (!intent) return null;
    const latestReconciliation = [...this.reconciliationAudits]
      .reverse()
      .find((audit) => audit.organizationId === organizationId
        && audit.intentKey === intentKey) ?? null;
    return { ...intent, latestReconciliation };
  }

  reconcileIntent(
    organizationId: string,
    input: {
      intentKey: string;
      userId: string;
      reconciledAt: Date;
      note: string;
      outcome: 'submitted' | 'not_submitted';
      finalizedGeneration: bigint | null;
    },
  ) {
    const intent = this.findIntent(organizationId, input.intentKey);
    if (!intent || intent.status !== 'prepared') {
      throw new ConflictException('intent is not prepared');
    }
    intent.status = input.outcome === 'submitted' ? 'finalized' : 'aborted';
    intent.finalizedGeneration = input.finalizedGeneration;
    this.reconciliationAudits.push({
      organizationId,
      intentKey: input.intentKey,
      reconciledBy: input.userId,
      reconciledAt: input.reconciledAt,
      note: input.note,
      outcome: input.outcome,
    });
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

  findInventorySkus(organizationId: string, ids: string[]) {
    this.lastInventorySkuIds = ids;
    const byOrganization = this.inventorySkus.get(organizationId) ?? new Map();
    return ids.flatMap((id) => {
      const sku = byOrganization.get(id);
      return sku === undefined ? [] : [{ id, ...sku }];
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

  async prepareOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    preparedAt: Date;
  }): Promise<
    'prepared' | 'already_prepared' | 'already_finalized' | 'not_owned'
  > {
    return this.repository.prepareIntent(
      this.organizationId,
      input.intentKey,
      input.userId,
    );
  }

  async findOrderTransmissionIntent(intentKey: string, userId: string): Promise<{
    status: 'prepared' | 'finalized' | 'aborted';
    finalizedGeneration: bigint | null;
  } | null> {
    return this.repository.findIntent(this.organizationId, intentKey, userId);
  }

  async finalizeOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    finalizedGeneration: bigint;
    finalizedAt: Date;
  }): Promise<void> {
    this.repository.finalizeIntent(
      this.organizationId,
      input.intentKey,
      input.userId,
      input.finalizedGeneration,
    );
  }

  async abortOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    abortedAt: Date;
  }): Promise<void> {
    this.repository.abortIntent(this.organizationId, input.intentKey, input.userId);
  }

  async findOrderTransmissionIntentForReconciliation(intentKey: string) {
    return this.repository.findIntentForReconciliation(
      this.organizationId,
      intentKey,
    );
  }

  async reconcileOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    reconciledAt: Date;
    note: string;
    outcome: 'submitted' | 'not_submitted';
    finalizedGeneration: bigint | null;
  }): Promise<void> {
    this.repository.reconcileIntent(this.organizationId, input);
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

  async findInventorySkus(
    sellpiaInventorySkuIds: string[],
  ): Promise<Array<{
    id: string;
    isActive: boolean;
    currentStock: number;
    activeCommitmentQuantity: number;
  }>> {
    return this.repository.findInventorySkus(
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
    unresolvedOrderTransmissionIntentCount: 0,
    ...overrides,
  };
}

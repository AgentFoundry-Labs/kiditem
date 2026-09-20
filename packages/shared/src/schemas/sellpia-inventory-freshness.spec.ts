import { describe, expect, it } from 'vitest';
import {
  deriveSellpiaInventoryCollectionStatus,
  isSellpiaInventoryCollectionStopped,
  SELLPIA_INVENTORY_COLLECTION_STATUSES,
  SELLPIA_INVENTORY_COLLECTION_TRIGGERS,
  SellpiaInventoryCollectionStatusViewSchema,
} from './sellpia-inventory-freshness';

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001';

const view = (patch: Record<string, unknown> = {}) => ({
  status: 'complete' as const,
  sourceBinding: {
    origin: 'https://kiditem.sellpia.com' as const,
    accountKey: 'kiditem' as const,
    confirmed: true,
  },
  requestedGeneration: '4',
  verifiedGeneration: '4',
  lastCompletedAttemptId: ATTEMPT_ID,
  lastCompletedAt: '2026-07-15T00:00:01.000Z',
  lastAttemptId: ATTEMPT_ID,
  activeSync: null,
  lastAttempt: null,
  ...patch,
});

describe('Sellpia inventory collection status vocabulary', () => {
  it('has no age-based status or trigger', () => {
    expect(SELLPIA_INVENTORY_COLLECTION_STATUSES).toEqual([
      'not_collected',
      'running',
      'complete',
      'failed',
    ]);
    expect(SELLPIA_INVENTORY_COLLECTION_TRIGGERS).not.toContain('ttl_expired');
    expect(SELLPIA_INVENTORY_COLLECTION_TRIGGERS).not.toContain('purchase_preflight');
  });

  it('derives state from collection facts and ignores elapsed time', () => {
    expect(deriveSellpiaInventoryCollectionStatus({
      now: new Date('2036-01-01T00:00:00.000Z'),
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: new Date('2036-01-01T00:00:01.000Z'),
    })).toBe('running');
    expect(deriveSellpiaInventoryCollectionStatus({
      now: new Date('2036-01-01T00:00:00.000Z'),
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      failedGeneration: 2n,
      activeSyncLeaseExpiresAt: null,
    })).toBe('failed');
    expect(deriveSellpiaInventoryCollectionStatus({
      now: new Date('2036-01-01T00:00:00.000Z'),
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: null,
    })).toBe('complete');
    expect(deriveSellpiaInventoryCollectionStatus({
      now: new Date('2036-01-01T00:00:00.000Z'),
      requestedGeneration: 1n,
      verifiedGeneration: 0n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: null,
    })).toBe('not_collected');
  });
});

describe('SellpiaInventoryCollectionStatusViewSchema', () => {
  it('publishes completion identity and rejects freshness fields', () => {
    const parsed = SellpiaInventoryCollectionStatusViewSchema.parse(view());
    expect(parsed.lastCompletedAttemptId).toBe(ATTEMPT_ID);
    expect(parsed.lastAttemptId).toBe(ATTEMPT_ID);
    expect(() => SellpiaInventoryCollectionStatusViewSchema.parse({
      ...view(),
      expiresAt: '2026-07-15T00:10:01.000Z',
    })).toThrow();
    expect(() => SellpiaInventoryCollectionStatusViewSchema.parse({
      ...view(),
      lastVerifiedAt: '2026-07-15T00:00:01.000Z',
    })).toThrow();
  });

  it('keeps source binding and lease details strict', () => {
    expect(SellpiaInventoryCollectionStatusViewSchema.parse({
      ...view({
        status: 'running',
        activeSync: {
          attemptId: ATTEMPT_ID,
          generation: '5',
          scope: 'inventory',
          startedAt: '2026-07-15T00:02:00.000Z',
          leaseExpiresAt: '2026-07-15T00:03:30.000Z',
          canControl: true,
        },
        lastAttempt: {
          attemptedAt: '2026-07-15T00:01:00.000Z',
          trigger: 'manual_request',
          scope: 'inventory',
          errorCode: null,
          errorMessage: null,
        },
      }),
    }).activeSync?.attemptId).toBe(ATTEMPT_ID);
    expect(() => SellpiaInventoryCollectionStatusViewSchema.parse({
      ...view(),
      sourceBinding: {
        origin: 'https://other.sellpia.com',
        accountKey: 'kiditem',
        confirmed: true,
      },
    })).toThrow();
  });
});

describe('isSellpiaInventoryCollectionStopped', () => {
  it('recognizes a stopped attempt after the last completed snapshot', () => {
    expect(isSellpiaInventoryCollectionStopped(view({
      lastAttempt: {
        attemptedAt: '2026-07-15T00:05:00.000Z',
        trigger: 'manual_request',
        scope: 'inventory',
        errorCode: null,
        errorMessage: null,
      },
    }))).toBe(true);
  });

  it('does not classify a failed or completed attempt as stopped', () => {
    const attempt = {
      attemptedAt: '2026-07-15T00:05:00.000Z',
      trigger: 'manual_request',
      scope: 'inventory',
      errorCode: 'sellpia_network_failed',
      errorMessage: 'Network request failed',
    };
    expect(isSellpiaInventoryCollectionStopped(view({ lastAttempt: attempt }))).toBe(false);
    expect(isSellpiaInventoryCollectionStopped(view({
      status: 'failed',
      lastAttempt: { ...attempt, errorCode: null, errorMessage: null },
    }))).toBe(false);
  });
});

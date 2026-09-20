import { describe, expect, it } from 'vitest';
import {
  createInitialCollectionState,
  deriveCollectionStatus,
  planCollectionRequest,
  toCollectionStatusView,
  type SellpiaInventoryCollectionState,
} from './sellpia-inventory-freshness.policy';

const NOW = new Date('2026-07-15T00:00:00.000Z');
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001';

function state(overrides: Partial<SellpiaInventoryCollectionState> = {}) {
  return {
    ...createInitialCollectionState({
      organizationId: '00000000-0000-4000-8000-000000000099',
      now: NOW,
      freshnessFence: '00000000-0000-4000-8000-000000000002',
    }),
    ...overrides,
  };
}

describe('Sellpia inventory collection policy', () => {
  it('derives running, failed, uncollected and complete from generation facts', () => {
    expect(deriveCollectionStatus(state({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      activeGeneration: 2n,
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:01:00.000Z'),
    }), NOW)).toBe('running');
    expect(deriveCollectionStatus(state({
      requestedGeneration: 2n,
      verifiedGeneration: 1n,
      failedGeneration: 2n,
    }), NOW)).toBe('failed');
    expect(deriveCollectionStatus(state(), NOW)).toBe('not_collected');
    expect(deriveCollectionStatus(state({
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: new Date('2020-01-01T00:00:00.000Z'),
    }), new Date('2030-01-01T00:00:00.000Z'))).toBe('complete');
  });

  it('advances a manual collection generation without an age rule', () => {
    const patch = planCollectionRequest(
      state({ requestedGeneration: 1n, verifiedGeneration: 1n }),
      'manual_request',
      'inventory',
      NOW,
      '00000000-0000-4000-8000-000000000003',
    );
    expect(patch).toMatchObject({
      requestedGeneration: 2n,
      refreshReason: 'manual_request',
    });
  });

  it('publishes completion identity and never emits an expiry field', () => {
    const published = state({
      requestedGeneration: 1n,
      verifiedGeneration: 1n,
      lastVerifiedAt: new Date('2026-07-15T00:00:01.000Z'),
      lastCompletedImportRunId: ATTEMPT_ID,
      lastAttemptAt: new Date('2026-07-15T00:00:01.000Z'),
      refreshReason: 'manual_request',
    });
    const view = toCollectionStatusView(published, NOW, null, null, ATTEMPT_ID);
    expect(view).toMatchObject({
      status: 'complete',
      lastCompletedAttemptId: ATTEMPT_ID,
      lastCompletedAt: '2026-07-15T00:00:01.000Z',
      lastAttemptId: ATTEMPT_ID,
    });
    expect(view).not.toHaveProperty('expiresAt');
    expect(view).not.toHaveProperty('lastVerifiedAt');
  });
});

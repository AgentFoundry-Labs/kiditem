import { describe, expect, it, vi } from 'vitest';
import type {
  RocketPurchasePreviewFreshnessPendingResponse,
  RocketPurchasePreviewReadyResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  recoverRocketPreviewFreshness,
  ROCKET_FRESHNESS_MAX_POLLS,
  ROCKET_FRESHNESS_POLL_MS,
} from './rocket-preview-freshness-recovery';

const pending = {
  status: 'freshness_pending',
  collectionRunId: '11111111-1111-4111-8111-111111111111',
  catalog: { run: { id: 'saved-run-1' } },
  requestedGeneration: '8',
  rows: [],
} as RocketPurchasePreviewFreshnessPendingResponse;

const ready = {
  status: 'ready',
  collectionRunId: pending.collectionRunId,
  catalog: pending.catalog,
  inventoryGeneration: '8',
  rows: [],
} as RocketPurchasePreviewReadyResponse;

function freshness(overrides: Record<string, unknown> = {}) {
  return {
    status: 'syncing' as const,
    verifiedGeneration: '7',
    requestedGeneration: '8',
    sourceBinding: {
      origin: 'https://kiditem.sellpia.com' as const,
      accountKey: 'kiditem' as const,
      confirmed: true as const,
    },
    lastAttempt: null,
    unresolvedOrderTransmissionIntents: [],
    hasMoreUnresolvedOrderTransmissionIntents: false,
    ...overrides,
  };
}

function dependencies() {
  return {
    retryPreview: vi.fn().mockResolvedValue(ready),
    getFreshnessState: vi.fn()
      .mockResolvedValueOnce(freshness())
      .mockResolvedValueOnce(freshness({ status: 'fresh', verifiedGeneration: '8' })),
    requestRetry: vi.fn().mockResolvedValue(
      freshness({ status: 'refresh_required', requestedGeneration: '9' }),
    ),
    publishPending: vi.fn(),
    publishFreshnessState: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    maxPolls: 3,
  };
}

describe('recoverRocketPreviewFreshness', () => {
  it('publishes advisory rows before waiting and retries after the target generation', async () => {
    const deps = dependencies();

    await expect(recoverRocketPreviewFreshness(pending, deps)).resolves.toBe(ready);

    expect(deps.publishPending).toHaveBeenCalledWith(pending);
    expect(deps.getFreshnessState).toHaveBeenCalledTimes(2);
    expect(deps.retryPreview).toHaveBeenCalledTimes(1);
  });

  it('does not treat an unrelated unresolved order file as an inventory blocker', async () => {
    const deps = dependencies();
    deps.getFreshnessState.mockReset().mockResolvedValue(freshness({
      status: 'fresh',
      verifiedGeneration: '8',
      unresolvedOrderTransmissionIntents: [{
        intentKey: 'orders-1',
        preparedAt: '2026-07-28T00:00:00.000Z',
      }],
    }));

    await expect(recoverRocketPreviewFreshness(pending, deps)).resolves.toBe(ready);
    expect(deps.retryPreview).toHaveBeenCalledOnce();
  });

  it('stops when the Sellpia source binding needs operator attention', async () => {
    const deps = dependencies();
    deps.getFreshnessState.mockReset().mockResolvedValue(freshness({
      sourceBinding: {
        origin: 'https://kiditem.sellpia.com',
        accountKey: null,
        confirmed: false,
      },
    }));

    await expect(recoverRocketPreviewFreshness(pending, deps))
      .rejects.toMatchObject({ code: 'attention_required' });
  });

  it('uses a fifteen-minute bounded wait', () => {
    expect(ROCKET_FRESHNESS_POLL_MS * ROCKET_FRESHNESS_MAX_POLLS)
      .toBe(15 * 60 * 1_000);
  });
});

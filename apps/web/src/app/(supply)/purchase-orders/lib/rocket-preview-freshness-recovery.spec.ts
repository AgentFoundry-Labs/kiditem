import { describe, expect, it, vi } from 'vitest';
import type {
  RocketPurchasePreviewFreshnessPendingResponse,
  RocketPurchasePreviewReadyResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  recoverRocketPreviewFreshness,
  RocketPreviewFreshnessRecoveryError,
  ROCKET_FRESHNESS_MAX_POLLS,
  ROCKET_FRESHNESS_POLL_MS,
} from './rocket-preview-freshness-recovery';

const pending = {
  status: 'freshness_pending',
  collectionRunId: '11111111-1111-4111-8111-111111111111',
  catalog: { run: { id: 'saved-run-1' } },
  requestedGeneration: '8',
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
      .mockResolvedValueOnce(freshness({
        status: 'fresh',
        verifiedGeneration: '8',
      })),
    requestRetry: vi.fn().mockResolvedValue(freshness({
      status: 'refresh_required',
      requestedGeneration: '9',
    })),
    publishPending: vi.fn(),
    publishFreshnessState: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    maxPolls: 3,
  };
}

describe('recoverRocketPreviewFreshness', () => {
  it('keeps a ready response on the fast path without polling', async () => {
    const deps = dependencies();

    await expect(recoverRocketPreviewFreshness(ready, deps))
      .resolves.toBe(ready);

    expect(deps.publishPending).not.toHaveBeenCalled();
    expect(deps.getFreshnessState).not.toHaveBeenCalled();
    expect(deps.retryPreview).not.toHaveBeenCalled();
  });

  it('publishes the durable checkpoint, wakes the coordinator, and retries once', async () => {
    const deps = dependencies();
    const events: string[] = [];
    deps.publishPending.mockImplementation(() => { events.push('checkpoint'); });
    deps.publishFreshnessState.mockImplementation(() => { events.push('wake'); });
    deps.getFreshnessState.mockReset().mockImplementationOnce(async () => {
      events.push('poll-1');
      return freshness();
    }).mockImplementationOnce(async () => {
      events.push('poll-2');
      return freshness({ status: 'fresh', verifiedGeneration: '8' });
    });
    deps.retryPreview.mockImplementation(async () => {
      events.push('retry-preview');
      return ready;
    });

    await expect(recoverRocketPreviewFreshness(pending, deps))
      .resolves.toBe(ready);

    expect(events).toEqual([
      'checkpoint',
      'wake',
      'poll-1',
      'poll-2',
      'retry-preview',
    ]);
    expect(deps.retryPreview).toHaveBeenCalledTimes(1);
  });

  it('requests at most one explicit retry for a failed generation', async () => {
    const deps = dependencies();
    deps.getFreshnessState
      .mockReset()
      .mockResolvedValueOnce(freshness({
        status: 'failed',
        lastAttempt: { errorCode: 'sellpia_login_required', errorMessage: null },
      }))
      .mockResolvedValueOnce(freshness({
        status: 'fresh',
        verifiedGeneration: '9',
        requestedGeneration: '9',
      }));

    await recoverRocketPreviewFreshness(pending, deps);

    expect(deps.requestRetry).toHaveBeenCalledTimes(1);
    expect(deps.publishFreshnessState).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestedGeneration: '9' }),
    );
    expect(deps.retryPreview).toHaveBeenCalledTimes(1);
  });

  it.each([
    freshness({
      sourceBinding: {
        origin: 'https://kiditem.sellpia.com',
        accountKey: null,
        confirmed: false,
      },
    }),
    freshness({
      unresolvedOrderTransmissionIntents: [{
        intentKey: 'orders-1',
        preparedAt: '2026-07-27T00:00:00.000Z',
      }],
    }),
  ])('stops immediately when operator attention is required', async (state) => {
    const deps = dependencies();
    deps.getFreshnessState.mockReset().mockResolvedValue(state);

    await expect(recoverRocketPreviewFreshness(pending, deps))
      .rejects.toMatchObject({
        name: 'RocketPreviewFreshnessRecoveryError',
        code: 'attention_required',
        checkpoint: pending,
      });

    expect(deps.requestRetry).not.toHaveBeenCalled();
    expect(deps.retryPreview).not.toHaveBeenCalled();
  });

  it('aborts only the local waiter and preserves the durable checkpoint', async () => {
    const deps = dependencies();
    const controller = new AbortController();
    deps.getFreshnessState.mockReset().mockImplementation(async () => {
      controller.abort();
      return freshness();
    });

    await expect(recoverRocketPreviewFreshness(
      pending,
      deps,
      controller.signal,
    )).rejects.toMatchObject({
      code: 'aborted',
      checkpoint: pending,
    });

    expect(deps.publishPending).toHaveBeenCalledWith(pending);
    expect(deps.retryPreview).not.toHaveBeenCalled();
  });

  it('does not loop when the retried preview is still pending', async () => {
    const deps = dependencies();
    deps.getFreshnessState.mockReset().mockResolvedValue(freshness({
      status: 'fresh',
      verifiedGeneration: '8',
    }));
    deps.retryPreview.mockResolvedValue({
      ...pending,
      requestedGeneration: '9',
    });

    await expect(recoverRocketPreviewFreshness(pending, deps))
      .rejects.toMatchObject({ code: 'refresh_failed', checkpoint: pending });

    expect(deps.retryPreview).toHaveBeenCalledTimes(1);
  });

  it('times out with the checkpoint after the bounded wait', async () => {
    const deps = dependencies();
    deps.getFreshnessState.mockReset().mockResolvedValue(freshness());
    deps.maxPolls = 2;

    await expect(recoverRocketPreviewFreshness(pending, deps))
      .rejects.toMatchObject({ code: 'timeout', checkpoint: pending });

    expect(deps.getFreshnessState).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledTimes(1);
  });

  it('uses a fifteen-minute default wait budget', () => {
    expect(ROCKET_FRESHNESS_POLL_MS).toBe(2_000);
    expect(ROCKET_FRESHNESS_MAX_POLLS).toBe(450);
    expect(ROCKET_FRESHNESS_POLL_MS * ROCKET_FRESHNESS_MAX_POLLS)
      .toBe(15 * 60 * 1_000);
    expect(RocketPreviewFreshnessRecoveryError).toBeTypeOf('function');
  });
});

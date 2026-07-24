import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { apiClient } from '@/lib/api-client';
import {
  purchaseOrdersApi,
  SELLPIA_GENERATION_MAX_POLLS,
  SELLPIA_GENERATION_POLL_MS,
  submitPurchaseOrderWithFreshnessRecovery,
  waitForCompletedFreshGeneration,
} from './purchase-orders-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('purchaseOrdersApi', () => {
  it('posts submit and reconciliation actions to the existing route', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'ordered' });

    await purchaseOrdersApi.submit({
      purchaseOrderId: 'po-1',
      idempotencyKey: 'stable-key',
    });
    await purchaseOrdersApi.reconcile({
      purchaseOrderId: 'po-1',
      outcome: 'provider_succeeded',
      providerReference: '1688-1',
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/purchase-orders', {
      action: 'submit',
      id: 'po-1',
      idempotencyKey: 'stable-key',
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/purchase-orders', {
      action: 'reconcileSubmission',
      id: 'po-1',
      outcome: 'provider_succeeded',
      providerReference: '1688-1',
    });
  });
});

describe('submitPurchaseOrderWithFreshnessRecovery', () => {
  it('joins/requests one completed fresh generation and retries exactly once with the same key', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, 'SELLPIA_SYNC_REQUIRED', 'stale'))
      .mockResolvedValueOnce({ status: 'ordered' });
    const requestRefresh = vi.fn().mockResolvedValue({ requestedGeneration: '8' });
    const waitForFreshGeneration = vi.fn().mockResolvedValue(undefined);
    const onRefreshRequested = vi.fn().mockResolvedValue(undefined);
    const input = { purchaseOrderId: 'po-1', idempotencyKey: 'stable-key' };

    const result = await submitPurchaseOrderWithFreshnessRecovery(input, {
      dependencies: {
        submit,
        requestRefresh,
        waitForFreshGeneration,
      },
      onRefreshRequested,
    });

    expect(submit).toHaveBeenNthCalledWith(1, input);
    expect(requestRefresh).toHaveBeenCalledWith('manual_request');
    expect(onRefreshRequested).toHaveBeenCalledTimes(1);
    expect(onRefreshRequested).toHaveBeenCalledBefore(waitForFreshGeneration);
    expect(waitForFreshGeneration).toHaveBeenCalledWith('8');
    expect(submit).toHaveBeenNthCalledWith(2, input);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ status: 'ordered' });
  });

  it.each([
    new ApiError(422, 'PURCHASE_ITEM_INACTIVE', 'inactive'),
    new ApiError(422, 'PURCHASE_REFERENCE_INVALID', 'reference'),
    new ApiError(409, 'PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED', 'unknown'),
    new ApiError(502, 'provider_failed', 'provider failed'),
    new Error('network failed'),
  ])('does not auto-retry non-freshness failures', async (error) => {
    const submit = vi.fn().mockRejectedValue(error);
    const requestRefresh = vi.fn();
    const waitForFreshGeneration = vi.fn();

    await expect(submitPurchaseOrderWithFreshnessRecovery(
      { purchaseOrderId: 'po-1', idempotencyKey: 'stable-key' },
      { dependencies: { submit, requestRefresh, waitForFreshGeneration } },
    )).rejects.toBe(error);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(requestRefresh).not.toHaveBeenCalled();
    expect(waitForFreshGeneration).not.toHaveBeenCalled();
  });

  it('never auto-retries a second freshness gate failure', async () => {
    const second = new ApiError(409, 'SELLPIA_SYNC_REQUIRED', 'still stale');
    const submit = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, 'SELLPIA_SYNC_REQUIRED', 'stale'))
      .mockRejectedValueOnce(second);
    const requestRefresh = vi.fn().mockResolvedValue({ requestedGeneration: '8' });
    const waitForFreshGeneration = vi.fn().mockResolvedValue(undefined);

    await expect(submitPurchaseOrderWithFreshnessRecovery(
      { purchaseOrderId: 'po-1', idempotencyKey: 'stable-key' },
      { dependencies: { submit, requestRefresh, waitForFreshGeneration } },
    )).rejects.toBe(second);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(requestRefresh).toHaveBeenCalledTimes(1);
    expect(waitForFreshGeneration).toHaveBeenCalledTimes(1);
  });
});

describe('waitForCompletedFreshGeneration', () => {
  it('keeps the explicit waiter at a two-minute budget with two-second polls', () => {
    expect(SELLPIA_GENERATION_POLL_MS).toBe(2_000);
    expect(SELLPIA_GENERATION_MAX_POLLS).toBe(60);
    expect(SELLPIA_GENERATION_POLL_MS * SELLPIA_GENERATION_MAX_POLLS)
      .toBe(120_000);
  });

  it('waits until the requested generation is both verified and fresh', async () => {
    const getState = vi.fn()
      .mockResolvedValueOnce({ status: 'syncing', verifiedGeneration: '7' })
      .mockResolvedValueOnce({ status: 'fresh', verifiedGeneration: '8' });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await waitForCompletedFreshGeneration('8', { getState, sleep, maxPolls: 3 });

    expect(getState).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed/login/quality generation as completed freshness', async () => {
    const getState = vi.fn().mockResolvedValue({
      status: 'failed',
      verifiedGeneration: '7',
      lastAttempt: { errorCode: 'sellpia_login_required' },
    });

    await expect(waitForCompletedFreshGeneration('8', {
      getState,
      sleep: vi.fn(),
      maxPolls: 3,
    })).rejects.toThrow('sellpia_login_required');
    expect(getState).toHaveBeenCalledTimes(1);
  });
});

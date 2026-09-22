import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useAuth } from '@/hooks/useAuth';
import {
  createPurchaseOrderSubmissionIdempotencyKey,
  purchaseOrdersApi,
} from '../lib/purchase-orders-api';
import { collectSellpiaInventoryBeforeCalculation } from '@/app/(inventory)/_shared/collect-sellpia-before-calculation';
import { usePurchaseOrderSubmission } from './usePurchaseOrderSubmission';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { organizationId: 'org-1' } })),
}));
vi.mock('@/app/(inventory)/_shared/collect-sellpia-before-calculation', () => ({
  collectSellpiaInventoryBeforeCalculation: vi.fn(),
}));
vi.mock('../lib/purchase-orders-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/purchase-orders-api')>();
  return {
    ...original,
    createPurchaseOrderSubmissionIdempotencyKey: vi.fn(() => 'caller-key-1'),
    purchaseOrdersApi: { ...original.purchaseOrdersApi, submit: vi.fn() },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('usePurchaseOrderSubmission', () => {
  let queryClient: QueryClient;

  function renderSubmission() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => usePurchaseOrderSubmission(), { wrapper });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { organizationId: 'org-1' } } as never);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.mocked(purchaseOrdersApi.submit).mockResolvedValue({
      orderId: 'po-1',
      status: 'ordered',
    } as Awaited<ReturnType<typeof purchaseOrdersApi.submit>>);
    vi.mocked(collectSellpiaInventoryBeforeCalculation).mockResolvedValue('inventory-attempt-1');
  });

  it('submits once with one caller key and invalidates purchase orders', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderSubmission();

    await act(async () => {
      await result.current.submit('po-1');
    });

    expect(createPurchaseOrderSubmissionIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(collectSellpiaInventoryBeforeCalculation).toHaveBeenCalledWith(
      queryClient,
      'org-1',
      expect.any(AbortSignal),
    );
    expect(purchaseOrdersApi.submit).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      inventoryAttemptId: 'inventory-attempt-1',
      idempotencyKey: 'caller-key-1',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['purchaseOrders'] });
    expect(toast.success).toHaveBeenCalledWith('발주가 확정되었습니다.');
  });

  it('shares one collection and submit for synchronous duplicate clicks', async () => {
    let releaseCollection!: (attemptId: string) => void;
    vi.mocked(collectSellpiaInventoryBeforeCalculation).mockImplementation(
      () => new Promise((resolve) => { releaseCollection = resolve; }),
    );
    const { result } = renderSubmission();

    let first!: ReturnType<typeof result.current.submit>;
    let second!: ReturnType<typeof result.current.submit>;
    act(() => {
      first = result.current.submit('po-1');
      second = result.current.submit('po-1');
    });

    expect(result.current.submittingId).toBe('po-1');
    expect(first).toBe(second);
    expect(collectSellpiaInventoryBeforeCalculation).toHaveBeenCalledTimes(1);

    releaseCollection('inventory-attempt-1');
    await act(async () => {
      await first;
      await second;
    });

    expect(purchaseOrdersApi.submit).toHaveBeenCalledTimes(1);
  });

  it('aborts pre-submit waiting on unmount without calling the purchase API', async () => {
    let observedSignal: AbortSignal | undefined;
    vi.mocked(collectSellpiaInventoryBeforeCalculation).mockImplementation(
      (_queryClient, _organizationId, signal) => new Promise((_resolve, reject) => {
        observedSignal = signal;
        signal?.addEventListener('abort', () => reject(new Error('collection aborted')), { once: true });
      }),
    );
    const { result, unmount } = renderSubmission();
    let pending!: ReturnType<typeof result.current.submit>;
    act(() => {
      pending = result.current.submit('po-1');
    });

    unmount();
    await expect(pending).rejects.toThrow('collection aborted');

    expect(observedSignal?.aborted).toBe(true);
    expect(purchaseOrdersApi.submit).not.toHaveBeenCalled();
  });

  it('aborts pre-submit waiting when the organization changes', async () => {
    let observedSignal: AbortSignal | undefined;
    vi.mocked(collectSellpiaInventoryBeforeCalculation).mockImplementation(
      (_queryClient, _organizationId, signal) => new Promise((_resolve, reject) => {
        observedSignal = signal;
        signal?.addEventListener('abort', () => reject(new Error('organization changed')), { once: true });
      }),
    );
    const { result, rerender } = renderSubmission();
    let pending!: ReturnType<typeof result.current.submit>;
    act(() => {
      pending = result.current.submit('po-1');
    });

    vi.mocked(useAuth).mockReturnValue({ user: { organizationId: 'org-2' } } as never);
    rerender();
    await expect(pending).rejects.toThrow('organization changed');

    expect(observedSignal?.aborted).toBe(true);
    expect(purchaseOrdersApi.submit).not.toHaveBeenCalled();
  });

  it('does not call the purchase API when pre-submit collection fails', async () => {
    vi.mocked(collectSellpiaInventoryBeforeCalculation).mockRejectedValueOnce(
      new Error('collection failed'),
    );
    const { result } = renderSubmission();

    await act(async () => {
      await expect(result.current.submit('po-1')).rejects.toThrow('collection failed');
    });

    expect(createPurchaseOrderSubmissionIdempotencyKey).not.toHaveBeenCalled();
    expect(purchaseOrdersApi.submit).not.toHaveBeenCalled();
  });

  it('asks for Sellpia inventory collection on a stale generation without collecting or resubmitting', async () => {
    vi.mocked(purchaseOrdersApi.submit).mockRejectedValue(
      new ApiError(409, 'SELLPIA_SYNC_REQUIRED', 'stale'),
    );
    const { result } = renderSubmission();

    await act(async () => {
      await expect(result.current.submit('po-1')).rejects.toMatchObject({
        code: 'SELLPIA_SYNC_REQUIRED',
      });
    });

    expect(result.current.inventoryCollectionRequired).toBe(true);
    expect(purchaseOrdersApi.submit).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('clears the inventory notice when the operator submits again', async () => {
    vi.mocked(purchaseOrdersApi.submit).mockRejectedValueOnce(
      new ApiError(409, 'SELLPIA_SYNC_REQUIRED', 'stale'),
    );
    const { result } = renderSubmission();
    await act(async () => {
      await result.current.submit('po-1').catch(() => undefined);
    });
    expect(result.current.inventoryCollectionRequired).toBe(true);

    await act(async () => {
      await result.current.submit('po-1');
    });

    expect(result.current.inventoryCollectionRequired).toBe(false);
    expect(purchaseOrdersApi.submit).toHaveBeenCalledTimes(2);
  });

  it('invalidates purchase orders after a terminal provider error is persisted', async () => {
    vi.mocked(purchaseOrdersApi.submit).mockRejectedValueOnce(new Error('provider response unknown'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderSubmission();

    await act(async () => {
      await expect(result.current.submit('po-1')).rejects.toThrow('provider response unknown');
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['purchaseOrders'] });
    expect(result.current.inventoryCollectionRequired).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('provider response unknown');
  });
});

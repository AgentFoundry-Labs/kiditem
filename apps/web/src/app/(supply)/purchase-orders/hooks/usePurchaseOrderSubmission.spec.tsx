import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPurchaseOrderSubmissionIdempotencyKey,
  submitPurchaseOrderWithFreshnessRecovery,
} from '../lib/purchase-orders-api';
import { usePurchaseOrderSubmission } from './usePurchaseOrderSubmission';

vi.mock('../lib/purchase-orders-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/purchase-orders-api')>();
  return {
    ...original,
    createPurchaseOrderSubmissionIdempotencyKey: vi.fn(() => 'caller-key-1'),
    submitPurchaseOrderWithFreshnessRecovery: vi.fn().mockResolvedValue({
      orderId: 'po-1',
      status: 'ordered',
    }),
  };
});

describe('usePurchaseOrderSubmission', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it('creates one caller key per action and invalidates purchase orders after completion', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePurchaseOrderSubmission(), { wrapper });

    await act(async () => {
      await result.current.submit('po-1');
    });

    expect(createPurchaseOrderSubmissionIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(submitPurchaseOrderWithFreshnessRecovery).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      idempotencyKey: 'caller-key-1',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['purchaseOrders'] });
  });

  it('invalidates purchase orders after a terminal provider error is persisted', async () => {
    vi.mocked(submitPurchaseOrderWithFreshnessRecovery)
      .mockRejectedValueOnce(new Error('provider response unknown'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePurchaseOrderSubmission(), { wrapper });

    await act(async () => {
      await expect(result.current.submit('po-1'))
        .rejects.toThrow('provider response unknown');
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['purchaseOrders'] });
  });
});

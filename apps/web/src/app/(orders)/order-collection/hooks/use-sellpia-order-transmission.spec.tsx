import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSellpiaOrderTransmission } from './use-sellpia-order-transmission';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

const extension = vi.hoisted(() => ({
  sendOrderFileToSellpiaViaExtension: vi.fn(),
}));
const store = vi.hoisted(() => ({
  markGeneratedOrderFileTransmissionRequested: vi.fn(),
}));
const transmissions = vi.hoisted(() => ({
  prepareOrderTransmissionIntent: vi.fn(),
  finalizeOrderTransmissionIntent: vi.fn(),
  abortOrderTransmissionIntent: vi.fn(),
  reconcileOrderTransmissionIntent: vi.fn(),
}));
const freshness = vi.hoisted(() => ({
  requestRefresh: vi.fn(),
}));
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../lib/order-collection-extension', () => extension);
vi.mock('../lib/order-generated-file-store', () => store);
vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({
  sellpiaInventoryFreshnessApi: freshness,
}));
vi.mock('../lib/sellpia-order-transmission-api', () => ({
  sellpiaOrderTransmissionApi: transmissions,
}));
vi.mock('sonner', () => ({ toast }));

function generatedFile(): StoredOrderCollectionFile {
  return {
    id: 'orders-1',
    fileName: 'orders.xlsx',
    sourceName: 'orders.csv',
    blob: new Blob(['orders']),
    previewRows: [],
    sourceRows: 2,
    productRows: 1,
    outputRows: 2,
    skippedRows: 0,
    convertedAt: 100,
    mallName: '키드키즈',
  };
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useSellpiaOrderTransmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extension.sendOrderFileToSellpiaViaExtension.mockResolvedValue({
      success: true,
      outcome: 'submitted',
      shop: '키드키즈',
    });
    store.markGeneratedOrderFileTransmissionRequested.mockImplementation(
      async (file: StoredOrderCollectionFile, transmissionRequestedAt: number) => ({
        ...file,
        transmissionRequestedAt,
      }),
    );
    transmissions.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      disposition: 'prepared',
    });
    transmissions.finalizeOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      status: 'finalized',
    });
    transmissions.abortOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      status: 'aborted',
    });
    transmissions.reconcileOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      status: 'aborted',
      outcome: 'not_submitted',
    });
    freshness.requestRefresh.mockResolvedValue({
      status: 'queued',
      reason: 'manual_request',
    });
  });

  it('does not invalidate inventory state after an explicit Sellpia transmission request', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    let transmitted = false;
    await act(async () => {
      transmitted = await result.current.transmit(generatedFile());
    });

    expect(transmitted).toBe(true);
    expect(onTransmissionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ transmissionRequestedAt: expect.any(Number) }),
    );
    expect(invalidate).not.toHaveBeenCalled();
    expect(freshness.requestRefresh).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('셀피아 전송 요청됨 — 키드키즈');
  });

  it('stops the upload spinner as soon as Sellpia acceptance is confirmed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finishFinalization!: (value: {
      intentKey: string;
      status: 'finalized';
    }) => void;
    transmissions.finalizeOrderTransmissionIntent.mockImplementation(
      () => new Promise((resolve) => {
        finishFinalization = resolve;
      }),
    );
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested: vi.fn() }),
      { wrapper: wrapper(client) },
    );

    let transmission!: Promise<boolean>;
    act(() => {
      transmission = result.current.transmit(generatedFile());
    });

    await waitFor(() => expect(result.current.settlingId).toBe('orders-1'));
    expect(result.current.sendingId).toBeNull();

    finishFinalization({
      intentKey: 'orders-1',
      status: 'finalized',
    });
    await act(async () => {
      await expect(transmission).resolves.toBe(true);
    });
    expect(result.current.settlingId).toBeNull();
  });

  it('submits through Sellpia even when inventory freshness is unavailable', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    freshness.requestRefresh.mockRejectedValue(new Error('offline'));
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    let transmitted = false;
    await act(async () => {
      transmitted = await result.current.transmit(generatedFile());
    });

    expect(transmitted).toBe(true);
    expect(extension.sendOrderFileToSellpiaViaExtension).toHaveBeenCalledOnce();
    expect(onTransmissionRequested).toHaveBeenCalledOnce();
    expect(transmissions.prepareOrderTransmissionIntent).toHaveBeenCalledOnce();
    expect(freshness.requestRefresh).not.toHaveBeenCalled();
  });

  it('does not resubmit an unresolved prepared intent and asks for verification', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    transmissions.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      disposition: 'already_prepared',
    });
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await expect(result.current.transmit(generatedFile())).resolves.toBe(false);
    });

    expect(extension.sendOrderFileToSellpiaViaExtension).not.toHaveBeenCalled();
    expect(onTransmissionRequested).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      '이전 셀피아 전송 결과 확인 필요 — 셀피아 주문 내역을 확인한 뒤 처리하세요.',
    );
  });

  it('keeps the send successful and warns when local transmission history cannot persist', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    store.markGeneratedOrderFileTransmissionRequested.mockRejectedValue(
      new Error('indexeddb unavailable'),
    );
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    let transmitted = false;
    await act(async () => {
      transmitted = await result.current.transmit(generatedFile());
    });

    expect(transmitted).toBe(true);
    expect(transmissions.prepareOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(transmissions.prepareOrderTransmissionIntent.mock.invocationCallOrder[0]).toBeLessThan(
      extension.sendOrderFileToSellpiaViaExtension.mock.invocationCallOrder[0],
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      '셀피아 전송 요청은 완료됐지만 전송 상태를 저장하지 못했습니다.',
    );
  });

  it('shows only the Sellpia rejection when stock is insufficient', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    extension.sendOrderFileToSellpiaViaExtension.mockResolvedValue({
      success: false,
      outcome: 'not_submitted',
      error: '상품코드 K-100의 재고가 부족합니다.',
    });
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await expect(result.current.transmit(generatedFile())).resolves.toBe(false);
    });

    expect(onTransmissionRequested).not.toHaveBeenCalled();
    expect(transmissions.abortOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(freshness.requestRefresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('상품코드 K-100의 재고가 부족합니다.');
  });

  it('keeps an unknown extension outcome unresolved and asks for verification', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    extension.sendOrderFileToSellpiaViaExtension.mockResolvedValue({
      success: false,
      outcome: 'unknown',
      error: '익스텐션 응답 시간이 초과되었습니다.',
    });
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await expect(result.current.transmit(generatedFile())).resolves.toBe(false);
    });

    expect(transmissions.abortOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(freshness.requestRefresh).not.toHaveBeenCalled();
    expect(onTransmissionRequested).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('셀피아 전송 결과 확인 필요'),
    );
  });

  it('warns not to resend when submitted orders cannot finalize transmission state', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    transmissions.finalizeOrderTransmissionIntent.mockRejectedValue(new Error('offline'));
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await expect(result.current.transmit(generatedFile())).resolves.toBe(true);
    });

    expect(onTransmissionRequested).toHaveBeenCalledOnce();
    expect(toast.warning).toHaveBeenCalledWith(
      '셀피아 전송 요청은 완료됐지만 전송 상태 저장에 실패했습니다. 재전송하지 말고 이전 전송 결과를 확인하세요.',
    );
  });

  it('resends after an operator-confirmed missing submission is reconciled', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    transmissions.prepareOrderTransmissionIntent
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        disposition: 'already_finalized',
      })
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        disposition: 'prepared',
      });
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      await expect(result.current.transmit(
        { ...generatedFile(), transmissionRequestedAt: 1_720_000_000_000 },
        { retryConfirmed: true },
      )).resolves.toBe(true);
    });

    expect(transmissions.reconcileOrderTransmissionIntent).toHaveBeenCalledOnce();
    expect(extension.sendOrderFileToSellpiaViaExtension).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('셀피아 재전송 요청됨 — 키드키즈');
  });
});

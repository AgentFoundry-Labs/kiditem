import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useSellpiaOrderTransmission } from './use-sellpia-order-transmission';
import type { StoredOrderCollectionFile } from '../lib/order-generated-file-store';

const extension = vi.hoisted(() => ({
  sendOrderFileToSellpiaViaExtension: vi.fn(),
}));
const store = vi.hoisted(() => ({
  markGeneratedOrderFileTransmissionRequested: vi.fn(),
}));
const freshness = vi.hoisted(() => ({
  prepareOrderTransmissionIntent: vi.fn(),
  finalizeOrderTransmissionIntent: vi.fn(),
  abortOrderTransmissionIntent: vi.fn(),
  reconcileOrderTransmissionIntent: vi.fn(),
  requestRefresh: vi.fn(),
}));
const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('../lib/order-collection-extension', () => extension);
vi.mock('../lib/order-generated-file-store', () => store);
vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({
  sellpiaInventoryFreshnessApi: freshness,
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

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
    freshness.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      disposition: 'prepared',
    });
    freshness.finalizeOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      status: 'finalized',
      finalizedGeneration: '5',
    });
    freshness.abortOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      status: 'aborted',
    });
    freshness.reconcileOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      status: 'aborted',
      outcome: 'not_submitted',
    });
    freshness.requestRefresh.mockResolvedValue({
      status: 'queued',
      reason: 'manual_request',
    });
  });

  it('invalidates freshness and history after an explicit Sellpia transmission request', async () => {
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
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.inventory.freshness() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.inventory.history() });
    expect(toast.success).toHaveBeenCalledWith('셀피아 전송 요청됨 — 키드키즈');
  });

  it('stops the upload spinner as soon as Sellpia acceptance is confirmed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finishFinalization!: (value: {
      intentKey: string;
      status: 'finalized';
      finalizedGeneration: string;
    }) => void;
    freshness.finalizeOrderTransmissionIntent.mockImplementation(
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
      finalizedGeneration: '5',
    });
    await act(async () => {
      await expect(transmission).resolves.toBe(true);
    });
    expect(result.current.settlingId).toBeNull();
  });

  it('blocks the extension submit and explains why when intent preparation fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    freshness.prepareOrderTransmissionIntent.mockRejectedValue(new Error('offline'));
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    let transmitted = false;
    await act(async () => {
      transmitted = await result.current.transmit(generatedFile());
    });

    expect(transmitted).toBe(false);
    expect(extension.sendOrderFileToSellpiaViaExtension).not.toHaveBeenCalled();
    expect(onTransmissionRequested).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      '전송 준비 상태 저장에 실패해 셀피아 전송을 시작하지 않았습니다.',
    );
  });

  it('blocks a fixed-intent (Rocket) unresolved prepared intent and asks for verification', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    freshness.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'rocket-workbook:export-1:shipment',
      disposition: 'already_prepared',
    });
    const onTransmissionRequested = vi.fn();
    const { result } = renderHook(
      () => useSellpiaOrderTransmission({ onTransmissionRequested }),
      { wrapper: wrapper(client) },
    );

    await act(async () => {
      // 고정 intent 키(로켓/직배송)만 하드 블록으로 남는다. 일반 몰 파일은 자동 복구된다.
      await expect(
        result.current.transmit({
          ...generatedFile(),
          transmissionIntentKey: 'rocket-workbook:export-1:shipment',
        }),
      ).resolves.toBe(false);
    });

    expect(extension.sendOrderFileToSellpiaViaExtension).not.toHaveBeenCalled();
    expect(onTransmissionRequested).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      '이전 셀피아 전송 결과 확인 필요 — 셀피아 주문 내역을 확인한 뒤 처리하세요.',
      expect.objectContaining({
        action: expect.objectContaining({ label: '전송 결과 확인' }),
      }),
    );
    const toastOptions = toast.error.mock.calls.at(-1)?.[1];
    toastOptions.action.onClick();
    expect(router.push).toHaveBeenCalledWith('/inventory-hub?tab=sellpia-sync');
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
    expect(freshness.prepareOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(freshness.prepareOrderTransmissionIntent.mock.invocationCallOrder[0]).toBeLessThan(
      extension.sendOrderFileToSellpiaViaExtension.mock.invocationCallOrder[0],
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      '셀피아 전송 요청은 완료됐지만 전송 상태를 저장하지 못했습니다.',
    );
  });

  it('offers manual inventory sync when Sellpia rejects the transmission for stock', async () => {
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
    expect(freshness.abortOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(freshness.requestRefresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      '상품코드 K-100의 재고가 부족합니다.',
      expect.objectContaining({
        action: expect.objectContaining({ label: '재고 동기화' }),
      }),
    );
    const toastOptions = toast.error.mock.calls.at(-1)?.[1];
    toastOptions.action.onClick();
    await waitFor(() => {
      expect(freshness.requestRefresh).toHaveBeenCalledWith('manual_request');
    });
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

    expect(freshness.abortOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(freshness.requestRefresh).not.toHaveBeenCalled();
    expect(onTransmissionRequested).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('셀피아 전송 결과 확인 필요'),
      expect.objectContaining({
        action: expect.objectContaining({ label: '전송 결과 확인' }),
      }),
    );
  });

  it('warns not to resend when submitted orders cannot finalize freshness', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    freshness.finalizeOrderTransmissionIntent.mockRejectedValue(new Error('offline'));
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
      '셀피아 전송 요청은 완료됐지만 재고 최신화 확정에 실패했습니다. 재전송하지 말고 이전 전송 결과를 확인하세요.',
    );
  });

  it('resends after an operator-confirmed missing submission is reconciled', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    freshness.prepareOrderTransmissionIntent
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

    expect(freshness.reconcileOrderTransmissionIntent).toHaveBeenCalledOnce();
    expect(extension.sendOrderFileToSellpiaViaExtension).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('셀피아 재전송 요청됨 — 키드키즈');
  });
});

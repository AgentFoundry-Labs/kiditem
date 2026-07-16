import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
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
      submitted: true,
      shop: '키드키즈',
    });
    store.markGeneratedOrderFileTransmissionRequested.mockImplementation(
      async (file: StoredOrderCollectionFile, transmissionRequestedAt: number) => ({
        ...file,
        transmissionRequestedAt,
      }),
    );
    freshness.requestRefresh.mockResolvedValue({ status: 'pending' });
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

  it('blocks the extension submit and explains why when freshness intent scheduling fails', async () => {
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

    expect(transmitted).toBe(false);
    expect(extension.sendOrderFileToSellpiaViaExtension).not.toHaveBeenCalled();
    expect(onTransmissionRequested).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      '재고 최신화 예약에 실패해 셀피아 전송을 시작하지 않았습니다.',
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
    expect(freshness.requestRefresh).toHaveBeenCalledWith('order_transmission_requested');
    expect(freshness.requestRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      extension.sendOrderFileToSellpiaViaExtension.mock.invocationCallOrder[0],
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      '셀피아 전송 요청은 완료됐지만 전송 상태를 저장하지 못했습니다.',
    );
  });

  it('does not record or announce a transmission when the extension did not submit', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    extension.sendOrderFileToSellpiaViaExtension.mockResolvedValue({
      success: true,
      submitted: false,
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
    expect(freshness.requestRefresh).toHaveBeenCalledWith('order_transmission_requested');
    expect(toast.success).not.toHaveBeenCalled();
  });
});

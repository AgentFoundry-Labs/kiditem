import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transmitSellpiaOrder } from './sellpia-order-transmission';
import type { StoredOrderCollectionFile } from './order-generated-file-store';

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

describe('transmitSellpiaOrder', () => {
  const extension = { sendSellpiaOrders: vi.fn() };
  const store = { markTransmissionRequested: vi.fn() };
  const freshness = { requestRefresh: vi.fn() };
  const invalidateFreshnessHistory = vi.fn();
  const now = vi.fn(() => 1_721_000_000_000);

  const input = () => ({
    file: generatedFile(),
    extension,
    store,
    freshness,
    invalidateFreshnessHistory,
    now,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    extension.sendSellpiaOrders.mockResolvedValue({
      success: true,
      submitted: true,
      shop: '키드키즈',
    });
    store.markTransmissionRequested.mockImplementation(
      async (file: StoredOrderCollectionFile, transmissionRequestedAt: number) => ({
        ...file,
        transmissionRequestedAt,
      }),
    );
    freshness.requestRefresh.mockResolvedValue({ status: 'pending' });
    invalidateFreshnessHistory.mockResolvedValue(undefined);
  });

  it('durably schedules freshness before invoking the irreversible extension submit', async () => {
    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      viewRefreshWarning: false,
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(store.markTransmissionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'orders-1' }),
      1_721_000_000_000,
    );
    expect(freshness.requestRefresh).toHaveBeenCalledWith('order_transmission_requested');
    expect(invalidateFreshnessHistory).toHaveBeenCalledOnce();
    expect(freshness.requestRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      extension.sendSellpiaOrders.mock.invocationCallOrder[0],
    );
    expect(extension.sendSellpiaOrders.mock.invocationCallOrder[0]).toBeLessThan(
      store.markTransmissionRequested.mock.invocationCallOrder[0],
    );
    expect(store.markTransmissionRequested.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateFreshnessHistory.mock.invocationCallOrder[0],
    );
  });

  it('keeps the conservative freshness intent when the extension did not submit', async () => {
    extension.sendSellpiaOrders.mockResolvedValue({ success: true, submitted: false });

    await expect(transmitSellpiaOrder(input())).resolves.toEqual({
      status: 'not_submitted',
    });
    expect(store.markTransmissionRequested).not.toHaveBeenCalled();
    expect(freshness.requestRefresh).toHaveBeenCalledWith('order_transmission_requested');
    expect(invalidateFreshnessHistory).not.toHaveBeenCalled();
  });

  it('does not invoke the extension when the durable freshness intent fails', async () => {
    freshness.requestRefresh.mockRejectedValue(new Error('offline'));

    await expect(transmitSellpiaOrder(input())).rejects.toThrow(
      '재고 최신화 예약에 실패해 셀피아 전송을 시작하지 않았습니다.',
    );
    expect(extension.sendSellpiaOrders).not.toHaveBeenCalled();
    expect(store.markTransmissionRequested).not.toHaveBeenCalled();
    expect(invalidateFreshnessHistory).not.toHaveBeenCalled();
  });

  it('keeps transmission success when the post-submit view refresh fails', async () => {
    invalidateFreshnessHistory.mockRejectedValue(new Error('query refresh failed'));

    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      viewRefreshWarning: true,
    });
    expect(extension.sendSellpiaOrders).toHaveBeenCalledOnce();
    expect(store.markTransmissionRequested).toHaveBeenCalledOnce();
  });

  it('keeps transmission success and schedules refresh when local persistence fails', async () => {
    store.markTransmissionRequested.mockRejectedValue(new Error('indexeddb unavailable'));

    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      persistenceWarning: true,
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(freshness.requestRefresh).toHaveBeenCalledWith('order_transmission_requested');
    expect(invalidateFreshnessHistory).toHaveBeenCalledOnce();
  });

  it('requests one server refresh for every repeated successful transmission', async () => {
    await transmitSellpiaOrder(input());
    await transmitSellpiaOrder(input());

    expect(extension.sendSellpiaOrders).toHaveBeenCalledTimes(2);
    expect(store.markTransmissionRequested).toHaveBeenCalledTimes(2);
    expect(freshness.requestRefresh).toHaveBeenCalledTimes(2);
    expect(invalidateFreshnessHistory).toHaveBeenCalledTimes(2);
  });
});

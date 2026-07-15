import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredOrderCollectionFile } from './order-generated-file-store';
import { transmitSellpiaOrder } from './sellpia-order-transmission';

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

  it('persists the transmission request before scheduling and invalidating freshness', async () => {
    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      refreshWarning: false,
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(store.markTransmissionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'orders-1' }),
      1_721_000_000_000,
    );
    expect(freshness.requestRefresh).toHaveBeenCalledWith('order_transmission_requested');
    expect(invalidateFreshnessHistory).toHaveBeenCalledOnce();
    expect(extension.sendSellpiaOrders.mock.invocationCallOrder[0]).toBeLessThan(
      store.markTransmissionRequested.mock.invocationCallOrder[0],
    );
    expect(store.markTransmissionRequested.mock.invocationCallOrder[0]).toBeLessThan(
      freshness.requestRefresh.mock.invocationCallOrder[0],
    );
    expect(freshness.requestRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateFreshnessHistory.mock.invocationCallOrder[0],
    );
  });

  it('does nothing when the extension did not submit the order file', async () => {
    extension.sendSellpiaOrders.mockResolvedValue({ success: true, submitted: false });

    await expect(transmitSellpiaOrder(input())).resolves.toEqual({
      status: 'not_submitted',
    });
    expect(store.markTransmissionRequested).not.toHaveBeenCalled();
    expect(freshness.requestRefresh).not.toHaveBeenCalled();
    expect(invalidateFreshnessHistory).not.toHaveBeenCalled();
  });

  it('keeps transmission success when refresh scheduling fails', async () => {
    freshness.requestRefresh.mockRejectedValue(new Error('offline'));

    const result = await transmitSellpiaOrder(input());

    expect(result.status).toBe('transmission_requested');
    expect(result.refreshWarning).toBe(true);
    expect(store.markTransmissionRequested).toHaveBeenCalled();
    expect(invalidateFreshnessHistory).not.toHaveBeenCalled();
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

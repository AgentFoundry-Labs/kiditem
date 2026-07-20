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
  const freshness = {
    prepareOrderTransmissionIntent: vi.fn(),
    finalizeOrderTransmissionIntent: vi.fn(),
    abortOrderTransmissionIntent: vi.fn(),
  };
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
      outcome: 'submitted',
      shop: '키드키즈',
    });
    store.markTransmissionRequested.mockImplementation(
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
    invalidateFreshnessHistory.mockResolvedValue(undefined);
  });

  it('prepares durably, submits once, then finalizes before local history work', async () => {
    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      viewRefreshWarning: false,
      finalizationWarning: false,
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(store.markTransmissionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'orders-1' }),
      1_721_000_000_000,
    );
    expect(freshness.prepareOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(freshness.finalizeOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(invalidateFreshnessHistory).toHaveBeenCalledOnce();
    expect(freshness.prepareOrderTransmissionIntent.mock.invocationCallOrder[0]).toBeLessThan(
      extension.sendSellpiaOrders.mock.invocationCallOrder[0],
    );
    expect(extension.sendSellpiaOrders.mock.invocationCallOrder[0]).toBeLessThan(
      freshness.finalizeOrderTransmissionIntent.mock.invocationCallOrder[0],
    );
    expect(freshness.finalizeOrderTransmissionIntent.mock.invocationCallOrder[0]).toBeLessThan(
      store.markTransmissionRequested.mock.invocationCallOrder[0],
    );
    expect(store.markTransmissionRequested.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateFreshnessHistory.mock.invocationCallOrder[0],
    );
  });

  it('aborts the prepared intent when the extension explicitly did not submit', async () => {
    extension.sendSellpiaOrders.mockResolvedValue({
      success: false,
      outcome: 'not_submitted',
      error: '판매처를 찾지 못했습니다.',
    });

    await expect(transmitSellpiaOrder(input())).resolves.toEqual({
      status: 'not_submitted',
      abortWarning: false,
      error: '판매처를 찾지 못했습니다.',
    });
    expect(store.markTransmissionRequested).not.toHaveBeenCalled();
    expect(freshness.abortOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(freshness.finalizeOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(invalidateFreshnessHistory).not.toHaveBeenCalled();
  });

  it('keeps the intent prepared when the extension result is unknown', async () => {
    extension.sendSellpiaOrders.mockResolvedValue({
      success: false,
      outcome: 'unknown',
      error: '익스텐션 응답 시간이 초과되었습니다.',
    });

    await expect(transmitSellpiaOrder(input())).rejects.toThrow(
      '셀피아 전송 결과 확인 필요',
    );
    expect(freshness.abortOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(freshness.finalizeOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(store.markTransmissionRequested).not.toHaveBeenCalled();
  });

  it('does not invoke the extension when durable intent preparation fails', async () => {
    freshness.prepareOrderTransmissionIntent.mockRejectedValue(new Error('offline'));

    await expect(transmitSellpiaOrder(input())).rejects.toThrow(
      '전송 준비 상태 저장에 실패해 셀피아 전송을 시작하지 않았습니다.',
    );
    expect(extension.sendSellpiaOrders).not.toHaveBeenCalled();
    expect(store.markTransmissionRequested).not.toHaveBeenCalled();
    expect(invalidateFreshnessHistory).not.toHaveBeenCalled();
  });

  it('does not resubmit an already prepared intent and asks for operator verification', async () => {
    freshness.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      disposition: 'already_prepared',
    });

    await expect(transmitSellpiaOrder(input())).rejects.toThrow(
      '이전 셀피아 전송 결과 확인 필요',
    );
    expect(extension.sendSellpiaOrders).not.toHaveBeenCalled();
    expect(freshness.finalizeOrderTransmissionIntent).not.toHaveBeenCalled();
  });

  it('recovers a known submitted intent by finalizing without resubmitting', async () => {
    const transmissionRequestedAt = 1_720_000_000_000;
    freshness.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      disposition: 'already_prepared',
    });
    freshness.finalizeOrderTransmissionIntent
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        status: 'finalized',
        finalizedGeneration: '5',
      });

    const result = await transmitSellpiaOrder({
      ...input(),
      file: { ...generatedFile(), transmissionRequestedAt },
    });

    expect(result).toMatchObject({
      status: 'transmission_requested',
      finalizationWarning: false,
      file: { transmissionRequestedAt },
    });
    expect(extension.sendSellpiaOrders).not.toHaveBeenCalled();
    expect(freshness.finalizeOrderTransmissionIntent).toHaveBeenCalledTimes(2);
    expect(store.markTransmissionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'orders-1', transmissionRequestedAt }),
      transmissionRequestedAt,
    );
  });

  it('recovers local history without resubmitting an already finalized intent', async () => {
    freshness.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      disposition: 'already_finalized',
    });

    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      finalizationWarning: false,
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(extension.sendSellpiaOrders).not.toHaveBeenCalled();
    expect(freshness.finalizeOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(store.markTransmissionRequested).toHaveBeenCalledOnce();
  });

  it('retries idempotent finalization once before warning', async () => {
    freshness.finalizeOrderTransmissionIntent
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        status: 'finalized',
        finalizedGeneration: '5',
      });

    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      finalizationWarning: false,
    });
    expect(freshness.finalizeOrderTransmissionIntent).toHaveBeenCalledTimes(2);
  });

  it('keeps local submission history and warns when finalization remains unresolved', async () => {
    freshness.finalizeOrderTransmissionIntent.mockRejectedValue(new Error('offline'));

    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      finalizationWarning: true,
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(freshness.finalizeOrderTransmissionIntent).toHaveBeenCalledTimes(2);
    expect(store.markTransmissionRequested).toHaveBeenCalledOnce();
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

  it('keeps transmission success and finalization when local persistence fails', async () => {
    store.markTransmissionRequested.mockRejectedValue(new Error('indexeddb unavailable'));

    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      persistenceWarning: true,
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(freshness.finalizeOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(invalidateFreshnessHistory).toHaveBeenCalledOnce();
  });

  it('does not submit twice when a repeated call observes the finalized intent', async () => {
    freshness.prepareOrderTransmissionIntent
      .mockResolvedValueOnce({ intentKey: 'orders-1', disposition: 'prepared' })
      .mockResolvedValueOnce({ intentKey: 'orders-1', disposition: 'already_finalized' });
    await transmitSellpiaOrder(input());
    await transmitSellpiaOrder(input());

    expect(extension.sendSellpiaOrders).toHaveBeenCalledTimes(1);
    expect(store.markTransmissionRequested).toHaveBeenCalledTimes(2);
    expect(freshness.finalizeOrderTransmissionIntent).toHaveBeenCalledTimes(1);
    expect(invalidateFreshnessHistory).toHaveBeenCalledTimes(2);
  });
});

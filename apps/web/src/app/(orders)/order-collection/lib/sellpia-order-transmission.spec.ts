import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SellpiaOrderTransmissionResolutionRequiredError,
  transmitSellpiaOrder,
} from './sellpia-order-transmission';
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
    orderNumbers: ['ORDER-1', 'ORDER-2'],
  };
}

describe('transmitSellpiaOrder', () => {
  const extension = { sendSellpiaOrders: vi.fn() };
  const store = { markTransmissionRequested: vi.fn() };
  const transmissions = {
    prepareOrderTransmissionIntent: vi.fn(),
    finalizeOrderTransmissionIntent: vi.fn(),
    abortOrderTransmissionIntent: vi.fn(),
    reconcileOrderTransmissionIntent: vi.fn(),
  };
  const now = vi.fn(() => 1_721_000_000_000);

  const input = () => ({
    file: generatedFile(),
    extension,
    store,
    transmissions,
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
  });

  it('uses the Orders transmission fence and persists local history without inventory synchronization', async () => {
    const onSubmissionConfirmed = vi.fn();
    const result = await transmitSellpiaOrder({ ...input(), onSubmissionConfirmed });

    expect(result).toMatchObject({
      status: 'transmission_requested',
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(store.markTransmissionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'orders-1' }),
      1_721_000_000_000,
    );
    expect(transmissions.prepareOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(transmissions.finalizeOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(onSubmissionConfirmed).toHaveBeenCalledOnce();
    expect(transmissions.prepareOrderTransmissionIntent.mock.invocationCallOrder[0]).toBeLessThan(
      extension.sendSellpiaOrders.mock.invocationCallOrder[0],
    );
    expect(extension.sendSellpiaOrders.mock.invocationCallOrder[0]).toBeLessThan(
      onSubmissionConfirmed.mock.invocationCallOrder[0],
    );
    expect(onSubmissionConfirmed.mock.invocationCallOrder[0]).toBeLessThan(
      store.markTransmissionRequested.mock.invocationCallOrder[0],
    );
  });

  it('uses the server-issued Rocket transmission key for every durable intent action', async () => {
    const transmissionIntentKey = 'rocket-workbook:export-1:shipment';
    extension.sendSellpiaOrders.mockResolvedValue({
      success: false,
      outcome: 'not_submitted',
      error: null,
    });

    await transmitSellpiaOrder({
      ...input(),
      file: { ...generatedFile(), transmissionIntentKey },
    });

    expect(transmissions.prepareOrderTransmissionIntent).toHaveBeenCalledWith(
      transmissionIntentKey,
    );
    expect(transmissions.abortOrderTransmissionIntent).toHaveBeenCalledWith(
      transmissionIntentKey,
    );

    extension.sendSellpiaOrders.mockResolvedValue({
      success: true,
      outcome: 'submitted',
      shop: '키드키즈',
    });
    await transmitSellpiaOrder({
      ...input(),
      file: { ...generatedFile(), transmissionIntentKey },
    });
    expect(transmissions.finalizeOrderTransmissionIntent).toHaveBeenCalledWith(
      transmissionIntentKey,
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
    expect(transmissions.abortOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
    expect(transmissions.finalizeOrderTransmissionIntent).not.toHaveBeenCalled();
  });

  it('keeps the intent prepared when the extension result is unknown', async () => {
    extension.sendSellpiaOrders.mockResolvedValue({
      success: false,
      outcome: 'unknown',
      error: '익스텐션 응답 시간이 초과되었습니다.',
    });

    await expect(transmitSellpiaOrder(input())).rejects.toBeInstanceOf(
      SellpiaOrderTransmissionResolutionRequiredError,
    );
    expect(transmissions.abortOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(transmissions.finalizeOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(store.markTransmissionRequested).not.toHaveBeenCalled();
  });

  it('does not invoke the extension when durable intent preparation fails', async () => {
    transmissions.prepareOrderTransmissionIntent.mockRejectedValue(new Error('offline'));

    await expect(transmitSellpiaOrder(input())).rejects.toThrow(
      '전송 준비 상태 저장에 실패해 셀피아 전송을 시작하지 않았습니다.',
    );
    expect(extension.sendSellpiaOrders).not.toHaveBeenCalled();
    expect(store.markTransmissionRequested).not.toHaveBeenCalled();
  });

  it('does not resubmit an already prepared intent and asks for operator verification', async () => {
    transmissions.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      disposition: 'already_prepared',
    });

    await expect(transmitSellpiaOrder(input())).rejects.toBeInstanceOf(
      SellpiaOrderTransmissionResolutionRequiredError,
    );
    expect(extension.sendSellpiaOrders).not.toHaveBeenCalled();
    expect(transmissions.finalizeOrderTransmissionIntent).not.toHaveBeenCalled();
  });

  it('recovers a known submitted intent by finalizing without resubmitting', async () => {
    const transmissionRequestedAt = 1_720_000_000_000;
    transmissions.prepareOrderTransmissionIntent.mockResolvedValue({
      intentKey: 'orders-1',
      disposition: 'already_prepared',
    });
    transmissions.finalizeOrderTransmissionIntent
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        status: 'finalized',
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
    expect(transmissions.finalizeOrderTransmissionIntent).toHaveBeenCalledTimes(2);
    expect(store.markTransmissionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'orders-1', transmissionRequestedAt }),
      transmissionRequestedAt,
    );
  });

  it('recovers local history without resubmitting an already finalized intent', async () => {
    transmissions.prepareOrderTransmissionIntent.mockResolvedValue({
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
    expect(transmissions.finalizeOrderTransmissionIntent).not.toHaveBeenCalled();
    expect(store.markTransmissionRequested).toHaveBeenCalledOnce();
  });

  it('reopens an operator-confirmed missing finalized submission and resends it once', async () => {
    transmissions.prepareOrderTransmissionIntent
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        disposition: 'already_finalized',
      })
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        disposition: 'prepared',
      });

    const result = await transmitSellpiaOrder({
      ...input(),
      file: { ...generatedFile(), transmissionRequestedAt: 1_720_000_000_000 },
      retryConfirmed: true,
    });

    expect(result).toMatchObject({ status: 'transmission_requested' });
    expect(transmissions.reconcileOrderTransmissionIntent).toHaveBeenCalledWith({
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      note: expect.stringContaining('재전송'),
    });
    expect(transmissions.prepareOrderTransmissionIntent).toHaveBeenCalledTimes(2);
    expect(extension.sendSellpiaOrders).toHaveBeenCalledOnce();
    expect(transmissions.finalizeOrderTransmissionIntent).toHaveBeenCalledOnce();
  });

  it('retries idempotent finalization once before warning', async () => {
    transmissions.finalizeOrderTransmissionIntent
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        status: 'finalized',
      });

    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      finalizationWarning: false,
    });
    expect(transmissions.finalizeOrderTransmissionIntent).toHaveBeenCalledTimes(2);
  });

  it('keeps local submission history and warns when finalization remains unresolved', async () => {
    transmissions.finalizeOrderTransmissionIntent.mockRejectedValue(new Error('offline'));

    const result = await transmitSellpiaOrder(input());

    expect(result).toMatchObject({
      status: 'transmission_requested',
      finalizationWarning: true,
      file: { transmissionRequestedAt: 1_721_000_000_000 },
    });
    expect(transmissions.finalizeOrderTransmissionIntent).toHaveBeenCalledTimes(2);
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
    expect(transmissions.finalizeOrderTransmissionIntent).toHaveBeenCalledWith('orders-1');
  });

  it('does not submit twice when a repeated call observes the finalized intent', async () => {
    transmissions.prepareOrderTransmissionIntent
      .mockResolvedValueOnce({ intentKey: 'orders-1', disposition: 'prepared' })
      .mockResolvedValueOnce({ intentKey: 'orders-1', disposition: 'already_finalized' });
    await transmitSellpiaOrder(input());
    await transmitSellpiaOrder(input());

    expect(extension.sendSellpiaOrders).toHaveBeenCalledTimes(1);
    expect(store.markTransmissionRequested).toHaveBeenCalledTimes(2);
    expect(transmissions.finalizeOrderTransmissionIntent).toHaveBeenCalledTimes(1);
  });
});

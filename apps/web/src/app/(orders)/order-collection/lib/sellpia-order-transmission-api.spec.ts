import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sellpiaOrderTransmissionApi } from './sellpia-order-transmission-api';

const apiClient = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiClient }));

describe('sellpiaOrderTransmissionApi', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uses Orders endpoints whose responses contain no inventory state', async () => {
    apiClient.post
      .mockResolvedValueOnce({ intentKey: 'orders-1', disposition: 'prepared' })
      .mockResolvedValueOnce({ intentKey: 'orders-1', status: 'finalized' })
      .mockResolvedValueOnce({ intentKey: 'orders-1', status: 'aborted' })
      .mockResolvedValueOnce({
        intentKey: 'orders-1',
        status: 'aborted',
        outcome: 'not_submitted',
        reconciledBy: '11111111-1111-4111-8111-111111111111',
        reconciledAt: '2026-07-16T00:02:00.000Z',
        note: '셀피아 미접수 확인 후 재전송',
      });

    await sellpiaOrderTransmissionApi.prepareOrderTransmissionIntent('orders-1');
    await sellpiaOrderTransmissionApi.finalizeOrderTransmissionIntent('orders-1');
    await sellpiaOrderTransmissionApi.abortOrderTransmissionIntent('orders-1');
    await sellpiaOrderTransmissionApi.reconcileOrderTransmissionIntent({
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      note: '셀피아 미접수 확인 후 재전송',
    });

    for (const [index, action] of ['prepare', 'finalize', 'abort'].entries()) {
      expect(apiClient.post).toHaveBeenNthCalledWith(
        index + 1,
        `/api/orders/sellpia-transmissions/intents/${action}`,
        { intentKey: 'orders-1' },
      );
    }
    expect(apiClient.post).toHaveBeenNthCalledWith(
      4,
      '/api/orders/sellpia-transmissions/intents/reconcile',
      {
        intentKey: 'orders-1',
        outcome: 'not_submitted',
        note: '셀피아 미접수 확인 후 재전송',
      },
    );
  });
});

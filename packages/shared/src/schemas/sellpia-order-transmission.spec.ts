import { describe, expect, it } from 'vitest';
import {
  SellpiaOrderTransmissionIntentAbortResponseSchema,
  SellpiaOrderTransmissionIntentFinalizeResponseSchema,
  SellpiaOrderTransmissionIntentPrepareResponseSchema,
  SellpiaOrderTransmissionIntentReconcileResponseSchema,
} from './sellpia-order-transmission';

const USER_ID = '00000000-0000-4000-8000-000000000001';

describe('Sellpia order transmission contracts', () => {
  it('keeps durable submission state independent from inventory state and generations', () => {
    expect(SellpiaOrderTransmissionIntentPrepareResponseSchema.parse({
      intentKey: 'orders-1',
      disposition: 'prepared',
    })).toEqual({ intentKey: 'orders-1', disposition: 'prepared' });
    expect(SellpiaOrderTransmissionIntentFinalizeResponseSchema.parse({
      intentKey: 'orders-1',
      status: 'finalized',
    })).toEqual({ intentKey: 'orders-1', status: 'finalized' });
    expect(SellpiaOrderTransmissionIntentAbortResponseSchema.parse({
      intentKey: 'orders-1',
      status: 'aborted',
    })).toEqual({ intentKey: 'orders-1', status: 'aborted' });
    expect(() => SellpiaOrderTransmissionIntentFinalizeResponseSchema.parse({
      intentKey: 'orders-1',
      status: 'finalized',
      finalizedGeneration: '5',
    })).toThrow();
  });

  it('keeps reconciliation audited without inventory evidence', () => {
    expect(SellpiaOrderTransmissionIntentReconcileResponseSchema.parse({
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      status: 'aborted',
      reconciledBy: USER_ID,
      reconciledAt: '2026-07-31T00:00:00.000Z',
      note: '셀피아 주문 내역에서 미접수 확인',
    })).toBeTruthy();
    expect(() => SellpiaOrderTransmissionIntentReconcileResponseSchema.parse({
      intentKey: 'orders-1',
      outcome: 'submitted',
      status: 'aborted',
      reconciledBy: USER_ID,
      reconciledAt: '2026-07-31T00:00:00.000Z',
      note: '셀피아 주문 내역에서 접수 확인',
    })).toThrow();
  });
});

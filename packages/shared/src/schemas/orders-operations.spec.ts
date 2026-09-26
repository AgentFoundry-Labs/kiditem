import { describe, expect, it } from 'vitest';
import { OperationKindSchema } from './operation.js';
import {
  MALL_ORDER_OPERATION_MALLS,
  MallOrdersScopeSchema,
  ORDERS_OPERATION_KINDS,
  SellpiaShipmentTrackingScopeSchema,
  isMallOrderOperationMall,
} from './orders-operations.js';

describe('orders operation kinds (KID-359 wave2)', () => {
  it('every kind name satisfies the operation contract kind grammar', () => {
    for (const kind of ORDERS_OPERATION_KINDS) expect(OperationKindSchema.parse(kind)).toBe(kind);
    expect(new Set(ORDERS_OPERATION_KINDS).size).toBe(ORDERS_OPERATION_KINDS.length);
  });

  it('mall scope keeps the old attempt limits and the moved mall list', () => {
    const scope = MallOrdersScopeSchema.parse({
      channelAccountId: '11111111-1111-4111-8111-111111111111',
      mallKey: 'kidkids',
      collectionMode: 'browser',
    });
    expect(scope.collectionDate).toBeNull();
    expect(MallOrdersScopeSchema.safeParse({ ...scope, seenRowKeys: ['x'.repeat(2_001)] }).success).toBe(false);
    expect(MALL_ORDER_OPERATION_MALLS).toEqual(['icecream-mall', 'kidkids', 'art09', 'domeggook', 'kkomangse', 'teacher-mall', 'boribori']);
    expect(isMallOrderOperationMall('kidkids')).toBe(true);
    expect(isMallOrderOperationMall('gsshop')).toBe(false);
  });

  it('sellpia tracking scope rejects a reversed date range', () => {
    expect(SellpiaShipmentTrackingScopeSchema.safeParse({ startDate: '2026-09-02', endDate: '2026-09-01' }).success).toBe(false);
    expect(SellpiaShipmentTrackingScopeSchema.safeParse({ startDate: '2026-09-01', endDate: '2026-09-01' }).success).toBe(true);
  });
});

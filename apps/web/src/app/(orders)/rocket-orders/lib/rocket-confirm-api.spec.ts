import { describe, expect, it } from 'vitest';
import { normalizeRocketConfirmRow } from './rocket-confirm-api';

describe('normalizeRocketConfirmRow', () => {
  it('flattens the extension row shape (plannedDeliveryDate + nested confirmation) to server ConfirmSourceRow fields', () => {
    const extensionRow = {
      poLineId: 'PO-1:P-1:8801234567890:1',
      poNumber: 'PO-1',
      vendorId: 'V-1',
      productNo: 'P-1',
      barcode: '8801234567890',
      productName: 'Rocket item',
      orderQty: 10,
      plannedDeliveryDate: '2026-07-22',
      poStatusCode: 'RP',
      confirmation: {
        center: '동탄1센터',
        inboundType: '쉽먼트',
        poStatus: '거래처확인요청',
        returnManager: '홍길동',
        returnContact: '010-0000-0000',
        returnAddress: '서울시 …',
        purchasePrice: 1000,
        supplyPrice: 900,
        vat: 90,
        totalPurchase: 10000,
        poRegisteredAt: '2026-07-18 09:00:00',
        xdock: 'N',
      },
    };

    const out = normalizeRocketConfirmRow(extensionRow);

    // 서버 buildRocketPurchaseOrderSummaries 가 읽는 입고예정일/등록일이 채워져야 적재가 스킵되지 않는다.
    expect(out.expectedInboundDate).toBe('2026-07-22');
    expect(out.poRegisteredAt).toBe('2026-07-18 09:00:00');
    expect(out.center).toBe('동탄1센터');
    expect(out.poStatus).toBe('거래처확인요청');
    expect(out.inboundType).toBe('쉽먼트');
    expect(out.totalPurchase).toBe(10000);
    expect(out.xdock).toBe('N');
    // 그대로 통과하는 식별 필드
    expect(out.poNumber).toBe('PO-1');
    expect(out.barcode).toBe('8801234567890');
    expect(out.orderQty).toBe(10);
  });

  it('keeps existing flat fields (saved rows) instead of overwriting with nested', () => {
    const flatRow = {
      poNumber: 'PO-2',
      barcode: '8809999999999',
      orderQty: 5,
      expectedInboundDate: '2026-07-30',
      poRegisteredAt: '2026-07-20 10:00:00',
      center: '이미평면센터',
    };

    const out = normalizeRocketConfirmRow(flatRow);

    expect(out.expectedInboundDate).toBe('2026-07-30');
    expect(out.poRegisteredAt).toBe('2026-07-20 10:00:00');
    expect(out.center).toBe('이미평면센터');
  });
});

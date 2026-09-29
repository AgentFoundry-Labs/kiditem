import { describe, expect, it } from 'vitest';
import { COUPANG_DIRECTSHIP_KIND, COUPANG_ROCKET_PO_KIND, MALL_ORDERS_KIND } from '@kiditem/shared/orders-operations';
import { countTodayOrders } from './order-collection-today-orders';

const mall = (id: string, mallKey: string, result: Record<string, unknown>) => ({
  id, kind: MALL_ORDERS_KIND, plan: { mallKey }, result: { mallKey, captured: 1, ...result },
});

describe('오늘 주문·신규 셈법 (KID-234)', () => {
  it('배포 전 result(주문번호 없음)는 옛 규칙대로 그 몰의 가장 최근 하나의 rowCount를 세고, 그 원천을 보낸 전송이 있으면 신규가 아니다', () => {
    const operations = [
      mall('b', 'onch', { rowCount: 3, orderNumbers: ['OC-9'] }),
      mall('a2', 'onch', { rowCount: 5 }),
      mall('a1', 'onch', { rowCount: 7 }),
      mall('k', 'kidkids', { rowCount: 2 }),
    ];
    expect(countTodayOrders(operations, [{ sourceOperationId: 'k', transport: null, acceptedOrderNumbers: [] }])).toEqual({
      total: 1 + 5 + 2,
      newTotal: 1 + 5 + 0,
      byMall: { onch: { orderCount: 6, newCount: 6 }, kidkids: { orderCount: 2, newCount: 0 } },
    });
  });

  it('directship은 로켓 계정마다 가장 최근 실행 하나만, 몰 없는 kind(로켓 PO)와 읽을 수 없는 result는 세지 않는다', () => {
    const directship = (id: string, account: string, shipment: number, milkrun: number) => ({
      id, kind: COUPANG_DIRECTSHIP_KIND, plan: { channelAccountId: account },
      result: { rowCount: shipment + milkrun, purchaseOrders: shipment + milkrun, lines: 0, partialDetailCount: 0, transports: { SHIPMENT: shipment, MILKRUN: milkrun } },
    });
    const operations = [
      directship('d2', 'acc-1', 2, 1),
      directship('d1', 'acc-1', 9, 9),
      directship('e1', 'acc-2', 0, 4),
      { id: 'po', kind: COUPANG_ROCKET_PO_KIND, plan: { channelAccountId: 'acc-1' }, result: { rowCount: 50 } },
      { id: 'bad', kind: MALL_ORDERS_KIND, plan: { mallKey: 'onch' }, result: { broken: true } },
    ];
    expect(countTodayOrders(operations, [{ sourceOperationId: 'e1', transport: 'MILKRUN', acceptedOrderNumbers: ['x'] }])).toEqual({
      total: 3 + 4,
      newTotal: 3 + 0,
      byMall: { 'coupang-direct': { orderCount: 7, newCount: 3 } },
    });
    expect(countTodayOrders([], [])).toEqual({ total: null, newTotal: null, byMall: {} });
  });
});

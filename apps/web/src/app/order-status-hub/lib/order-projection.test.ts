import { describe, expect, it } from 'vitest';
import type { OrderListItem } from '@kiditem/shared/order';
import {
  aggregateOrdersByDay,
  filterOrderListItems,
  orderStatusBadge,
  summarizeOrderRange,
  toKstDateString,
} from './order-projection';

function makeOrder(overrides: Partial<OrderListItem> & { id: string }): OrderListItem {
  return {
    id: overrides.id,
    platform: 'coupang',
    externalOrderId: overrides.externalOrderId ?? '12345678',
    externalNumber: overrides.externalNumber ?? null,
    displayOrderNumber: overrides.displayOrderNumber ?? overrides.externalOrderId ?? '12345678',
    shipmentBoxId: overrides.shipmentBoxId ?? null,
    status: overrides.status ?? 'FINAL_DELIVERY',
    customerName: overrides.customerName ?? '홍길동',
    receiverName: overrides.receiverName ?? '홍길동',
    receiverAddr: overrides.receiverAddr ?? '서울시 강남구',
    memo: overrides.memo ?? null,
    orderedAt: overrides.orderedAt ?? '2026-04-26T01:00:00.000Z',
    shippedAt: overrides.shippedAt ?? null,
    deliveredAt: overrides.deliveredAt ?? null,
    trackingNumber: overrides.trackingNumber ?? null,
    shippingCompany: overrides.shippingCompany ?? null,
    totalPrice: overrides.totalPrice ?? 10_000,
    totalQuantity: overrides.totalQuantity ?? 1,
    lineItemCount: overrides.lineItemCount ?? 1,
    primaryProductName: overrides.primaryProductName ?? '키즈 의자',
    primaryOptionName: overrides.primaryOptionName ?? null,
    lineItems: overrides.lineItems ?? [
      {
        id: '00000000-0000-4000-8000-000000000200',
        productName: overrides.primaryProductName ?? '키즈 의자',
        optionName: overrides.primaryOptionName ?? null,
        sku: 'SKU-LINE-001',
        quantity: 1,
        unitPrice: 10_000,
        totalPrice: 10_000,
        status: 'ACCEPT',
        externalLineId: null,
      },
    ],
  };
}

describe('toKstDateString', () => {
  it('converts UTC midnight to next-day KST', () => {
    expect(toKstDateString('2026-04-25T16:00:00.000Z')).toBe('2026-04-26');
    expect(toKstDateString('2026-04-25T15:59:59.999Z')).toBe('2026-04-26');
    expect(toKstDateString('2026-04-25T14:59:59.999Z')).toBe('2026-04-25');
  });
});

describe('aggregateOrdersByDay', () => {
  it('groups orders by KST orderedAt date and sums totals', () => {
    const orders = [
      makeOrder({ id: 'a', orderedAt: '2026-04-25T16:00:00.000Z', totalPrice: 1000, totalQuantity: 1 }),
      makeOrder({ id: 'b', orderedAt: '2026-04-25T20:00:00.000Z', totalPrice: 2500, totalQuantity: 2 }),
      makeOrder({ id: 'c', orderedAt: '2026-04-26T18:00:00.000Z', totalPrice: 700, totalQuantity: 1 }),
    ];
    const daily = aggregateOrdersByDay(orders);
    expect(daily).toEqual([
      { date: '2026-04-26', orderCount: 2, totalRevenue: 3500, totalQuantity: 3 },
      { date: '2026-04-27', orderCount: 1, totalRevenue: 700, totalQuantity: 1 },
    ]);
  });

  it('fills empty days within the requested range', () => {
    const orders = [makeOrder({ id: 'a', orderedAt: '2026-04-25T16:00:00.000Z' })];
    const daily = aggregateOrdersByDay(orders, { from: '2026-04-25', to: '2026-04-27' });
    expect(daily.map((d) => d.date)).toEqual(['2026-04-25', '2026-04-26', '2026-04-27']);
    expect(daily[0].orderCount).toBe(0);
    expect(daily[1].orderCount).toBe(1);
    expect(daily[2].orderCount).toBe(0);
  });
});

describe('summarizeOrderRange', () => {
  it('counts coverage and finds peak day', () => {
    const summary = summarizeOrderRange([
      { date: '2026-04-25', orderCount: 0, totalRevenue: 0, totalQuantity: 0 },
      { date: '2026-04-26', orderCount: 5, totalRevenue: 50_000, totalQuantity: 7 },
      { date: '2026-04-27', orderCount: 3, totalRevenue: 12_000, totalQuantity: 3 },
    ]);
    expect(summary.totalOrders).toBe(8);
    expect(summary.totalRevenue).toBe(62_000);
    expect(summary.totalQuantity).toBe(10);
    expect(summary.daysWithOrders).toBe(2);
    expect(summary.daysWithoutOrders).toBe(1);
    expect(summary.peakDay).toEqual({ date: '2026-04-26', orderCount: 5 });
  });

  it('returns null peak when there are zero orders', () => {
    const summary = summarizeOrderRange([
      { date: '2026-04-25', orderCount: 0, totalRevenue: 0, totalQuantity: 0 },
    ]);
    expect(summary.peakDay).toBeNull();
  });
});

describe('filterOrderListItems', () => {
  const rows = [
    makeOrder({
      id: 'a',
      displayOrderNumber: '60001',
      externalOrderId: '60001',
      externalNumber: 'EXT-A',
      trackingNumber: '111111111',
      customerName: '홍길동',
      receiverName: '홍길순',
      primaryProductName: '키즈 의자',
    }),
    makeOrder({
      id: 'b',
      displayOrderNumber: '60002',
      externalOrderId: '60002',
      externalNumber: 'EXT-B',
      trackingNumber: '222222222',
      customerName: '이몽룡',
      receiverName: '성춘향',
      primaryProductName: '아동 책상',
    }),
  ];

  it('returns all rows for empty term', () => {
    expect(filterOrderListItems(rows, '   ')).toHaveLength(2);
  });

  it('matches by tracking number, customer name, or product name (case insensitive)', () => {
    expect(filterOrderListItems(rows, '111111111')).toHaveLength(1);
    expect(filterOrderListItems(rows, '몽룡')).toHaveLength(1);
    expect(filterOrderListItems(rows, '의자')).toHaveLength(1);
    expect(filterOrderListItems(rows, 'ext-a')).toHaveLength(1);
  });

  it('uses only flattened OrderListItem fields (no legacy product.name nesting)', () => {
    const stripped = rows.map((r) => ({
      ...r,
      primaryProductName: null,
      primaryOptionName: null,
      lineItems: [],
    }));
    // 상품명 자취가 모두 사라지면 더 이상 의자/책상으로 검색되지 않음
    expect(filterOrderListItems(stripped, '의자')).toHaveLength(0);
    expect(filterOrderListItems(stripped, '책상')).toHaveLength(0);
    // 그러나 customerName/trackingNumber 등 OrderListItem 자체 필드는 여전히 검색됨
    expect(filterOrderListItems(stripped, '몽룡')).toHaveLength(1);
  });
});

describe('orderStatusBadge', () => {
  it('does not return legacy critical / warning / overstock labels', () => {
    const labels = [
      orderStatusBadge('ACCEPT').label,
      orderStatusBadge('INSTRUCT').label,
      orderStatusBadge('DEPARTURE').label,
      orderStatusBadge('DELIVERING').label,
      orderStatusBadge('FINAL_DELIVERY').label,
      orderStatusBadge('CANCELED').label,
      orderStatusBadge('NONE_TRACKING').label,
    ];
    expect(labels).not.toContain('긴급발주');
    expect(labels).not.toContain('발주필요');
    expect(labels).not.toContain('과재고');
  });
});

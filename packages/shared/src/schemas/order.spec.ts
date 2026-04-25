import { describe, expect, it } from 'vitest';
import {
  OrderActionResponseSchema,
  OrderListItemSchema,
  OrderListResponseSchema,
  OrderStatsResponseSchema,
  OrderStatusSchema,
} from './order.js';

const baseOrderListItem = {
  id: '00000000-0000-4000-8000-000000000001',
  platform: 'coupang',
  externalOrderId: '123456789',
  externalNumber: 'CO-100',
  displayOrderNumber: 'CO-100',
  shipmentBoxId: 123456789,
  status: 'ACCEPT',
  customerName: '홍길동',
  receiverName: '홍길동',
  receiverAddr: '서울시 중구',
  memo: null,
  orderedAt: '2026-04-25T00:00:00.000Z',
  shippedAt: null,
  deliveredAt: null,
  trackingNumber: null,
  shippingCompany: null,
  totalPrice: 35000,
  totalQuantity: 2,
  lineItemCount: 1,
  primaryProductName: '키즈 티셔츠',
  primaryOptionName: '120 / Blue',
  lineItems: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      productName: '키즈 티셔츠',
      optionName: '120 / Blue',
      sku: 'SKU-001',
      quantity: 2,
      unitPrice: 17500,
      totalPrice: 35000,
      status: 'ACCEPT',
      externalLineId: '987654321',
    },
  ],
};

describe('order response schemas', () => {
  it('parses an order list item with derived UI fields', () => {
    expect(OrderListItemSchema.parse(baseOrderListItem).totalQuantity).toBe(2);
  });

  it('parses list response with delivery companies', () => {
    const parsed = OrderListResponseSchema.parse({
      items: [baseOrderListItem],
      total: 1,
      deliveryCompanies: [{ code: 'CJGLS', name: 'CJ대한통운' }],
    });
    expect(parsed.items[0]?.displayOrderNumber).toBe('CO-100');
    expect(parsed.deliveryCompanies[0]?.code).toBe('CJGLS');
  });

  it('rejects invalid canonical status enum values', () => {
    expect(OrderStatusSchema.safeParse('READY_TO_SHIP').success).toBe(false);
    expect(OrderStatusSchema.safeParse('ACCEPT').success).toBe(true);
    expect(OrderStatusSchema.safeParse('CANCELED').success).toBe(true);
  });

  it('parses stats and action responses', () => {
    expect(
      OrderStatsResponseSchema.parse({
        stats: {
          total: 1,
          accept: 1,
          instruct: 0,
          departure: 0,
          delivering: 0,
          finalDelivery: 0,
        },
        today: { orders: 1, revenue: 35000 },
        week: { orders: 1, revenue: 35000 },
      }).stats.accept,
    ).toBe(1);

    expect(
      OrderActionResponseSchema.parse({ message: '1건 승인 완료', data: { ok: true } }).message,
    ).toContain('승인');
  });
});

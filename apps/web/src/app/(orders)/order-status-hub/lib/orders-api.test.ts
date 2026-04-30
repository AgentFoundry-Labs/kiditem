import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderListItem, OrderListResponse } from '@kiditem/shared/order';
import { apiClient } from '@/lib/api-client';
import {
  allOrderStatusesKeyParams,
  fetchOrderListAcrossStatuses,
} from './orders-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getParsed: vi.fn(),
  },
}));

const getParsed = vi.mocked(apiClient.getParsed);

function makeOrder(overrides: Partial<OrderListItem> & { id: string }): OrderListItem {
  return {
    id: overrides.id,
    platform: 'coupang',
    externalOrderId: overrides.externalOrderId ?? '12345678',
    externalNumber: overrides.externalNumber ?? null,
    displayOrderNumber: overrides.displayOrderNumber ?? overrides.externalOrderId ?? '12345678',
    shipmentBoxId: overrides.shipmentBoxId ?? null,
    status: overrides.status ?? 'ACCEPT',
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
        id: `${overrides.id}-line`,
        productName: overrides.primaryProductName ?? '키즈 의자',
        optionName: overrides.primaryOptionName ?? null,
        sku: 'SKU-LINE-001',
        quantity: 1,
        unitPrice: 10_000,
        totalPrice: 10_000,
        status: overrides.status ?? 'ACCEPT',
        externalLineId: null,
      },
    ],
  };
}

function response(items: OrderListItem[]): OrderListResponse {
  return { items, total: items.length, deliveryCompanies: ['CJ대한통운'] };
}

describe('order-status orders API helpers', () => {
  beforeEach(() => {
    getParsed.mockReset();
  });

  it('builds a stable all-status query key marker instead of the server ACCEPT default', () => {
    expect(allOrderStatusesKeyParams({ from: '2026-04-01', to: '2026-04-02' })).toEqual({
      from: '2026-04-01',
      to: '2026-04-02',
      statuses: 'ACCEPT,INSTRUCT,DEPARTURE,DELIVERING,FINAL_DELIVERY,CANCELED',
    });
  });

  it('fetches every user-facing order status, de-duplicates rows, and sorts newest first', async () => {
    const older = makeOrder({
      id: 'older',
      status: 'ACCEPT',
      orderedAt: '2026-04-25T01:00:00.000Z',
    });
    const newer = makeOrder({
      id: 'newer',
      status: 'FINAL_DELIVERY',
      orderedAt: '2026-04-26T01:00:00.000Z',
    });

    getParsed
      .mockResolvedValueOnce(response([older]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([newer]))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response([newer]))
      .mockResolvedValueOnce(response([]));

    const result = await fetchOrderListAcrossStatuses({ from: '2026-04-01', to: '2026-04-02' });

    expect(getParsed.mock.calls.map(([url]) => url)).toEqual([
      '/api/orders?from=2026-04-01&to=2026-04-02&status=ACCEPT',
      '/api/orders?from=2026-04-01&to=2026-04-02&status=INSTRUCT',
      '/api/orders?from=2026-04-01&to=2026-04-02&status=DEPARTURE',
      '/api/orders?from=2026-04-01&to=2026-04-02&status=DELIVERING',
      '/api/orders?from=2026-04-01&to=2026-04-02&status=FINAL_DELIVERY',
      '/api/orders?from=2026-04-01&to=2026-04-02&status=CANCELED',
    ]);
    expect(result.items.map((item) => item.id)).toEqual(['newer', 'older']);
    expect(result.total).toBe(2);
    expect(result.deliveryCompanies).toEqual(['CJ대한통운']);
  });
});

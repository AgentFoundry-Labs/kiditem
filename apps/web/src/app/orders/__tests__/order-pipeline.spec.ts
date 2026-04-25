import { describe, expect, it } from 'vitest';
import {
  buildPipelineFromResponses,
  getCurrentSyncWindow,
  getNumericShipmentBoxIds,
  makeDateHourKey,
} from '../lib/order-pipeline';
import type { OrderListItem } from '@kiditem/shared';

function order(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    platform: 'coupang',
    externalOrderId: '12345',
    externalNumber: null,
    displayOrderNumber: '12345',
    shipmentBoxId: 12345,
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
    totalPrice: 10000,
    totalQuantity: 1,
    lineItemCount: 1,
    primaryProductName: '키즈 티셔츠',
    primaryOptionName: null,
    lineItems: [],
    ...overrides,
  };
}

describe('order pipeline helpers', () => {
  it('builds counts from typed order list responses', () => {
    const result = buildPipelineFromResponses([
      { status: 'ACCEPT', response: { items: [order()], total: 1, deliveryCompanies: [] } },
      { status: 'INSTRUCT', response: { items: [], total: 0, deliveryCompanies: [] } },
    ]);
    expect(result.counts.ACCEPT).toBe(1);
    expect(result.pipeline.ACCEPT[0]?.primaryProductName).toBe('키즈 티셔츠');
  });

  it('creates a stable local date-hour key', () => {
    expect(makeDateHourKey(new Date(2026, 3, 25, 9, 30))).toBe('2026-04-25T09');
  });

  it('returns a sync window only during configured sync hours', () => {
    expect(getCurrentSyncWindow(new Date(2026, 3, 25, 9, 10))).not.toBeNull();
    expect(getCurrentSyncWindow(new Date(2026, 3, 25, 10, 10))).toBeNull();
  });

  it('sync window sends full UTC ISO instants for both from and to (KST/Coupang regression)', () => {
    const now = new Date(2026, 3, 25, 9, 30);
    const win = getCurrentSyncWindow(now);
    expect(win).not.toBeNull();
    // 두 값 모두 full UTC ISO (`...Z`) — 서버가 KST `+09:00` 으로 변환.
    // date-only 면 서버 KST 변환 시 KST 09:00 으로 어긋남 → 회귀 마커.
    expect(win!.to).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(win!.from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // `to` 는 윈도우 시점 (현재) 와 동일한 instant
    expect(win!.to).toBe(now.toISOString());
  });

  it('extracts only numeric shipment box ids', () => {
    const { ids, skipped } = getNumericShipmentBoxIds([
      order({ shipmentBoxId: 123 }),
      order({ id: '00000000-0000-4000-8000-000000000003', shipmentBoxId: null }),
    ]);
    expect(ids).toEqual([123]);
    expect(skipped).toHaveLength(1);
  });
});

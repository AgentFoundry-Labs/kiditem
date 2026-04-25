import { CheckCircle, Clock, MapPin, Package, Truck, type LucideIcon } from 'lucide-react';
import type { OrderListItem, OrderListResponse, OrderPipelineStatus } from '@kiditem/shared';

export interface OrderPipelineNode {
  key: OrderPipelineStatus;
  label: string;
  sub: string;
  icon: LucideIcon;
  color: string;
}

export interface OrderPipelineEdge {
  from: number;
  to: number;
}

export const ORDER_ACTIVE_NODES: OrderPipelineNode[] = [
  { key: 'ACCEPT', label: '신규주문', sub: 'Order Received', icon: Clock, color: '#3b82f6' },
  { key: 'INSTRUCT', label: '발주확인', sub: 'Confirmed', icon: CheckCircle, color: '#8b5cf6' },
  { key: 'DEPARTURE', label: '출고완료', sub: 'Shipped', icon: Package, color: '#f59e0b' },
  { key: 'DELIVERING', label: '배송중', sub: 'In Transit', icon: Truck, color: '#10b981' },
];

export const ORDER_ALL_NODES: OrderPipelineNode[] = [
  ...ORDER_ACTIVE_NODES,
  { key: 'FINAL_DELIVERY', label: '배송완료', sub: 'Delivered', icon: MapPin, color: '#6b7280' },
];

export const ORDER_PIPELINE_EDGES: OrderPipelineEdge[] = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3 },
];

export const SYNC_HOURS = [9, 12, 15, 18] as const;

export interface OrderPipelineResult {
  pipeline: Record<OrderPipelineStatus, OrderListItem[]>;
  counts: Record<OrderPipelineStatus, number>;
}

export const EMPTY_PIPELINE_RESULT: OrderPipelineResult = {
  pipeline: {
    ACCEPT: [],
    INSTRUCT: [],
    DEPARTURE: [],
    DELIVERING: [],
    FINAL_DELIVERY: [],
  },
  counts: {
    ACCEPT: 0,
    INSTRUCT: 0,
    DEPARTURE: 0,
    DELIVERING: 0,
    FINAL_DELIVERY: 0,
  },
};

export function buildPipelineFromResponses(
  responses: Array<{ status: OrderPipelineStatus; response: OrderListResponse }>,
): OrderPipelineResult {
  const pipeline: Record<OrderPipelineStatus, OrderListItem[]> = {
    ACCEPT: [],
    INSTRUCT: [],
    DEPARTURE: [],
    DELIVERING: [],
    FINAL_DELIVERY: [],
  };
  const counts: Record<OrderPipelineStatus, number> = {
    ACCEPT: 0,
    INSTRUCT: 0,
    DEPARTURE: 0,
    DELIVERING: 0,
    FINAL_DELIVERY: 0,
  };

  for (const { status, response } of responses) {
    pipeline[status] = response.items;
    counts[status] = response.total;
  }

  return { pipeline, counts };
}

export function makeDateHourKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}`;
}

export function getCurrentSyncWindow(
  now: Date,
): { from: string; to: string; dateHour: string } | null {
  if (!SYNC_HOURS.includes(now.getHours() as (typeof SYNC_HOURS)[number])) return null;
  // `to` 는 윈도우 종료 시각(현재) 까지 보존 — date-only 면 서버에서 `T00:00:00` 으로 포맷되어
  // 당일 주문이 누락된다. `from` 은 7일 전 start-of-day 로 충분.
  const to = now.toISOString();
  const from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  return { from, to, dateHour: makeDateHourKey(now) };
}

export function getNumericShipmentBoxIds(
  orders: OrderListItem[],
): { ids: number[]; skipped: OrderListItem[] } {
  const ids: number[] = [];
  const skipped: OrderListItem[] = [];
  for (const order of orders) {
    if (order.shipmentBoxId !== null && order.shipmentBoxId !== undefined) {
      ids.push(order.shipmentBoxId);
    } else {
      skipped.push(order);
    }
  }
  return { ids, skipped };
}

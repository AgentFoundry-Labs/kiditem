import type { OrderListItem, OrderStatus } from '@kiditem/shared/order';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Derive a `YYYY-MM-DD` KST date string from any ISO timestamp / Date.
 * Avoids `Intl.*` / `toLocaleDateString()` (banned in apps/web/AGENTS.md) by
 * applying the +09:00 offset manually.
 */
export function toKstDateString(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

interface OrderDailyAggregate {
  date: string;
  orderCount: number;
  totalRevenue: number;
  totalQuantity: number;
}

/**
 * Group OrderListItems by KST `orderedAt` date. Returns ascending by date.
 * Includes empty days between min/max so the table renders coverage gaps.
 */
export function aggregateOrdersByDay(
  items: ReadonlyArray<OrderListItem>,
  range?: { from: string; to: string },
): OrderDailyAggregate[] {
  const map = new Map<string, OrderDailyAggregate>();
  for (const item of items) {
    const date = toKstDateString(item.orderedAt as unknown as string);
    const existing = map.get(date) ?? {
      date,
      orderCount: 0,
      totalRevenue: 0,
      totalQuantity: 0,
    };
    existing.orderCount += 1;
    existing.totalRevenue += item.totalPrice;
    existing.totalQuantity += item.totalQuantity;
    map.set(date, existing);
  }

  if (range) {
    for (const date of enumerateDateRange(range.from, range.to)) {
      if (!map.has(date)) {
        map.set(date, { date, orderCount: 0, totalRevenue: 0, totalQuantity: 0 });
      }
    }
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function enumerateDateRange(from: string, to: string): string[] {
  if (!isYmd(from) || !isYmd(to) || from > to) return [];
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const last = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() <= last.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

interface OrderRangeSummary {
  totalOrders: number;
  totalRevenue: number;
  totalQuantity: number;
  daysWithOrders: number;
  daysWithoutOrders: number;
  peakDay: { date: string; orderCount: number } | null;
}

export function summarizeOrderRange(
  daily: ReadonlyArray<OrderDailyAggregate>,
): OrderRangeSummary {
  let totalOrders = 0;
  let totalRevenue = 0;
  let totalQuantity = 0;
  let daysWithOrders = 0;
  let peak: OrderDailyAggregate | null = null;
  for (const row of daily) {
    totalOrders += row.orderCount;
    totalRevenue += row.totalRevenue;
    totalQuantity += row.totalQuantity;
    if (row.orderCount > 0) daysWithOrders += 1;
    if (!peak || row.orderCount > peak.orderCount) peak = row;
  }
  return {
    totalOrders,
    totalRevenue,
    totalQuantity,
    daysWithOrders,
    daysWithoutOrders: Math.max(0, daily.length - daysWithOrders),
    peakDay: peak && peak.orderCount > 0
      ? { date: peak.date, orderCount: peak.orderCount }
      : null,
  };
}

/**
 * Case-insensitive substring filter against the searchable OrderListItem fields
 * actually present in the current /api/orders contract. No coupangOrderId,
 * no product.name nesting — those fields do not exist on OrderListItem.
 */
export function filterOrderListItems(
  items: ReadonlyArray<OrderListItem>,
  rawTerm: string,
): OrderListItem[] {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return [...items];
  return items.filter((item) => {
    const haystacks: Array<string | null | undefined> = [
      item.displayOrderNumber,
      item.externalOrderId,
      item.externalNumber,
      item.trackingNumber,
      item.shippingCompany,
      item.customerName,
      item.receiverName,
      item.receiverAddr,
      item.primaryProductName,
      item.primaryOptionName,
      ...item.lineItems.flatMap((line) => [line.productName, line.optionName, line.sku]),
    ];
    return haystacks.some(
      (value) => typeof value === 'string' && value.toLowerCase().includes(term),
    );
  });
}

const ORDER_STATUS_BADGE: Record<OrderStatus, { label: string; color: string }> = {
  ACCEPT: { label: '결제완료', color: 'bg-blue-100 text-blue-800' },
  INSTRUCT: { label: '상품준비', color: 'bg-indigo-100 text-indigo-800' },
  DEPARTURE: { label: '배송지시', color: 'bg-violet-100 text-violet-800' },
  DELIVERING: { label: '배송중', color: 'bg-amber-100 text-amber-800' },
  FINAL_DELIVERY: { label: '배송완료', color: 'bg-green-100 text-green-800' },
  CANCELED: { label: '취소', color: 'bg-slate-100 text-slate-700' },
  NONE_TRACKING: { label: '송장없음', color: 'bg-slate-100 text-slate-700' },
};

export function orderStatusBadge(status: OrderStatus): { label: string; color: string } {
  return ORDER_STATUS_BADGE[status];
}

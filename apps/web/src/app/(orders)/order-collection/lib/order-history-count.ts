import type { StoredOrderCollectionFile } from './order-generated-file-store';

const COUPANG_DIRECT_KEY = 'coupang-direct';

export function getHistoryOrderCount(result: StoredOrderCollectionFile | null): number | null {
  if (!result) return null;
  if (result.orderNumbers && result.orderNumbers.length > 0) {
    return new Set(result.orderNumbers.map((value) => String(value).trim()).filter(Boolean)).size;
  }
  if (isCoupangDirectHistory(result)) {
    return result.sourceRows === null ? null : Math.max(0, result.sourceRows);
  }
  if (result.outputRows === null || result.productRows === null) return null;
  const orderCount = result.outputRows - result.productRows;
  return orderCount >= 0 ? orderCount : null;
}

export function getHistoryCollectionBucket(result: StoredOrderCollectionFile): string {
  if (!isCoupangDirectHistory(result)) return '__all__';
  const searchable = historySearchText(result);
  if (searchable.includes('shipment') || searchable.includes('쉽먼트')) return 'coupang-direct:shipment';
  if (searchable.includes('milkrun') || searchable.includes('밀크런')) return 'coupang-direct:milkrun';
  return 'coupang-direct:unknown';
}

function isCoupangDirectHistory(result: StoredOrderCollectionFile): boolean {
  return result.mallKey === COUPANG_DIRECT_KEY || historySearchText(result).includes('쿠팡직배송');
}

function historySearchText(result: StoredOrderCollectionFile): string {
  return `${result.mallKey ?? ''} ${result.mallName ?? ''} ${result.sourceName} ${result.fileName}`.toLowerCase();
}

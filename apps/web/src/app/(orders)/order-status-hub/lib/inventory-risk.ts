import type {
  ChannelSkuAvailabilityItem,
  ChannelSkuAvailabilityStatus,
} from '@kiditem/shared/channel-sku-availability';

export type OrderInventoryFilter = ChannelSkuAvailabilityStatus;

export const ORDER_INVENTORY_FILTERS: Array<{
  key: OrderInventoryFilter;
  label: string;
}> = [
  { key: 'all', label: '전체' },
  { key: 'in_stock', label: '판매 가능' },
  { key: 'out_of_stock', label: '품절' },
  { key: 'unmatched', label: '미매칭' },
  { key: 'needs_review', label: '확인 필요' },
];

export function orderInventoryDisplayName(item: ChannelSkuAvailabilityItem): string {
  const productName = item.product.registeredName ?? item.product.displayName ?? '상품명 없음';
  return item.sku.optionName ? `${productName} / ${item.sku.optionName}` : productName;
}

export function orderInventoryStatusBadge(item: ChannelSkuAvailabilityItem): {
  label: string;
  color: string;
} {
  if (item.sku.mappingStatus === 'unmatched') {
    return { label: '미매칭', color: 'bg-slate-100 text-slate-700' };
  }
  if (item.sku.mappingStatus === 'needs_review' || item.sku.sellableStock === null) {
    return { label: '확인 필요', color: 'bg-amber-100 text-amber-800' };
  }
  if (item.sku.sellableStock === 0) {
    return { label: '품절', color: 'bg-red-100 text-red-800' };
  }
  return { label: '판매 가능', color: 'bg-green-100 text-green-800' };
}

export function isOrderInventoryAttentionNeeded(item: ChannelSkuAvailabilityItem): boolean {
  return item.sku.mappingStatus !== 'matched'
    || item.sku.sellableStock === null
    || item.sku.sellableStock === 0;
}

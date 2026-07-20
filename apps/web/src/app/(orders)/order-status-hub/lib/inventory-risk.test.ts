import { describe, expect, it } from 'vitest';
import type { ChannelSkuAvailabilityItem } from '@kiditem/shared/channel-sku-availability';
import {
  ORDER_INVENTORY_FILTERS,
  isOrderInventoryAttentionNeeded,
  orderInventoryDisplayName,
  orderInventoryStatusBadge,
} from './inventory-risk';

const base: ChannelSkuAvailabilityItem = {
  channelAccount: {
    id: '00000000-0000-4000-8000-000000000101',
    channel: 'coupang',
    name: '쿠팡 Wing',
  },
  product: {
    id: '00000000-0000-4000-8000-000000000102',
    externalProductId: 'PRODUCT-1',
    registeredName: 'Sample Product',
    displayName: null,
    status: '판매중',
  },
  sku: {
    id: '00000000-0000-4000-8000-000000000103',
    externalSkuId: 'VENDOR-1',
    sellerSku: 'SELLER-1',
    optionName: null,
    barcode: null,
    modelNumber: null,
    salePrice: 10_000,
    status: '판매중',
    mappingStatus: 'matched',
    sellableStock: 12,
    updatedAt: '2026-07-12T00:00:00.000Z',
  },
  components: [{
    masterProductId: '00000000-0000-4000-8000-000000000104',
    code: 'SP-1',
    name: 'Sellpia product',
    optionName: null,
    barcode: null,
    currentStock: 12,
    purchasePrice: 1_000,
    isActive: true,
    quantity: 1,
    mappingSource: 'manual',
    componentCapacity: 12,
    isBottleneck: true,
  }],
  warnings: [],
};

describe('order-status channel SKU availability projection', () => {
  it('joins channel product and option names without ProductOption inventory', () => {
    expect(orderInventoryDisplayName(base)).toBe('Sample Product');
    expect(orderInventoryDisplayName({
      ...base,
      sku: { ...base.sku, optionName: '레드 / L' },
    })).toBe('Sample Product / 레드 / L');
  });

  it('filters by channel capacity and mapping attention states', () => {
    expect(ORDER_INVENTORY_FILTERS.map((filter) => filter.key)).toEqual([
      'all',
      'in_stock',
      'out_of_stock',
      'unmatched',
      'needs_review',
    ]);
  });

  it('maps channel availability to truthful badges', () => {
    expect(orderInventoryStatusBadge(base).label).toBe('판매 가능');
    expect(orderInventoryStatusBadge({
      ...base,
      sku: { ...base.sku, sellableStock: 0 },
    }).label).toBe('품절');
    expect(orderInventoryStatusBadge({
      ...base,
      sku: { ...base.sku, mappingStatus: 'unmatched', sellableStock: null },
    }).label).toBe('미매칭');
  });

  it('marks zero capacity and unresolved mappings as needing attention', () => {
    expect(isOrderInventoryAttentionNeeded(base)).toBe(false);
    expect(isOrderInventoryAttentionNeeded({
      ...base,
      sku: { ...base.sku, sellableStock: 0 },
    })).toBe(true);
    expect(isOrderInventoryAttentionNeeded({
      ...base,
      sku: { ...base.sku, mappingStatus: 'needs_review', sellableStock: null },
    })).toBe(true);
  });
});

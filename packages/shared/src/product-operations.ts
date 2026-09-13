import type {
  ProductInventoryFacts,
  ProductInventoryStatus,
  ProductOperationsAdStatus,
} from './schemas/product-operations.js';

export * from './schemas/product-operations.js';

export function deriveProductInventoryStatus(facts: {
  inventory: ProductInventoryFacts;
  inventoryUnits: number | null;
}): ProductInventoryStatus {
  if (facts.inventory.skuCount === 0) return 'configuration_required';
  if (facts.inventory.measuredSkuCount < facts.inventory.skuCount
    || facts.inventoryUnits === null) return 'uncollected';
  if (facts.inventory.inactiveSkuCount > 0) return 'review_required';
  return facts.inventoryUnits === 0 ? 'out_of_stock' : 'sellable';
}

export const PRODUCT_INVENTORY_LABELS = {
  sellable: '판매 가능',
  out_of_stock: '품절',
  configuration_required: '재고 연결 필요',
  review_required: '검토 필요',
  uncollected: '미수집',
} as const satisfies Record<ProductInventoryStatus, string>;

export const PRODUCT_ADVERTISING_LABELS = {
  active: '광고비 발생',
  inactive: '광고비 0원',
  unconfigured: '광고 미수집',
} as const satisfies Record<Exclude<ProductOperationsAdStatus, 'all'>, string>;

/** Advertising activity for the selected measured period, independent of operator tags. */
export function deriveProductAdvertisingStatus(
  adSpend: number | null,
): Exclude<ProductOperationsAdStatus, 'all'> {
  return adSpend === null ? 'unconfigured' : adSpend > 0 ? 'active' : 'inactive';
}

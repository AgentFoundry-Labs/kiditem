const CNY_TO_KRW_RATE = 190;

/** Resolver 입력: 가격 resolve에 필요한 최소 필드 */
export interface ResolvePricingInput {
  costPrice?: number | null;
  costCny?: unknown;
  sellPrice?: number | null;
  commissionRate?: unknown;
  masterProduct?: {
    costPrice?: number | null;
    sellPrice?: number | null;
    commissionRate?: unknown;
  } | null;
}

/** Resolver 입력: 재고 resolve에 필요한 최소 필드 */
export interface ResolveInventoryInput {
  inventory?: { currentStock?: number; safetyStock?: number; reorderPoint?: number } | null;
  masterProduct?: {
    inventory?: { currentStock?: number; safetyStock?: number } | null;
  } | null;
}

export interface ResolvedPricing {
  costPrice: number;
  sellPrice: number;
  commissionRate: number;
  /** costPrice가 실제 데이터 없이 0으로 fallback된 경우 true */
  isCostMissing: boolean;
}

export interface ResolvedInventory {
  currentStock: number;
  safetyStock: number;
  reorderPoint: number;
}

/**
 * MasterProduct 우선, Product fallback 가격 resolve.
 * costPrice: masterProduct.costPrice ?? product.costPrice ?? Math.round(costCny * 190) ?? 0 (전부 KRW)
 * sellPrice: product.sellPrice ?? masterProduct.sellPrice ?? 0 (Product(쿠팡) 우선)
 * commissionRate: masterProduct.commissionRate ?? product.commissionRate ?? 0
 */
export function resolvePricing(p: ResolvePricingInput): ResolvedPricing {
  const mp = p.masterProduct;

  const hasCost = mp?.costPrice != null || p.costPrice != null || p.costCny != null;
  const costPrice =
    mp?.costPrice ??
    p.costPrice ??
    (p.costCny != null ? Math.round(Number(p.costCny) * CNY_TO_KRW_RATE) : 0);

  const sellPrice = p.sellPrice ?? mp?.sellPrice ?? 0;

  const commissionRate =
    mp?.commissionRate != null
      ? Number(mp.commissionRate)
      : p.commissionRate != null
        ? Number(p.commissionRate)
        : 0;

  return { costPrice, sellPrice, commissionRate, isCostMissing: !hasCost };
}

/**
 * MasterInventory 우선, Inventory fallback 재고 resolve.
 * currentStock: masterProduct.inventory.currentStock ?? product.inventory.currentStock ?? 0
 * safetyStock: masterProduct.inventory.safetyStock ?? product.inventory.safetyStock ?? 0
 * reorderPoint: product.inventory.reorderPoint ?? 0 (MasterInventory에 없는 필드)
 */
export function resolveInventory(p: ResolveInventoryInput): ResolvedInventory {
  const mi = p.masterProduct?.inventory;
  const inv = p.inventory;

  const currentStock = mi?.currentStock ?? inv?.currentStock ?? 0;
  const safetyStock = mi?.safetyStock ?? inv?.safetyStock ?? 0;
  const reorderPoint = inv?.reorderPoint ?? 0;

  return { currentStock, safetyStock, reorderPoint };
}

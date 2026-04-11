import type { MasterProduct, MasterInventory, Product, Inventory } from '@prisma/client';

type ProductWithMaster = Product & {
  masterProduct?: (MasterProduct & { inventory?: MasterInventory | null }) | null;
  inventory?: Inventory | null;
};

export interface ResolvedPricing {
  costPrice: number;
  sellPrice: number;
  commissionRate: number;
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
export function resolvePricing(p: ProductWithMaster): ResolvedPricing {
  const mp = p.masterProduct;

  const costPrice =
    mp?.costPrice ??
    p.costPrice ??
    (p.costCny ? Math.round(Number(p.costCny) * 190) : 0);

  const sellPrice = p.sellPrice ?? mp?.sellPrice ?? 0;

  const commissionRate =
    mp?.commissionRate != null
      ? Number(mp.commissionRate)
      : p.commissionRate != null
        ? Number(p.commissionRate)
        : 0;

  return { costPrice, sellPrice, commissionRate };
}

/**
 * MasterInventory 우선, Inventory fallback 재고 resolve.
 * currentStock: masterProduct.inventory.currentStock ?? product.inventory.currentStock ?? 0
 * safetyStock: masterProduct.inventory.safetyStock ?? product.inventory.safetyStock ?? 0
 * reorderPoint: product.inventory.reorderPoint ?? 0 (MasterInventory에 없는 필드)
 */
export function resolveInventory(p: ProductWithMaster): ResolvedInventory {
  const mi = p.masterProduct?.inventory;
  const inv = p.inventory;

  const currentStock = mi?.currentStock ?? inv?.currentStock ?? 0;
  const safetyStock = mi?.safetyStock ?? inv?.safetyStock ?? 0;
  const reorderPoint = inv?.reorderPoint ?? 0;

  return { currentStock, safetyStock, reorderPoint };
}

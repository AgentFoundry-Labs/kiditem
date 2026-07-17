import type { ProductDepletionProjection } from '@kiditem/shared/product-operations';

type DepletionSourceRow = Readonly<{
  needsReorder: boolean;
  monthsOfAvailableStockLeft: number | null;
  inventoryResolution:
    | Readonly<{ status: 'not_collected' | 'mapping_required' }>
    | Readonly<{
      status: 'matched';
      sellpiaInventorySkuId: string;
      destinations: ReadonlyArray<{ masterProductId: string }>;
    }>;
}>;

type SkuDepletion = {
  needsReorder: boolean;
  minMonths: number | null;
  shared: boolean;
};

export function buildProductDepletionProjections(
  masterProductIds: readonly string[],
  rows: readonly DepletionSourceRow[],
): Map<string, ProductDepletionProjection> {
  const requestedIds = new Set(masterProductIds);
  const byMasterProduct = new Map<string, Map<string, SkuDepletion>>();

  for (const row of rows) {
    if (row.inventoryResolution.status !== 'matched') continue;
    const destinationMasterIds = [...new Set(row.inventoryResolution.destinations
      .map(({ masterProductId }) => masterProductId))];
    const shared = destinationMasterIds.length > 1;
    for (const masterProductId of destinationMasterIds) {
      if (!requestedIds.has(masterProductId)) continue;
      const bySku = byMasterProduct.get(masterProductId) ?? new Map();
      const current = bySku.get(row.inventoryResolution.sellpiaInventorySkuId);
      bySku.set(row.inventoryResolution.sellpiaInventorySkuId, {
        needsReorder: (current?.needsReorder ?? false) || row.needsReorder,
        minMonths: minNullable(
          current?.minMonths ?? null,
          row.monthsOfAvailableStockLeft,
        ),
        shared: (current?.shared ?? false) || shared,
      });
      byMasterProduct.set(masterProductId, bySku);
    }
  }

  return new Map<string, ProductDepletionProjection>(masterProductIds.map((masterProductId) => {
    const bySku = byMasterProduct.get(masterProductId);
    if (!bySku || bySku.size === 0) {
      return [masterProductId, {
        coverage: 'no_direct_sales',
        needsReorder: false,
        reorderSkuCount: 0,
        minMonthsOfAvailableStockLeft: null,
      } satisfies ProductDepletionProjection];
    }
    const skus = [...bySku.values()];
    return [masterProductId, {
      coverage: skus.some(({ shared }) => shared) ? 'shared' : 'ready',
      needsReorder: skus.some(({ needsReorder }) => needsReorder),
      reorderSkuCount: skus.filter(({ needsReorder }) => needsReorder).length,
      minMonthsOfAvailableStockLeft: skus.reduce<number | null>(
        (minimum, sku) => minNullable(minimum, sku.minMonths),
        null,
      ),
    } satisfies ProductDepletionProjection];
  }));
}

function minNullable(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

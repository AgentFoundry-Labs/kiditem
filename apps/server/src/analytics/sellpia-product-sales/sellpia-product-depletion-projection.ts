import type { ProductDepletionProjection } from '@kiditem/shared/product-operations';

type DepletionSourceRow = Readonly<{
  needsReorder: boolean;
  monthlyOutflow: number | null;
  outflowMonthCount: number;
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
  /**
   * 그 SKU 의 월 평균 소진. 같은 SKU 로 해소된 판매행들은 이미 합쳐진 같은 값을 들고
   * 오므로 더하지 않고 덮어쓴다 — 행마다 더하면 SKU 가 몇 번이고 세어진다.
   */
  monthlyOutflow: number | null;
  outflowMonthCount: number;
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
        monthlyOutflow: row.monthlyOutflow,
        outflowMonthCount: row.outflowMonthCount,
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
        monthlyOutflow: null,
        outflowMonthCount: 0,
        minMonthsOfAvailableStockLeft: null,
      } satisfies ProductDepletionProjection];
    }
    const skus = [...bySku.values()];
    // 옆 칸(재고)과 같은 규칙이다: SKU 하나라도 잴 근거가 없으면 부분 합 대신 비운다.
    // 재고는 다 세고 소진은 일부만 센 숫자는 남은 개월수를 실제보다 길게 보이게 만든다.
    const outflowMeasured = skus.every(({ monthlyOutflow }) => monthlyOutflow !== null);
    return [masterProductId, {
      coverage: skus.some(({ shared }) => shared) ? 'shared' : 'ready',
      needsReorder: skus.some(({ needsReorder }) => needsReorder),
      reorderSkuCount: skus.filter(({ needsReorder }) => needsReorder).length,
      monthlyOutflow: outflowMeasured
        ? skus.reduce((sum, sku) => sum + (sku.monthlyOutflow ?? 0), 0)
        : null,
      // 평균이 몇 달을 덮었는지는 가장 약한 근거를 따른다.
      outflowMonthCount: Math.min(...skus.map(({ outflowMonthCount }) => outflowMonthCount)),
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

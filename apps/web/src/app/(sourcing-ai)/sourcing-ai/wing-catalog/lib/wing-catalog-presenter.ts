export type WingCatalogSortKey =
  | 'sales'
  | 'revenue'
  | 'views'
  | 'conversion'
  | 'reviews';

export interface WingCatalogProduct {
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  itemName: string | null;
  brandName: string | null;
  manufacture: string | null;
  categoryHierarchy: string | null;
  imagePath: string | null;
  salePrice: number | null;
  rating: number | null;
  ratingCount: number | null;
  pvLast28Day: number | null;
  salesLast28d: number | null;
  estimatedRevenue28d: number | null;
  conversionRate28d: number | null;
  deliveryInfo: string | null;
}

export interface WingCatalogSnapshotView {
  keyword: string;
  rows: WingCatalogProduct[];
  collectedCount: number;
  stopReason: 'partial_snapshot' | 'persisted_snapshot';
  endedAt: number | undefined;
}

export interface WingCatalogSummary {
  totalProducts: number;
  totalSalesLast28d: number;
  totalRevenueLast28d: number;
  totalViewsLast28d: number;
  averageConversionRate28d: number | null;
}

export function buildWingCatalogSummary(
  rows: WingCatalogProduct[],
): WingCatalogSummary {
  let totalSalesLast28d = 0;
  let totalRevenueLast28d = 0;
  let totalViewsLast28d = 0;
  let conversionSum = 0;
  let conversionCount = 0;

  for (const row of rows) {
    totalSalesLast28d += row.salesLast28d ?? 0;
    totalRevenueLast28d += row.estimatedRevenue28d ?? 0;
    totalViewsLast28d += row.pvLast28Day ?? 0;
    if (row.conversionRate28d != null) {
      conversionSum += row.conversionRate28d;
      conversionCount += 1;
    }
  }

  return {
    totalProducts: rows.length,
    totalSalesLast28d,
    totalRevenueLast28d,
    totalViewsLast28d,
    averageConversionRate28d:
      conversionCount > 0 ? conversionSum / conversionCount : null,
  };
}

export function sortWingCatalogRows(
  rows: WingCatalogProduct[],
  sortKey: WingCatalogSortKey,
): WingCatalogProduct[] {
  const valueOf = (row: WingCatalogProduct): number => {
    if (sortKey === 'sales') return row.salesLast28d ?? -1;
    if (sortKey === 'revenue') return row.estimatedRevenue28d ?? -1;
    if (sortKey === 'views') return row.pvLast28Day ?? -1;
    if (sortKey === 'conversion') return row.conversionRate28d ?? -1;
    return row.ratingCount ?? -1;
  };

  return [...rows].sort((left, right) => valueOf(right) - valueOf(left));
}

export function resolveCoupangCatalogImageUrl(
  imagePath: string | null,
): string | null {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const normalized = imagePath.replace(/^\/+/, '');
  return `https://thumbnail10.coupangcdn.com/thumbnails/remote/160x160ex/image/${normalized}`;
}

export function formatWingCatalogRate(
  value: number | null | undefined,
): string {
  if (value == null) return '-';
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

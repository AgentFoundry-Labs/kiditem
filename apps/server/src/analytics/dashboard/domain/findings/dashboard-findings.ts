import type {
  DashboardFindingProduct,
  DashboardReorderSuggestion,
  DashboardSalesDecline,
  SellpiaProductSalesRow,
  SellpiaProductSalesSummary,
} from '@kiditem/shared/dashboard';

/**
 * The dashboard's findings, picked out of the Sellpia depletion read.
 *
 * The verdicts are the owner's: a product is declining when its depletion
 * `trend` is `down` (the last complete month at or below 80% of the months
 * before it), and needs a reorder when `needsReorder` says so. What is decided
 * here is only which of those an operator sees first.
 */

/** 주요 상품 — the products with the largest monthly revenue before the compared month. */
export const KEY_PRODUCT_LIMIT = 30;
const DECLINE_ITEM_LIMIT = 5;
const SUGGESTION_LIMIT = 5;
/** `monthsOfAvailableStockLeft` counts in 30-day months. */
const DAYS_PER_MONTH = 30;
/** The months before the compared one that the trend averages — the owner's window. */
const TREND_BASELINE_MONTHS = 3;
/**
 * Urgency bands for a reorder suggestion. Within a band the product with more
 * monthly revenue comes first, so a best seller running out this week outranks
 * a slow SKU that happens to have two units left.
 */
const URGENCY_BANDS_IN_DAYS = [7, 14, 30] as const;

/** A month's units with an anomalous month counted as 0 — what the trend itself reads. */
function trendQty(row: SellpiaProductSalesRow, yearMonth: string): number {
  const point = row.monthly.find((candidate) => candidate.yearMonth === yearMonth);
  return !point || point.anomaly ? 0 : point.orderQty;
}

function findingProduct(row: SellpiaProductSalesRow): DashboardFindingProduct {
  const resolution = row.inventoryResolution;
  const destinations = resolution.status === 'matched' ? resolution.destinations : [];
  const masterProductId = resolution.status === 'matched'
    ? resolution.inventoryProduct?.masterProductId ?? destinations[0]?.masterProductId ?? null
    : null;
  return {
    productCode: row.productCode,
    name: row.productName,
    optionName: row.optionName,
    masterProductId,
    imageUrl: destinations.find((destination) => destination.displayImage)?.displayImage?.url ?? null,
  };
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function findSalesDecline(summary: SellpiaProductSalesSummary): DashboardSalesDecline {
  const complete = summary.completeMonths;
  const month = complete.at(-1);
  if (!summary.hasData || complete.length < 2 || !month) {
    return { month: null, keyProductLimit: KEY_PRODUCT_LIMIT, count: null, items: [] };
  }
  const baselineMonths = complete.slice(
    Math.max(0, complete.length - 1 - TREND_BASELINE_MONTHS),
    -1,
  );

  const keyProducts = summary.products
    .map((row) => {
      const baselineQty = baselineMonths
        .reduce((sum, yearMonth) => sum + trendQty(row, yearMonth), 0) / baselineMonths.length;
      return {
        row,
        baselineQty,
        recentQty: trendQty(row, month),
        baselineRevenue: baselineQty * row.salePrice,
      };
    })
    .filter((entry) => entry.baselineRevenue > 0)
    .sort((left, right) => right.baselineRevenue - left.baselineRevenue)
    .slice(0, KEY_PRODUCT_LIMIT);

  const declining = keyProducts
    .filter((entry) => entry.row.trend === 'down')
    .sort((left, right) =>
      (right.baselineQty - right.recentQty) * right.row.salePrice
      - (left.baselineQty - left.recentQty) * left.row.salePrice);

  return {
    month,
    keyProductLimit: KEY_PRODUCT_LIMIT,
    count: declining.length,
    items: declining.slice(0, DECLINE_ITEM_LIMIT).map((entry) => ({
      ...findingProduct(entry.row),
      recentQty: entry.recentQty,
      baselineQty: roundOne(entry.baselineQty),
      changePercent: roundOne(((entry.recentQty - entry.baselineQty) / entry.baselineQty) * 100),
    })),
  };
}

function urgencyBand(daysLeft: number): number {
  const band = URGENCY_BANDS_IN_DAYS.findIndex((limit) => daysLeft <= limit);
  return band === -1 ? URGENCY_BANDS_IN_DAYS.length : band;
}

/**
 * Reorder-needed SKUs that still have stock, most urgent first. A SKU already
 * at zero is the 품절 count's, not a forecast. Null when stock was never
 * collected — the projection could not say who needs a reorder.
 */
export function findReorderSuggestions(
  summary: SellpiaProductSalesSummary,
): DashboardReorderSuggestion[] | null {
  if (!summary.hasData || !summary.hasStock) return null;

  // The projection is per inventory SKU, and several sales rows can share one;
  // their verdicts are the SKU's, and their outflow adds up to its rate.
  const bySku = new Map<string, SellpiaProductSalesRow[]>();
  for (const row of summary.products) {
    const resolution = row.inventoryResolution;
    if (resolution.status !== 'matched' || !row.needsReorder) continue;
    if (resolution.availableStock <= 0 || row.monthsOfAvailableStockLeft === null) continue;
    const rows = bySku.get(resolution.sellpiaInventorySkuId) ?? [];
    rows.push(row);
    bySku.set(resolution.sellpiaInventorySkuId, rows);
  }

  return [...bySku.values()]
    .map((rows) => {
      const lead = [...rows].sort((left, right) => right.avg2m - left.avg2m)[0]!;
      const resolution = lead.inventoryResolution as Extract<
        SellpiaProductSalesRow['inventoryResolution'],
        { status: 'matched' }
      >;
      return {
        suggestion: {
          ...findingProduct(lead),
          availableStock: resolution.availableStock,
          // 소유자가 발표한 그 SKU 의 비율을 그대로 쓴다. 판매행마다 이미 반올림된
          // avg2m 을 더하면 Σ round(x/2) 가 되어, 바로 옆 `daysLeft` 가 쓰는
          // round(Σx/2) 와 어긋난 채 같은 말로 표시된다(2026-09-21 점검).
          monthlyOutflow: lead.monthlyOutflow ?? 0,
          daysLeft: Math.round(lead.monthsOfAvailableStockLeft! * DAYS_PER_MONTH),
          reorderPoint: lead.reorderPoint,
        } satisfies DashboardReorderSuggestion,
        monthlyRevenue: rows.reduce((sum, row) => sum + row.avg2m * row.salePrice, 0),
      };
    })
    .filter(({ suggestion }) => suggestion.monthlyOutflow > 0)
    .sort((left, right) =>
      urgencyBand(left.suggestion.daysLeft) - urgencyBand(right.suggestion.daysLeft)
      || right.monthlyRevenue - left.monthlyRevenue
      || left.suggestion.daysLeft - right.suggestion.daysLeft)
    .slice(0, SUGGESTION_LIMIT)
    .map(({ suggestion }) => suggestion);
}

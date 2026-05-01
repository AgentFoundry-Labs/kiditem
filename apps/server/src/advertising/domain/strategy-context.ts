import type {
  AdAggregateRow,
  HydratedListing,
  InventoryRow,
  ListingMetricsRow,
} from './model/strategy-types';

/**
 * Pure helpers used to assemble strategy context. No Prisma, no NestJS DI.
 * Extracted from `ad-strategy.service.ts` (module-private helpers) and
 * `services/util/ad-strategy-helpers.ts` (date helpers) so the orchestration
 * service shrinks to endpoint-level concerns.
 */

export function getCurrentPeriod(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Analysis period range as ISO date strings (local timezone — KST in
 * production). `toISOString()` would shift to UTC which is wrong at KST
 * midnight, so we format from local Date components.
 */
export function getWeekRange(period: '7d' | '14d' | 'month'): { start: string; end: string } {
  const today = new Date();
  const end = formatLocalDate(today);
  let start: string;
  if (period === 'month') {
    start = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
  } else {
    const days = period === '7d' ? 7 : 14;
    start = formatLocalDate(new Date(today.getTime() - days * 24 * 60 * 60 * 1000));
  }
  return { start, end };
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const id of ids) if (id) set.add(id);
  return [...set];
}

export function buildGradeMap(listings: HydratedListing[]): Map<string, 'A' | 'B' | 'C' | null> {
  const map = new Map<string, 'A' | 'B' | 'C' | null>();
  for (const l of listings) {
    const g = l.masterProduct.abcGrade;
    map.set(l.id, g === 'A' || g === 'B' || g === 'C' ? g : null);
  }
  return map;
}

/**
 * BudgetAllocator input requires non-null grades. null grades are excluded
 * from the budget allocation buckets (A/B/C only).
 */
export function toGradeMapStrict(
  map: Map<string, 'A' | 'B' | 'C' | null>,
): Map<string, 'A' | 'B' | 'C'> {
  const out = new Map<string, 'A' | 'B' | 'C'>();
  for (const [id, g] of map) if (g) out.set(id, g);
  return out;
}

/**
 * `ChannelListingDailySnapshot.groupBy` result → AdAggregateRow[].
 * listingId null is dropped; ad metric columns are mapped to the generic
 * `spend / revenue / clicks / impressions / conversions` shape.
 */
export function toAdAggregateRows(
  rows: Array<{
    listingId: string | null;
    _sum: {
      adSpend: number | null;
      adRevenue: number | null;
      adClicks: number | null;
      adImpressions: number | null;
      adConversions: number | null;
    };
  }>,
): AdAggregateRow[] {
  const out: AdAggregateRow[] = [];
  for (const r of rows) {
    if (!r.listingId) continue;
    out.push({
      listingId: r.listingId,
      spend: r._sum.adSpend ?? 0,
      revenue: r._sum.adRevenue ?? 0,
      clicks: r._sum.adClicks ?? 0,
      impressions: r._sum.adImpressions ?? 0,
      conversions: r._sum.adConversions ?? 0,
    });
  }
  return out;
}

/** AdAggregateRow → calcSnapshotKeyMetrics expects a flat snapshot shape. */
export function adAggregatesToMetricSnapshots(adGroups: AdAggregateRow[]) {
  return adGroups.map((g) => ({
    listingId: g.listingId,
    spend: g.spend,
    revenue: g.revenue,
    clicks: g.clicks,
    impressions: g.impressions,
    conversions: g.conversions,
  }));
}

/** InventoryRow map → listingId → first optionId (primary option). */
export function firstOptionByListing(inventory: Map<string, InventoryRow>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [optionId, row] of inventory) {
    if (!map.has(row.listingId)) map.set(row.listingId, optionId);
  }
  return map;
}

/** Sum of `availableStock` across all options that belong to a listing. */
export function sumListingStock(inventory: Map<string, InventoryRow>, listingId: string): number {
  let total = 0;
  for (const row of inventory.values()) {
    if (row.listingId === listingId) total += row.availableStock;
  }
  return total;
}

/**
 * primary option profitRate (% scale). Mirrors the calcOptionProfitRate logic
 * from the original ad-strategy.service. Note this is `× 100` for display,
 * unlike ad-grade-rules which uses a 0..1 ratio internally.
 */
export function computeListingProfitRate(inv: InventoryRow | null): number {
  if (!inv) return 0;
  const sell = inv.sellPrice ?? 0;
  if (sell <= 0) return 0;
  // Unknown cost is neutral for exposure scoring; treating it as free stock
  // would incorrectly boost the product as highly profitable.
  if (inv.costPrice == null) return 0;
  const cost = inv.costPrice;
  const commission = inv.commissionRate != null ? Number(inv.commissionRate) : 0;
  return Math.round(((sell - cost - sell * commission) / sell) * 100);
}

/** Zero-metrics row for listings without ad snapshots. */
export function emptyMetrics(listingId: string): ListingMetricsRow {
  return {
    listingId,
    metrics: {
      spend: 0,
      revenue: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      ctr: null,
      roas: null,
      cvr: null,
    },
  } satisfies ListingMetricsRow;
}

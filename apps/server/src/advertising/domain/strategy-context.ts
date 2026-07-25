import type {
  AdAggregateRow,
  HydratedListing,
  ListingMetricsRow,
} from './model/strategy-types';
import { periodBounds } from './ad-metrics';
import type { ChannelSkuAvailabilityItem } from '@kiditem/shared/channel-sku-availability';

/**
 * Pure helpers used to assemble strategy context. No Prisma, no NestJS DI.
 * Extracted from `ad-strategy.service.ts` (module-private helpers) and
 * `services/util/ad-strategy-helpers.ts` (date helpers) so the orchestration
 * service shrinks to endpoint-level concerns.
 */

export function getCurrentPeriod(now: Date = new Date()): { year: number; month: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1 };
}

/**
 * Analysis period labels use the same complete-day bounds as the underlying
 * advertising reads. This keeps strategy headers aligned with the chart and
 * KPI totals in UTC production containers as well as KST developer machines.
 */
export function getWeekRange(
  period: '7d' | '14d' | 'month',
  now: Date = new Date(),
): { start: string; end: string } {
  const bounds = periodBounds(period, now);
  return {
    start: bounds.from.toISOString().slice(0, 10),
    end: bounds.to.toISOString().slice(0, 10),
  };
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

export function computeChannelSkuPurchaseCost(
  components: Array<{ purchasePrice: number | null; quantity: number }>,
): number | null {
  if (components.length === 0 || components.some((component) => component.purchasePrice === null)) {
    return null;
  }
  return components.reduce(
    (total, component) => total + component.purchasePrice! * component.quantity,
    0,
  );
}

export function applyChannelSkuAvailability(
  listings: HydratedListing[],
  availability: ChannelSkuAvailabilityItem[],
): HydratedListing[] {
  const availabilityBySkuId = new Map(
    availability.map((item) => [item.sku.id, item]),
  );
  return listings.map((listing) => {
    if (!listing.primaryOption) return listing;
    const item = availabilityBySkuId.get(listing.primaryOption.listingOptionId);
    if (!item) return listing;
    return {
      ...listing,
      primaryOption: {
        ...listing.primaryOption,
        sellableStock: item.sku.sellableStock,
        purchaseCost: computeChannelSkuPurchaseCost(item.components),
        salePrice: item.sku.salePrice,
      },
    };
  });
}

/**
 * primary option profitRate (% scale). Mirrors the calcOptionProfitRate logic
 * from the original ad-strategy.service. Note this is `× 100` for display,
 * unlike ad-grade-rules which uses a 0..1 ratio internally.
 */
export function computeListingProfitRate(option: HydratedListing['primaryOption']): number {
  if (!option) return 0;
  const sell = option.salePrice ?? 0;
  if (sell <= 0) return 0;
  // Unknown cost is neutral for exposure scoring; treating it as free stock
  // would incorrectly boost the product as highly profitable.
  if (option.purchaseCost == null) return 0;
  const cost = option.purchaseCost;
  const commission = option.commissionRate != null ? Number(option.commissionRate) : 0;
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

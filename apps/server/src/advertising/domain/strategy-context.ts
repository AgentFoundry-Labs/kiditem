import type {
  AdAggregateRow,
  HydratedListing,
} from './model/strategy-types';
import { periodBounds } from './ad-metrics';
import {
  businessDateKey,
  clipToClosedKstDays,
  kstBusinessDate,
  kstMonthWindow,
  type KstQueryWindow,
} from '../../common/kst';
import type { ChannelSkuAvailabilityItem } from '@kiditem/shared/channel-sku-availability';

/**
 * Pure helpers used to assemble strategy context. No Prisma, no NestJS DI.
 * Extracted from `ad-strategy.service.ts` (module-private helpers) and
 * `services/util/ad-strategy-helpers.ts` (date helpers) so the orchestration
 * service shrinks to endpoint-level concerns.
 */

export function getCurrentPeriod(now: Date = new Date()): { year: number; month: number } {
  const businessDate = kstBusinessDate(now);
  return { year: businessDate.getUTCFullYear(), month: businessDate.getUTCMonth() + 1 };
}

/**
 * The window listing profit rates are evaluated over: the KST month containing
 * `now`, clipped to the days already closed (ADR-0001). Those are the only
 * dates an Orders collection and the campaign sweep can have covered, so a
 * mid-month rate stops at yesterday, and on the 1st the window is empty rather
 * than borrowing the previous month.
 */
export function getProfitRateWindow(now: Date = new Date()): KstQueryWindow {
  const { year, month } = getCurrentPeriod(now);
  return clipToClosedKstDays(now, kstMonthWindow(year, month));
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
    start: businessDateKey(bounds.from),
    end: businessDateKey(bounds.to),
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
 * Per-listing measured ad facts → AdAggregateRow[]. A conversion count the
 * provider grid never carried is `null`, not the ledger's stored 0.
 */
export function toAdAggregateRows(
  rows: ReadonlyArray<{
    listingId: string;
    spend: number;
    revenue: number;
    clicks: number;
    impressions: number;
    conversions: number;
    conversionsObserved: boolean;
  }>,
): AdAggregateRow[] {
  return rows.map((r) => ({
    listingId: r.listingId,
    spend: r.spend,
    revenue: r.revenue,
    clicks: r.clicks,
    impressions: r.impressions,
    conversions: r.conversionsObserved ? r.conversions : null,
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

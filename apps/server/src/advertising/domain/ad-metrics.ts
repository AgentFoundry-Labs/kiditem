import { kstBusinessDate } from '../../common/kst';
import {
  recomputeRoas,
  recomputeCtr,
  recomputeCvr,
} from './util/ratio-recompute';
import type { AdMetrics } from '@kiditem/shared/advertising';

export type AdMetricSums = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

export type AdPeriod = '7d' | '14d' | 'month';

export type AdPeriodBounds = {
  from: Date;
  to: Date;
};

/**
 * Pure metric helpers shared by hub / campaign / benchmark services.
 *
 * Ratios always recompute from additive sums via `util/ratio-recompute`.
 * Provider per-row ratios are NOT trusted — they live in `metaJson` for
 * audit only.
 */
export function buildAdMetrics(sums: AdMetricSums): AdMetrics {
  const { spend, impressions, clicks, conversions, revenue } = sums;
  return {
    spend,
    impressions,
    clicks,
    conversions,
    revenue,
    ctr: recomputeCtr(clicks, impressions),
    roas: recomputeRoas(revenue, spend),
    cvr: recomputeCvr(conversions, clicks),
  };
}

/**
 * Complete Coupang advertising business-date window.
 *
 * Coupang's daily advertising report is complete through yesterday KST. A
 * rolling period therefore ends yesterday rather than including today's
 * incomplete row:
 *
 * - `7d`: yesterday plus the six preceding business dates
 * - `14d`: yesterday plus the thirteen preceding business dates
 * - `month`: current KST month start through yesterday
 *
 * Values are UTC-midnight `Date`s because the destination columns are
 * PostgreSQL `date` (`@db.Date`) fields. On the first day of a KST month the
 * month range is intentionally empty (`from > to`).
 */
export function periodBounds(
  period: AdPeriod,
  now: Date = new Date(),
): AdPeriodBounds {
  const today = kstBusinessDate(now);
  const yesterday = shiftUtcDate(today, -1);

  if (period === 'month') {
    return {
      from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
      to: yesterday,
    };
  }

  const days = period === '7d' ? 7 : 14;
  return {
    from: shiftUtcDate(yesterday, -(days - 1)),
    to: yesterday,
  };
}

/** Aggregate AdMetrics across daily entries (recomputes ratios from totals). */
export function aggregateAdMetrics(entries: { metrics: AdMetrics }[]): AdMetrics {
  const sums = entries.reduce<AdMetricSums>(
    (acc, e) => ({
      spend: acc.spend + e.metrics.spend,
      impressions: acc.impressions + e.metrics.impressions,
      clicks: acc.clicks + e.metrics.clicks,
      conversions: acc.conversions + e.metrics.conversions,
      revenue: acc.revenue + e.metrics.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
  );
  return buildAdMetrics(sums);
}

function shiftUtcDate(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

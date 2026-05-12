import { kstInclusiveDaysStart } from '../../common/kst';
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
 * Period → days. 'month' resolves to KST day-of-month so the inclusive
 * window matches the "current month" the user expects (server may be UTC).
 */
export function periodToDays(period: AdPeriod, fallback = 14): number {
  if (period === '7d') return 7;
  if (period === 'month') {
    const kstDay = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDate();
    return Math.max(kstDay, 1);
  }
  return fallback;
}

/** Inclusive KST cutoff: today + N-1 prior businessDates. */
export function periodCutoff(period: AdPeriod): Date {
  return kstInclusiveDaysStart(periodToDays(period, 14));
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

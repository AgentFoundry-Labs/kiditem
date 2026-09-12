import type { DashboardEffectivePeriod } from '@kiditem/shared/dashboard';
import type { DashboardContext } from '../context';

/**
 * Order-side aggregate for the effective period. Only revenue/adCost/orderCount
 * decide which sources fed the period, so cost/settlement fields are not read.
 */
export interface EffectivePeriodProfitMetrics {
  revenue: number;
  adCost: number;
  orderCount: number;
}

/**
 * Wing traffic aggregate, as published by the traffic aggregation port. The
 * fields listed here are the ones the Wing-revenue decision reads; a caller
 * cannot hand this module a pre-digested `hasData` verdict of its own, because
 * `/api/dashboard/sales` and `/api/dashboard/ad` must label the same month
 * with the same `revenueSource`.
 */
export interface WingRevenueEvidence {
  hasData: boolean;
  coverage?: { targetDays: number; completedDays: number } | null;
  reconciliation?: { revenue?: { status: string } | null } | null;
}

/** Coupang ads aggregate; `hasData` means the owner range is complete. */
export interface CoupangAdsEvidence {
  hasData: boolean;
}

/**
 * Order evidence exists when the window admitted revenue or an order row. A
 * collected zero-revenue window with orders still counts; an absent window
 * does not.
 */
export function hasOrderEvidence(metrics: {
  revenue: number;
  orderCount?: number;
}): boolean {
  return metrics.revenue !== 0 || (metrics.orderCount ?? 0) > 0;
}

/**
 * Wing revenue is usable evidence once the account range confirms a day and the
 * owner did not flag a revenue mismatch.
 *
 * It used to require the whole window. Coupang publishes Wing traffic a day
 * behind its sales, so a month-to-date window is short on almost every day of
 * the month, and the rule blanked the revenue card for the sake of the one day
 * the provider had not published — while ten measured days sat unread. That is
 * the same all-or-nothing shape the collection itself no longer has
 * (ADR-0005), and withholding here was the last place it survived.
 *
 * A short window is still not a claim about the whole window: `coverage`
 * travels with the value and the dashboard reads it as `부분 N/M일`. A MISMATCH
 * remains unusable — that is the owner saying the number is wrong, not short.
 *
 * This is the single definition: every caller — the revenue fallback, the
 * monthly trend, and `buildEffectivePeriod` below — asks this function.
 */
export function canUseWingRevenue(metrics: WingRevenueEvidence): boolean {
  if (!metrics.hasData) return false;
  const coverage = metrics.coverage;
  if (coverage && coverage.completedDays === 0) return false;
  return metrics.reconciliation?.revenue?.status !== 'MISMATCH';
}

export function buildEffectivePeriod(
  ctx: DashboardContext,
  latestDataDate: Date | null,
  cur: EffectivePeriodProfitMetrics,
  wingCur: WingRevenueEvidence,
  coupangAds: CoupangAdsEvidence,
): DashboardEffectivePeriod {
  const orderActive = hasOrderEvidence(cur);
  const wingActive = canUseWingRevenue(wingCur);
  const adsActive = coupangAds.hasData;

  let revenueSource: DashboardEffectivePeriod['revenueSource'] = 'none';
  if (orderActive && wingActive) revenueSource = 'mixed';
  else if (orderActive) revenueSource = 'orders';
  else if (wingActive) revenueSource = 'wing';

  let adSource: DashboardEffectivePeriod['adSource'] = 'none';
  if (cur.adCost > 0 && adsActive) adSource = 'mixed';
  else if (cur.adCost > 0) adSource = 'orders';
  else if (adsActive) adSource = 'coupang_ads';

  return {
    year: ctx.year,
    month: ctx.month,
    label: `${ctx.year}-${String(ctx.month).padStart(2, '0')}`,
    shifted: ctx.anchorShifted,
    latestDataDate: latestDataDate
      ? latestDataDate.toISOString().slice(0, 10)
      : null,
    revenueSource,
    adSource,
  } satisfies DashboardEffectivePeriod;
}

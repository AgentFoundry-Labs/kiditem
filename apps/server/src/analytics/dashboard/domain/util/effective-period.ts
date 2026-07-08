import type { DashboardEffectivePeriod } from '@kiditem/shared/dashboard';
import type { DashboardContext } from '../context';

interface EffectivePeriodProfitMetrics {
  revenue: number;
  adCost: number;
  orderCount: number;
}

interface EffectivePeriodWingTrafficMetrics {
  hasData: boolean;
}

interface EffectivePeriodCoupangAdsMetrics {
  hasData: boolean;
}

interface EffectivePeriodRocketMetrics {
  revenue: number;
  poCount: number;
  itemQty: number;
  hasData: boolean;
}

export function buildEffectivePeriod(
  ctx: DashboardContext,
  latestDataDate: Date | null,
  cur: EffectivePeriodProfitMetrics,
  wingCur: EffectivePeriodWingTrafficMetrics,
  coupangAds: EffectivePeriodCoupangAdsMetrics,
  rocketCur?: EffectivePeriodRocketMetrics,
): DashboardEffectivePeriod {
  const orderActive = cur.revenue !== 0 || cur.orderCount > 0;
  const wingActive = wingCur.hasData;
  const rocketActive = Boolean(
    rocketCur?.hasData &&
      (rocketCur.revenue !== 0 || rocketCur.poCount > 0 || rocketCur.itemQty > 0),
  );
  const adsActive = coupangAds.hasData;

  let revenueSource: DashboardEffectivePeriod['revenueSource'] = 'none';
  if ((orderActive && wingActive) || (orderActive && rocketActive)) revenueSource = 'mixed';
  else if (orderActive) revenueSource = 'orders';
  else if (wingActive && rocketActive) revenueSource = 'wing_rocket';
  else if (wingActive) revenueSource = 'wing';
  else if (rocketActive) revenueSource = 'rocket';

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

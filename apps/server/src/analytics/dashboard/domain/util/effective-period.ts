import type { DashboardEffectivePeriod } from '@kiditem/shared/dashboard';
import type {
  CoupangAdsMetrics,
  WingTrafficMetrics,
} from '../../application/port/out/wing-traffic-aggregation.repository.port';
import type { RangeProfitMetrics } from '../../application/port/out/profit-calculation.repository.port';
import type { DashboardContext } from '../context';

export function buildEffectivePeriod(
  ctx: DashboardContext,
  latestDataDate: Date | null,
  cur: RangeProfitMetrics,
  wingCur: WingTrafficMetrics,
  coupangAds: CoupangAdsMetrics,
): DashboardEffectivePeriod {
  const orderActive = cur.revenue !== 0 || cur.orderCount > 0;
  const wingActive = wingCur.hasData;
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

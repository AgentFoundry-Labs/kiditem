import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DashboardTrendItem } from '@kiditem/shared/dashboard';
import {
  PROFIT_CALCULATION_REPOSITORY_PORT,
  type ProfitCalculationRepositoryPort,
} from '../port/out/profit-calculation.repository.port';
import {
  DASHBOARD_TREND_REPOSITORY_PORT,
  type DashboardTrendRepositoryPort,
} from '../port/out/dashboard-trend.repository.port';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
} from '../port/out/wing-traffic-aggregation.repository.port';
import { kstInclusiveDaysStart } from '../../../../common/kst';

@Injectable()
export class DashboardTrendService {
  private readonly logger = new Logger(DashboardTrendService.name);

  constructor(
    @Inject(PROFIT_CALCULATION_REPOSITORY_PORT)
    private readonly profitCalculation: ProfitCalculationRepositoryPort,
    @Inject(DASHBOARD_TREND_REPOSITORY_PORT)
    private readonly trendRepository: DashboardTrendRepositoryPort,
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
  ) {}

  async getTrend(organizationId: string, range: string): Promise<DashboardTrendItem[]> {
    const startedAt = Date.now();
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = kstInclusiveDaysStart(days);

    const profitMetrics = await this.profitCalculation.calculateForRange(
      organizationId,
      since,
      new Date(),
    );
    const avgProfitRate =
      profitMetrics.revenue > 0 ? profitMetrics.netProfit / profitMetrics.revenue : 0;

    const [orderRows, listingAdRows, wingDailyRows, coupangAdsRows] = await Promise.all([
      this.trendRepository.fetchTrendRevenueRows(organizationId, since),
      this.trendRepository.fetchTrendAdCostRows(organizationId, since),
      this.wingTrafficRepository.fetchDailyTrend(organizationId, since),
      this.wingTrafficRepository.fetchDailyAds(organizationId, since),
    ]);

    const orderRevByDate = new Map(orderRows.map((r) => [r.date, Number(r.revenue)]));
    const wingRevByDate = new Map(wingDailyRows.map((r) => [r.date, Number(r.revenue)]));
    const listingAdByDate = new Map(listingAdRows.map((r) => [r.date, Number(r.ad_cost)]));
    const coupangAdsByDate = new Map(coupangAdsRows.map((r) => [r.date, Number(r.ad_cost)]));

    const allDates = new Set<string>([
      ...orderRevByDate.keys(),
      ...wingRevByDate.keys(),
      ...listingAdByDate.keys(),
      ...coupangAdsByDate.keys(),
    ]);

    const result: DashboardTrendItem[] = [...allDates]
      .sort()
      .map((date) => {
        const orderRev = orderRevByDate.get(date) ?? 0;
        const wingRev = wingRevByDate.get(date) ?? 0;
        // Prefer order revenue when present; otherwise the Wing/Drive
        // daily fact. Wing rows can be negative (returns spike) which we
        // preserve so the trend line reflects reality.
        const revenue = orderRev !== 0 ? orderRev : wingRev;

        // Ad cost: prefer the larger of the two sources for the same day.
        // Drive replay populates `coupang_ads_daily`; live workspaces
        // populate `channel_listing_daily_snapshots.ad_*`.
        const adCost = Math.max(
          listingAdByDate.get(date) ?? 0,
          coupangAdsByDate.get(date) ?? 0,
        );
        const profit = orderRev !== 0
          ? Math.round(orderRev * avgProfitRate)
          : 0;
        return { date, revenue, profit, adCost } satisfies DashboardTrendItem;
      });

    this.logger.debug({
      msg: 'dashboard-trend.getTrend',
      organizationId,
      range,
      days,
      rowCount: result.length,
      avgProfitRate,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }
}

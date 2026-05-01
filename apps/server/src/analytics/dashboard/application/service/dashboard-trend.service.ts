import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { DashboardTrendItem } from '@kiditem/shared/dashboard';
import { calculateProfitForRange } from '../../adapter/out/repository/profit-calculation.repository.adapter';
import { DashboardTrendRepositoryAdapter } from '../../adapter/out/repository/dashboard-trend.repository.adapter';
import { kstInclusiveDaysStart } from '../../../../common/kst';

@Injectable()
export class DashboardTrendService {
  private readonly logger = new Logger(DashboardTrendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trendRepository: DashboardTrendRepositoryAdapter,
  ) {}

  async getTrend(organizationId: string, range: string): Promise<DashboardTrendItem[]> {
    const startedAt = Date.now();
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    // KST-anchored cutoff so the day grouping aligns with daily-fact
    // `business_date` (KST date column) and order rows tagged at KST.
    const since = kstInclusiveDaysStart(days);

    // Plan F1 T4 — avgProfitRate via calculateProfitForRange (replaces profitLoss.aggregate, ADR-0016).
    // Returns ratio (e.g. 0.3 for 30%) — used as a per-day multiplier downstream.
    const profitMetrics = await calculateProfitForRange(this.prisma, organizationId, since, new Date());
    const avgProfitRate =
      profitMetrics.revenue > 0 ? profitMetrics.netProfit / profitMetrics.revenue : 0;

    // ADR-0018 Rule 2 + Plan F1 T4 — I3 fix: SUM(oli.total_price), NOT SUM(o.total_price).
    // Both queries bind ${organizationId}::uuid via Prisma tagged template (ADR-0009).
    const [orderRows, adRows] = await Promise.all([
      this.trendRepository.fetchTrendRevenueRows(organizationId, since),
      this.trendRepository.fetchTrendAdCostRows(organizationId, since),
    ]);

    const adMap = new Map(adRows.map((r) => [r.date, Number(r.ad_cost)]));

    const result = orderRows.map((r) => {
      const revenue = Number(r.revenue);
      const profit = Math.round(revenue * avgProfitRate);
      return {
        date: r.date,
        revenue,
        profit,
        adCost: adMap.get(r.date) ?? 0,
      } satisfies DashboardTrendItem;
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

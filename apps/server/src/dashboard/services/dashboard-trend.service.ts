import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardTrendItem } from '@kiditem/shared';
import { calculateProfitForRange } from '../helpers/profit-calculator';
import { kstDayStart } from '../../common/kst';

@Injectable()
export class DashboardTrendService {
  private readonly logger = new Logger(DashboardTrendService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTrend(companyId: string, range: string): Promise<DashboardTrendItem[]> {
    const startedAt = Date.now();
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    // KST-anchored cutoff so the day grouping aligns with daily-fact
    // `business_date` (KST date column) and order rows tagged at KST.
    const since = new Date(kstDayStart(new Date()).getTime() - days * 86400000);

    // Plan F1 T4 — avgProfitRate via calculateProfitForRange (replaces profitLoss.aggregate, ADR-0016).
    // Returns ratio (e.g. 0.3 for 30%) — used as a per-day multiplier downstream.
    const profitMetrics = await calculateProfitForRange(this.prisma, companyId, since, new Date());
    const avgProfitRate =
      profitMetrics.revenue > 0 ? profitMetrics.netProfit / profitMetrics.revenue : 0;

    // ADR-0018 Rule 2 + Plan F1 T4 — I3 fix: SUM(oli.total_price), NOT SUM(o.total_price).
    // Both queries bind ${companyId}::uuid via Prisma tagged template (ADR-0009).
    const [orderRows, adRows] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; revenue: number }[]>`
        SELECT
          TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
          COALESCE(SUM(oli.total_price), 0)::int AS revenue
        FROM orders o
        JOIN order_line_items oli ON oli.order_id = o.id
        WHERE o.company_id = ${companyId}::uuid
          AND o.ordered_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      // SUM(ad_spend) per business_date (KST date) from
      // `channel_listing_daily_snapshots` over the same window the order
      // revenue query uses.
      this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>(Prisma.sql`
        SELECT
          TO_CHAR(business_date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(ad_spend), 0)::int AS ad_cost
        FROM channel_listing_daily_snapshots
        WHERE company_id = ${companyId}::uuid
          AND business_date >= ${since}::date
        GROUP BY 1
        ORDER BY 1
      `),
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
      companyId,
      range,
      days,
      rowCount: result.length,
      avgProfitRate,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }
}

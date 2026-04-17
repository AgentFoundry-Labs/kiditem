import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardTrendItem } from '@kiditem/shared';

@Injectable()
export class DashboardTrendService {
  private readonly logger = new Logger(DashboardTrendService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTrend(range: string): Promise<DashboardTrendItem[]> {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // 월별 평균 이익률 계산 (ProfitLoss 기준)
    const plAgg = await this.prisma.profitLoss.aggregate({
      _sum: { revenue: true, netProfit: true },
    });
    const avgProfitRate =
      (plAgg._sum.revenue ?? 0) > 0
        ? (plAgg._sum.netProfit ?? 0) / (plAgg._sum.revenue ?? 1)
        : 0;

    const [orderRows, adRows] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; revenue: number }[]>`
        SELECT
          TO_CHAR(ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
          COALESCE(SUM(total_price), 0)::int AS revenue
        FROM orders
        WHERE ordered_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
        SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(spend), 0)::int AS ad_cost
        FROM ads
        WHERE date >= ${since}::date
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const adMap = new Map(adRows.map((r) => [r.date, Number(r.ad_cost)]));

    return orderRows.map((r) => {
      const revenue = Number(r.revenue);
      const profit = Math.round(revenue * avgProfitRate);
      return {
        date: r.date,
        revenue,
        profit,
        adCost: adMap.get(r.date) ?? 0,
      } satisfies DashboardTrendItem;
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  DashboardTrendRepositoryPort,
  TrendRevenueRow,
  TrendAdCostRow,
} from '../../../application/port/out/repository/dashboard-trend.repository.port';

/**
 * Trend-side raw SQL for the dashboard read model.
 *
 * Owns the per-day revenue and per-day ad spend windows that hydrate the
 * `/api/dashboard/trend` series. Both reads bind the tenant predicate via
 * Prisma tagged-template; `business_date` is KST-anchored to align the
 * order-date and ad-snapshot grouping.
 */
@Injectable()
export class DashboardTrendRepositoryAdapter
  implements DashboardTrendRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async fetchTrendRevenueRows(
    organizationId: string,
    since: Date,
  ): Promise<TrendRevenueRow[]> {
    return this.prisma.$queryRaw<TrendRevenueRow[]>`
      SELECT
        TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
        COALESCE(SUM(oli.total_price), 0)::int AS revenue
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      WHERE o.organization_id = ${organizationId}::uuid
        AND o.ordered_at >= ${since}
      GROUP BY 1
      ORDER BY 1
    `;
  }

  async fetchTrendAdCostRows(
    organizationId: string,
    since: Date,
  ): Promise<TrendAdCostRow[]> {
    return this.prisma.$queryRaw<TrendAdCostRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(business_date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(ad_spend), 0)::int AS ad_cost
      FROM channel_listing_daily_snapshots
      WHERE organization_id = ${organizationId}::uuid
        AND business_date >= ${since}::date
      GROUP BY 1
      ORDER BY 1
    `);
  }
}

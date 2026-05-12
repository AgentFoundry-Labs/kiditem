import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  DashboardAdRepositoryPort,
  DailyAdCostRow,
} from '../../../application/port/out/dashboard-ad.repository.port';

/**
 * Ad-side raw SQL for the dashboard read model.
 *
 * Owns the 30-day daily ad cost window query against
 * `channel_listing_daily_snapshots`, KST-anchored on `business_date`.
 * `organizationId` is bound via Prisma.sql tagged-template (ADR-0018).
 */
@Injectable()
export class DashboardAdRepositoryAdapter implements DashboardAdRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async fetchDailyAdCost(
    organizationId: string,
    fromBusinessDate: Date,
  ): Promise<DailyAdCostRow[]> {
    return this.prisma.$queryRaw<DailyAdCostRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(business_date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(ad_spend), 0)::int AS ad_cost
      FROM channel_listing_daily_snapshots
      WHERE organization_id = ${organizationId}::uuid
        AND business_date >= ${fromBusinessDate}::date
      GROUP BY 1
      ORDER BY 1
    `);
  }
}

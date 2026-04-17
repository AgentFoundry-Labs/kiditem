import type { PrismaService } from '../../prisma/prisma.service';

export interface RangeAdMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

/**
 * Period ad aggregation (ads table raw query).
 * Extracted from dashboard.service.ts (aggregateAdForRange).
 */
export async function aggregateAdForRange(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<RangeAdMetrics> {
  const agg = await prisma.$queryRaw<
    { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }[]
  >`
    SELECT
      COALESCE(SUM(spend), 0)::int AS spend,
      COALESCE(SUM(impressions), 0)::int AS impressions,
      COALESCE(SUM(clicks), 0)::int AS clicks,
      COALESCE(SUM(conversions), 0)::int AS conversions,
      COALESCE(SUM(revenue), 0)::int AS revenue
    FROM ads
    WHERE date >= ${from}::date AND date < ${to}::date
  `;
  return agg[0] ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
}

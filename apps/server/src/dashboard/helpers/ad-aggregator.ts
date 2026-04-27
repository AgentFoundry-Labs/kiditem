import type { PrismaService } from '../../prisma/prisma.service';

export interface RangeAdMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

/**
 * Period ad aggregation — sums additive ad metrics from
 * `ChannelListingDailySnapshot` over the requested half-open `[from, to)`
 * window scoped to a company.
 *
 * Daily facts are the single source-of-truth for listing/day ad metrics;
 * period views derive via SUM. Caller-side ROAS/CTR/CVR must use the shared
 * `ratio-recompute` helper — provider ratios are not stored on additive
 * columns.
 *
 * Multi-tenant: every read is scoped by `companyId`.
 */
export async function aggregateAdForRange(
  prisma: PrismaService,
  companyId: string,
  from: Date,
  to: Date,
): Promise<RangeAdMetrics> {
  const agg = await prisma.channelListingDailySnapshot.aggregate({
    where: {
      companyId,
      businessDate: { gte: from, lt: to },
    },
    _sum: {
      adSpend: true,
      adRevenue: true,
      adImpressions: true,
      adClicks: true,
      adConversions: true,
    },
  });
  return {
    spend: agg._sum.adSpend ?? 0,
    revenue: agg._sum.adRevenue ?? 0,
    impressions: agg._sum.adImpressions ?? 0,
    clicks: agg._sum.adClicks ?? 0,
    conversions: agg._sum.adConversions ?? 0,
  } satisfies RangeAdMetrics;
}

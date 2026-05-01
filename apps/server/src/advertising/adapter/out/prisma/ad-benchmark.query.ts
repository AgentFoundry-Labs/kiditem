import type { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import type { AdMetricSums } from '../../../domain/ad-metrics';

export type BenchmarkPerListingRow = {
  listingId: string;
  sums: AdMetricSums;
};

export type BenchmarkAggregates = {
  totals: AdMetricSums;
  perListing: BenchmarkPerListingRow[];
};

/**
 * Benchmark aggregation source: `ChannelListingDailySnapshot` over the last
 * 30 inclusive KST businessDates. Returns both the organization-wide totals and
 * per-listing sums. Caller maps each into `AdMetrics` via
 * `domain/ad-metrics.ts::buildAdMetrics` (ratios recompute from sums).
 */
export async function findBenchmarkAggregates(
  prisma: PrismaService,
  organizationId: string,
): Promise<BenchmarkAggregates> {
  const thirtyDaysAgo = kstInclusiveDaysStart(30);
  const [totals, perListing] = await Promise.all([
    prisma.channelListingDailySnapshot.aggregate({
      where: { organizationId, businessDate: { gte: thirtyDaysAgo } },
      _sum: {
        adSpend: true,
        adImpressions: true,
        adClicks: true,
        adConversions: true,
        adRevenue: true,
      },
    }),
    prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      where: { organizationId, businessDate: { gte: thirtyDaysAgo } },
      _sum: {
        adSpend: true,
        adImpressions: true,
        adClicks: true,
        adConversions: true,
        adRevenue: true,
      },
    }),
  ]);

  return {
    totals: {
      spend: totals._sum.adSpend ?? 0,
      impressions: totals._sum.adImpressions ?? 0,
      clicks: totals._sum.adClicks ?? 0,
      conversions: totals._sum.adConversions ?? 0,
      revenue: totals._sum.adRevenue ?? 0,
    },
    perListing: perListing.flatMap((row) => {
      if (!row.listingId) return [];
      return [
        {
          listingId: row.listingId,
          sums: {
            spend: row._sum.adSpend ?? 0,
            impressions: row._sum.adImpressions ?? 0,
            clicks: row._sum.adClicks ?? 0,
            conversions: row._sum.adConversions ?? 0,
            revenue: row._sum.adRevenue ?? 0,
          },
        },
      ];
    }),
  };
}

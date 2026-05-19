// 30-day organization-wide ad benchmark read. Source:
// `ChannelListingDailySnapshot` over the inclusive 30-day KST window.
// Returns additive sums; ratios recompute in `domain/ad-metrics`.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import type {
  AdBenchmarkRepositoryPort,
  BenchmarkAggregates,
} from '../../../application/port/out/repository/ad-benchmark.repository.port';

@Injectable()
export class AdBenchmarkRepositoryAdapter
  implements AdBenchmarkRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findBenchmarkAggregates(
    organizationId: string,
  ): Promise<BenchmarkAggregates> {
    const thirtyDaysAgo = kstInclusiveDaysStart(30);
    const [totals, perListing] = await Promise.all([
      this.prisma.channelListingDailySnapshot.aggregate({
        where: { organizationId, businessDate: { gte: thirtyDaysAgo } },
        _sum: {
          adSpend: true,
          adImpressions: true,
          adClicks: true,
          adConversions: true,
          adRevenue: true,
        },
      }),
      this.prisma.channelListingDailySnapshot.groupBy({
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
}

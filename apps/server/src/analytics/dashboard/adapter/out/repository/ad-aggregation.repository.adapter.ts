// Period ad aggregation — sums additive ad metrics from
// `ChannelListingDailySnapshot` over the requested half-open `[from, to)`
// window scoped to an organization. Daily facts are the single
// source-of-truth for listing/day ad metrics; period views derive via SUM
// and ratios recompute via shared helpers.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  AdAggregationRepositoryPort,
  RangeAdMetrics,
} from '../../../application/port/out/ad-aggregation.repository.port';

@Injectable()
export class AdAggregationRepositoryAdapter
  implements AdAggregationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async aggregateForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RangeAdMetrics> {
    const agg = await this.prisma.channelListingDailySnapshot.aggregate({
      where: {
        organizationId,
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
}

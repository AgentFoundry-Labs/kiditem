// 30-day organization-wide ad benchmark read. Source: the listing-day ad
// ledger through its one reader (`common/ad-window-facts`), over the inclusive
// 30-day KST window. Returns additive sums; ratios recompute in
// `domain/ad-metrics`.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import {
  readAdWindowFacts,
  readListingAdWindowFacts,
} from '../../../../common/ad-window-facts';
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
    const from = kstInclusiveDaysStart(30);
    const [window, perListing] = await Promise.all([
      readAdWindowFacts(this.prisma, { organizationId, from }),
      readListingAdWindowFacts(this.prisma, { organizationId, from }),
    ]);

    const totals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    for (const day of window.days) {
      totals.spend += day.spend;
      totals.impressions += day.impressions;
      totals.clicks += day.clicks;
      totals.conversions += day.conversions;
      totals.revenue += day.revenue;
    }

    return {
      totals,
      perListing: perListing.map((row) => ({
        listingId: row.listingId,
        sums: {
          spend: row.spend,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: row.conversions,
          revenue: row.revenue,
        },
      })),
    };
  }
}

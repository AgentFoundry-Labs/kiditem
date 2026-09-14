// 30-day organization-wide ad benchmark read. Source: the listing-day ad
// ledger through its one reader (`advertising/read/ad-target-facts`), over the inclusive
// 30-day KST window. Returns additive sums; ratios recompute in
// `domain/ad-metrics`.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import {
  readAdWindowFacts,
  readListingAdWindowFacts,
} from '../../../read/ad-target-facts';
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
    const [window, perListing] = await this.prisma.$transaction(
      async (tx) => {
        const window = await readAdWindowFacts(tx, { organizationId, from });
        const perListing = await readListingAdWindowFacts(tx, { organizationId, from });
        return [window, perListing] as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

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

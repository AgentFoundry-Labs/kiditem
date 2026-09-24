import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
// 30-day organization-wide ad benchmark read. Source: the listing-day ad
// ledger through its one reader (`advertising/read/ad-target-facts`), over the inclusive
// 30-day KST window. Returns additive sums; ratios recompute in
// `domain/ad-metrics`.

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import {
  readAdWindowFacts,
  readListingAdWindowFacts,
} from '../persistence/read/ad-target-facts';
import type {
  AdBenchmarkRepositoryPort,
  BenchmarkAggregates,
} from '../../../application/port/out/repository/ad-benchmark.repository.port';

@Injectable()
export class AdBenchmarkRepositoryAdapter
  implements AdBenchmarkRepositoryPort
{
  constructor(private readonly prisma: PrismaService,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort) {}

  async findBenchmarkAggregates(
    organizationId: string,
  ): Promise<BenchmarkAggregates> {
    const from = kstInclusiveDaysStart(30);
    const [window, perListing] = await this.prisma.$transaction(
      async (tx) => {
        const window = await readAdWindowFacts(tx, { organizationId, from }, this.channelAccounts);
        const perListing = await readListingAdWindowFacts(tx, { organizationId, from }, this.channelAccounts);
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

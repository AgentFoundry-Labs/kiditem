// 30-day organization-wide ad benchmark read over the ad report ledger
// (KID-372), through the owner's ledger read adapter, over the inclusive
// 30-day KST window. Returns additive performance sums (delivered spend,
// orders as conversions); ratios recompute in `domain/ad-metrics`.

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { businessDateKey, kstInclusiveDaysStart } from '../../../../common/kst';
import { activeAdAccountIds, AD_SWEEP_CHANNEL } from '../../../domain/ad-sweep-coverage';
import { adConversions, performanceAdSpend } from '../../../domain/ad-spend-rule';
import {
  AD_LEDGER_READ_REPOSITORY_PORT,
  type AdLedgerReadRepositoryPort,
} from '../../../application/port/out/repository/ad-ledger-read.repository.port';
import type {
  AdBenchmarkRepositoryPort,
  BenchmarkAggregates,
} from '../../../application/port/out/repository/ad-benchmark.repository.port';

@Injectable()
export class AdBenchmarkRepositoryAdapter implements AdBenchmarkRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(AD_LEDGER_READ_REPOSITORY_PORT) private readonly ledger: AdLedgerReadRepositoryPort,
  ) {}

  async findBenchmarkAggregates(organizationId: string): Promise<BenchmarkAggregates> {
    const from = businessDateKey(kstInclusiveDaysStart(30));
    const [window, perListing] = await this.prisma.$transaction(
      async (client) => {
        const tx = ownerTransaction(client);
        const identities = await this.channelAccounts.readProviderIdentities(tx, { organizationId, channel: AD_SWEEP_CHANNEL });
        const scope = { organizationId, activeAccountIds: activeAdAccountIds(identities), from };
        return [
          await this.ledger.readAdWindowFacts(tx, scope),
          await this.ledger.readListingAdWindowFacts(tx, scope),
        ] as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const totals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
    for (const day of window.days) {
      totals.spend += performanceAdSpend(day.spend);
      totals.impressions += day.impressions;
      totals.clicks += day.clicks;
      totals.conversions += adConversions(day);
      totals.revenue += day.revenue;
    }

    return {
      totals,
      perListing: perListing.map((row) => ({
        listingId: row.listingId,
        sums: {
          spend: performanceAdSpend(row.spend),
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: adConversions(row),
          revenue: row.revenue,
        },
      })),
    };
  }
}

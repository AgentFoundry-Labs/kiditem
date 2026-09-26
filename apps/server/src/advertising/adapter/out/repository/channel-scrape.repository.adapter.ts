import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
// Advertising-side status read for the extension-status endpoint, anchored on
// the newest succeeded Wing itemwinner operation (KID-362).

import { Inject, Injectable } from '@nestjs/common';
import { WING_ITEMWINNER_KIND, WingItemwinnerResultSchema } from '@kiditem/shared/advertising-operations';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  OPERATION_PORT,
  type OperationPort,
} from '../../../../common/operation/application/port/in/operation.port';
import type {
  ChannelScrapeRepositoryPort,
  ExtensionStatusSnapshot,
} from '../../../application/port/out/repository/channel-scrape.repository.port';

/** 상태 카드가 보여 온 이름(옛 확장 `itemwinnerKpis`의 칸 이름). */
const KPI_LABELS = {
  winners: '아이템위너 상품',
  suppressed: '노출제한 상품',
  losers: '아이템위너 아닌 상품',
} as const;

@Injectable()
export class ChannelScrapeRepositoryAdapter
  implements ChannelScrapeRepositoryPort
{
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
    @Inject(OPERATION_PORT) private readonly operations: OperationPort,
  ) {}

  async findExtensionStatusSnapshot(
    organizationId: string,
  ): Promise<ExtensionStatusSnapshot> {
    // The newest succeeded itemwinner operation is the publication. Its result
    // carries the listing observations it wrote, so a later same-day write to
    // the mutable daily table cannot change what this card shows, and a failed
    // or running operation never replaces it.
    const { operations } = await this.operations.list(organizationId, {
      kinds: [WING_ITEMWINNER_KIND],
      status: 'succeeded',
      limit: 1,
    });
    const latest = operations[0] ?? null;
    const parsed = latest ? WingItemwinnerResultSchema.safeParse(latest.result) : null;
    const published = parsed?.success ? parsed.data : null;
    const channelAccountId =
      published?.channelAccountId ??
      (await this.findActiveCoupangAccountId(organizationId));
    if (!channelAccountId) {
      return {
        listingCount: 0,
        latestPerListing: [],
        rawSnapshotCount: 0,
        latestRun: null,
        wingKpi: null,
      };
    }
    const listingCount = (
      await this.channelListings.readCatalogFacts(ownerTransaction(this.prisma), {
        organizationId,
        accountIds: [channelAccountId],
        activeOnly: true,
      })
    ).length;
    if (!latest || !published) {
      return { listingCount, latestPerListing: [], rawSnapshotCount: 0, latestRun: null, wingKpi: null };
    }
    return {
      listingCount,
      latestPerListing: published.listingObservations.map((observation) => ({
        isOfferWinner: observation.isOfferWinner,
        lastObservedAt: new Date(observation.lastObservedAt),
      })),
      // Rows Wing returned in that run: the raw evidence count.
      rawSnapshotCount: published.rowCount,
      latestRun: {
        finishedAt: latest.finishedAt ? new Date(latest.finishedAt) : null,
        startedAt: new Date(latest.startedAt),
        pageType: 'itemwinner',
      },
      wingKpi: {
        normalizedJson: {
          kpis: {
            [KPI_LABELS.winners]: published.kpis.winners,
            [KPI_LABELS.suppressed]: published.kpis.suppressed,
            [KPI_LABELS.losers]: published.kpis.losers,
          },
        },
        lastObservedAt: new Date(published.observedAt),
      },
    };
  }

  private async findActiveCoupangAccountId(
    organizationId: string,
  ): Promise<string | null> {
    const account = await this.channelAccounts.resolveActiveProvider(ownerTransaction(this.prisma), { organizationId, channel: 'coupang' });
    return account?.id ?? null;
  }
}

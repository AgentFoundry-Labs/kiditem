import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
// Advertising-side scrape-run status reads for the extension-status endpoint,
// anchored on the published Wing itemwinner owner.

import { Inject, Injectable } from '@nestjs/common';
import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  WING_ITEMWINNER_KPI_READ_PORT,
  type WingItemwinnerKpiReadPort,
} from '../../../application/port/in/wing-itemwinner-kpi-source.port';
import type {
  ChannelScrapeRepositoryPort,
  ExtensionStatusSnapshot,
} from '../../../application/port/out/repository/channel-scrape.repository.port';

@Injectable()
export class ChannelScrapeRepositoryAdapter
  implements ChannelScrapeRepositoryPort
{
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
    @Inject(WING_ITEMWINNER_KPI_READ_PORT)
    private readonly wingItemwinnerRead: WingItemwinnerKpiReadPort,
  ) {}

  async findExtensionStatusSnapshot(
    organizationId: string,
  ): Promise<ExtensionStatusSnapshot> {
    // The itemwinner owner is the authority for which COMPLETE generation is
    // published. Reuse that selection so this read cannot resurrect listing
    // rows from an older generation when the newest capture is confirmed
    // empty.
    const wingPublished = await this.wingItemwinnerRead.readPublished({
      organizationId,
    });
    const channelAccountId =
      wingPublished?.channelAccountId ??
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

    // Listing observations are captured in the selected COMPLETE owner's
    // immutable normalized snapshot. Do not remap them through the mutable
    // daily table: a later same-day publication can move that table's raw
    // pointer while this read is still using the earlier KPI publication.
    const latestPerListing =
      wingPublished?.listingObservations.map((observation) => ({
        isOfferWinner: observation.isOfferWinner,
        lastObservedAt: new Date(observation.lastObservedAt),
      })) ?? [];
    const rawSnapshotCountPromise = wingPublished
      ? this.prisma.channelScrapeSnapshot.count({
          where: {
            organizationId,
            sourceImportRunId: wingPublished.attemptId,
          },
        })
      : Promise.resolve(0);
    const latestRunPromise = wingPublished
      ? this.prisma.channelScrapeRun.findFirst({
          where: {
            organizationId,
            channelAccountId,
            sourceImportRunId: wingPublished.attemptId,
          },
          orderBy: [
            { finishedAt: 'desc' },
            { startedAt: 'desc' },
            { id: 'desc' },
          ],
          select: { finishedAt: true, startedAt: true, pageType: true },
        })
      : Promise.resolve(null);

    const [listingCount, rawSnapshotCount, latestRun] = await Promise.all([
      this.channelListings.readCatalogFacts(ownerTransaction(this.prisma), { organizationId, accountIds: [channelAccountId], activeOnly: true }).then(rows => rows.length),
      rawSnapshotCountPromise,
      latestRunPromise,
    ]);
    return {
      listingCount,
      latestPerListing,
      rawSnapshotCount,
      latestRun,
      wingKpi: wingPublished
        ? {
            normalizedJson: wingPublished.normalizedJson,
            lastObservedAt: new Date(wingPublished.observedAt),
          }
        : null,
    };
  }

  private async findActiveCoupangAccountId(
    organizationId: string,
  ): Promise<string | null> {
    const account = await this.channelAccounts.resolveActiveProvider(ownerTransaction(this.prisma), { organizationId, channel: 'coupang' });
    return account?.id ?? null;
  }
}

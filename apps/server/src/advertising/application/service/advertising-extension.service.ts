// Application service for the retained extension status read. Source
// collection writes belong to the named source owner ports; this service
// deliberately has no generic extension dispatcher.

import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from '../port/out/repository/channel-scrape.repository.port';
import type { AdExtensionStatus } from '@kiditem/shared/advertising';

@Injectable()
export class AdvertisingExtensionService {
  constructor(
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
  ) {}

  /**
   * Read only published source-owner evidence for the extension status card.
   * The repository excludes staged and legacy rows before this response is
   * assembled.
   */
  async getExtensionStatus(organizationId: string): Promise<AdExtensionStatus> {
    const {
      listingCount,
      latestPerListing,
      rawSnapshotCount,
      latestRun,
      wingKpi: wingKpiRow,
    } = await this.scrapeRepo.findExtensionStatusSnapshot(organizationId);

    let currentWinnerCount = 0;
    let currentNonWinnerCount = 0;
    let currentUnknownWinnerCount = 0;
    let latestChannelStateAt: Date | null = null;
    for (const row of latestPerListing) {
      if (row.isOfferWinner === true) currentWinnerCount += 1;
      else if (row.isOfferWinner === false) currentNonWinnerCount += 1;
      else currentUnknownWinnerCount += 1;
      if (
        latestChannelStateAt === null ||
        row.lastObservedAt > latestChannelStateAt
      ) {
        latestChannelStateAt = row.lastObservedAt;
      }
    }

    let wingKpis: Record<string, string> = {};
    if (wingKpiRow?.normalizedJson) {
      const normalized = wingKpiRow.normalizedJson as Record<string, unknown>;
      if (normalized.kpis && typeof normalized.kpis === 'object') {
        const raw = normalized.kpis as Record<string, unknown>;
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(raw)) {
          if (typeof value === 'string') out[key] = value;
          else if (typeof value === 'number') out[key] = String(value);
          else if (
            value &&
            typeof value === 'object' &&
            'value' in (value as Record<string, unknown>) &&
            typeof (value as { value: unknown }).value === 'string'
          ) {
            out[key] = (value as { value: string }).value;
          }
        }
        wingKpis = out;
      }
    }

    const latestScrapeAt =
      latestRun?.finishedAt ?? latestRun?.startedAt ?? null;
    const latestScrapePageType = latestRun?.pageType ?? null;
    const currentWinnerObservedListings =
      currentWinnerCount + currentNonWinnerCount + currentUnknownWinnerCount;

    return {
      connected: true,
      listingCount,
      currentWinnerCount,
      currentNonWinnerCount,
      currentUnknownWinnerCount,
      currentWinnerObservedListings,
      latestChannelStateAt,
      rawSnapshotCount,
      latestScrapeAt,
      latestScrapePageType,
      wing: { kpis: wingKpis, lastSync: wingKpiRow?.lastObservedAt ?? null },
    } satisfies AdExtensionStatus;
  }
}

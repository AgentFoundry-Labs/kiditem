// Application service for `/api/ads/extension/sync` and related extension
// status/scrape-target endpoints.
//
// This service is intentionally thin: it dispatches to per-source ingest
// handlers (`ingestAdCampaign`, `ingestRawScrape`, `ingestTraffic`,
// `ingestCoupangAdsDaily`), exposes a current-state extension status read,
// and proxies tenant-scoped scrape-target CRUD to the persistence helper.
// Domain helpers (business-date, listing-match, scrape-row-normalizers),
// the listing ad metric accumulator, and channels-namespace persistence
// live in sibling modules so each concern can evolve independently.

import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtensionSyncDto } from '../dto';
import type { AdExtensionStatus } from '@kiditem/shared/advertising';
import {
  matchListingFromRow as matchListingFromRowFn,
  type ListingMap,
  type ListingMatch,
} from '../domain/listing-match';
import { buildAdSyncListingMap } from '../adapter/out/prisma/ad-sync-listing-map.query';
import { ingestAdCampaign } from '../application/service/ad-campaign-ingest.handler';
import { ingestRawScrape } from '../application/service/raw-scrape-ingest.handler';
import { ingestTraffic } from '../application/service/traffic-ingest.handler';
import { ingestCoupangAdsDaily } from '../application/service/coupang-ads-daily-ingest.handler';
import {
  createScrapeTarget,
  deleteScrapeTarget,
  listScrapeTargets,
  markScrapeTargetScraped,
} from '../adapter/out/prisma/scrape-target.persistence';

export type { ListingMap } from '../domain/listing-match';

@Injectable()
export class AdSyncService {
  private readonly logger = new Logger(AdSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async sync(payload: ExtensionSyncDto, companyId: string) {
    const map = await this.buildListingMap(companyId);

    switch (payload.type) {
      case 'ad_campaign':
        return ingestAdCampaign(payload, companyId, map, {
          prisma: this.prisma,
        });
      case 'raw_scrape':
        return ingestRawScrape(payload, companyId, map, {
          prisma: this.prisma,
        });
      case 'traffic':
        return ingestTraffic(payload, companyId, map, {
          prisma: this.prisma,
          eventEmitter: this.eventEmitter,
        });
      case 'coupang_ads_daily':
        return ingestCoupangAdsDaily(payload, companyId, {
          prisma: this.prisma,
        });
      default:
        throw new BadRequestException(
          `알 수 없는 type: ${(payload as { type?: string }).type ?? 'undefined'}`,
        );
    }
  }

  /**
   * Current-state extension status from daily-fact + scrape-run +
   * account KPI tables.
   *
   * Winner counts come from the latest `ChannelListingDailySnapshot` per
   * listing (deterministic ordering: businessDate desc, lastObservedAt desc,
   * updatedAt desc, id desc). `isOfferWinner=true` → winner;
   * `isOfferWinner=false` → non-winner; `null` → unknown (observed but
   * provider did not surface the winner flag).
   *
   * Wing KPI sidebar fields come from
   * `ChannelAccountDailyKpiSnapshot(source='wing', kpiType='wing_itemwinner_kpi')`.
   * Empty-state returns explicit zero/null.
   */
  async getExtensionStatus(companyId: string): Promise<AdExtensionStatus> {
    const [
      listingCount,
      latestPerListing,
      rawSnapshotCount,
      latestRun,
      wingKpiRow,
    ] = await Promise.all([
      this.prisma.channelListing.count({
        where: { companyId, isDeleted: false },
      }),
      // DISTINCT ON (listing_id) returns one row per listing — the latest
      // daily snapshot per the deterministic ordering above. Bound is N rows
      // for N listings regardless of history depth.
      this.prisma.$queryRaw<
        { isOfferWinner: boolean | null; lastObservedAt: Date }[]
      >(Prisma.sql`
        SELECT DISTINCT ON (listing_id)
          is_offer_winner   AS "isOfferWinner",
          last_observed_at  AS "lastObservedAt"
        FROM channel_listing_daily_snapshots
        WHERE company_id = ${companyId}::uuid
        ORDER BY
          listing_id,
          business_date DESC,
          last_observed_at DESC,
          updated_at DESC,
          id DESC
      `),
      this.prisma.channelScrapeSnapshot.count({ where: { companyId } }),
      this.prisma.channelScrapeRun.findFirst({
        where: { companyId },
        orderBy: [
          { finishedAt: 'desc' },
          { startedAt: 'desc' },
          { id: 'desc' },
        ],
        select: {
          finishedAt: true,
          startedAt: true,
          pageType: true,
        },
      }),
      this.prisma.channelAccountDailyKpiSnapshot.findFirst({
        where: {
          companyId,
          source: 'wing',
          kpiType: 'wing_itemwinner_kpi',
        },
        orderBy: [
          { businessDate: 'desc' },
          { lastObservedAt: 'desc' },
          { id: 'desc' },
        ],
        select: { normalizedJson: true, lastObservedAt: true },
      }),
    ]);

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
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === 'string') out[k] = v;
          else if (typeof v === 'number') out[k] = String(v);
          else if (
            v &&
            typeof v === 'object' &&
            'value' in (v as Record<string, unknown>) &&
            typeof (v as { value: unknown }).value === 'string'
          ) {
            out[k] = (v as { value: string }).value;
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

  async buildListingMap(companyId: string): Promise<ListingMap> {
    return buildAdSyncListingMap(this.prisma, companyId);
  }

  matchListingFromRow(
    row: Record<string, unknown>,
    map: ListingMap,
  ): ListingMatch {
    return matchListingFromRowFn(row, map);
  }

  async getScrapeTargets(companyId: string) {
    return listScrapeTargets(this.prisma, companyId);
  }

  async createScrapeTarget(
    url: string,
    label: string | undefined,
    category: string | undefined,
    companyId: string,
  ) {
    return createScrapeTarget(this.prisma, url, label, category, companyId);
  }

  async markScraped(id: string, companyId: string) {
    return markScrapeTargetScraped(this.prisma, id, companyId);
  }

  async deleteScrapeTarget(id: string, companyId: string) {
    return deleteScrapeTarget(this.prisma, id, companyId);
  }
}

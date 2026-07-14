// Application service for `/api/ads/extension/sync` and related extension
// status/scrape-target endpoints.
//
// This service is intentionally thin: it dispatches to per-source ingest
// handlers (`AdCampaignIngestHandler`, `RawScrapeIngestHandler`,
// `TrafficIngestHandler`, `CoupangAdsDailyIngestHandler`,
// `KeywordRankIngestHandler`), exposes a
// current-state extension status read, and proxies tenant-scoped
// scrape-target CRUD through the scrape-target repository port.
// Domain helpers (business-date, listing-match, scrape-row-normalizers),
// the listing ad metric accumulator, and channels-namespace persistence
// live in sibling modules so each concern can evolve independently.

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ExtensionSyncDto } from "../../adapter/in/http/dto";
import type { AdExtensionStatus } from "@kiditem/shared/advertising";
import {
  matchListingFromRow as matchListingFromRowFn,
  type ListingMap,
  type ListingMatch,
} from "../../domain/listing-match";
import {
  AD_LISTING_REPOSITORY_PORT,
  type AdListingRepositoryPort,
} from "../port/out/repository/ad-listing.repository.port";
import {
  SCRAPE_TARGET_REPOSITORY_PORT,
  type ScrapeTargetRepositoryPort,
} from "../port/out/repository/scrape-target.repository.port";
import {
  CHANNEL_SCRAPE_REPOSITORY_PORT,
  type ChannelScrapeRepositoryPort,
} from "../port/out/repository/channel-scrape.repository.port";
import { AdCampaignIngestHandler } from "./ad-campaign-ingest.handler";
import { CoupangAdsDailyIngestHandler } from "./coupang-ads-daily-ingest.handler";
import { KeywordRankIngestHandler } from "./keyword-rank-ingest.handler";
import { RawScrapeIngestHandler } from "./raw-scrape-ingest.handler";
import { TrafficIngestHandler } from "./traffic-ingest.handler";
import { WingSalesRankIngestHandler } from "./wing-sales-rank-ingest.handler";

export type { ListingMap } from "../../domain/listing-match";

@Injectable()
export class AdSyncService {
  private readonly logger = new Logger(AdSyncService.name);

  constructor(
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    @Inject(SCRAPE_TARGET_REPOSITORY_PORT)
    private readonly scrapeTargetRepo: ScrapeTargetRepositoryPort,
    @Inject(CHANNEL_SCRAPE_REPOSITORY_PORT)
    private readonly scrapeRepo: ChannelScrapeRepositoryPort,
    private readonly adCampaignHandler: AdCampaignIngestHandler,
    private readonly rawScrapeHandler: RawScrapeIngestHandler,
    private readonly trafficHandler: TrafficIngestHandler,
    private readonly coupangAdsDailyHandler: CoupangAdsDailyIngestHandler,
    private readonly keywordRankHandler: KeywordRankIngestHandler,
    private readonly wingSalesRankHandler: WingSalesRankIngestHandler,
  ) {}

  async sync(payload: ExtensionSyncDto, organizationId: string) {
    const map = await this.buildListingMap(organizationId);

    switch (payload.type) {
      case "ad_campaign":
        return this.adCampaignHandler.execute(payload, organizationId, map);
      case "raw_scrape":
        return this.rawScrapeHandler.execute(payload, organizationId, map);
      case "traffic":
        return this.trafficHandler.execute(payload, organizationId, map);
      case "coupang_ads_daily":
        return this.coupangAdsDailyHandler.execute(payload, organizationId);
      case "keyword_rank":
        return this.keywordRankHandler.execute(payload, organizationId);
      case "competitor_seller_catalog":
        return this.keywordRankHandler.executeSellerCatalogs(
          payload,
          organizationId,
        );
      case "competitor_seller_identity":
        return this.keywordRankHandler.executeSellerIdentities(
          payload,
          organizationId,
        );
      case "wing_sales_rank":
        return this.wingSalesRankHandler.execute(payload, organizationId);
      default:
        throw new BadRequestException(
          `알 수 없는 type: ${(payload as { type?: string }).type ?? "undefined"}`,
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
      if (normalized.kpis && typeof normalized.kpis === "object") {
        const raw = normalized.kpis as Record<string, unknown>;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === "string") out[k] = v;
          else if (typeof v === "number") out[k] = String(v);
          else if (
            v &&
            typeof v === "object" &&
            "value" in (v as Record<string, unknown>) &&
            typeof (v as { value: unknown }).value === "string"
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

  async buildListingMap(organizationId: string): Promise<ListingMap> {
    return this.listingRepo.buildAdSyncListingMap(organizationId);
  }

  matchListingFromRow(
    row: Record<string, unknown>,
    map: ListingMap,
  ): ListingMatch {
    return matchListingFromRowFn(row, map);
  }

  async getScrapeTargets(organizationId: string) {
    return this.scrapeTargetRepo.listActive(organizationId);
  }

  async createScrapeTarget(
    url: string,
    label: string | undefined,
    category: string | undefined,
    organizationId: string,
  ) {
    return this.scrapeTargetRepo.create(
      { url, label, category },
      organizationId,
    );
  }

  async markScraped(id: string, organizationId: string) {
    return this.scrapeTargetRepo.markScraped(id, organizationId);
  }

  async deleteScrapeTarget(id: string, organizationId: string) {
    return this.scrapeTargetRepo.softDelete(id, organizationId);
  }
}

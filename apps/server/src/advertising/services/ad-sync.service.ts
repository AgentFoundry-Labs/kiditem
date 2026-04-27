import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExtensionSyncDto } from '../dto';
import type { AdExtensionStatus } from '@kiditem/shared';
import {
  buildAdTargetKey,
  type AdTargetType,
} from '../util/ad-target-key';
import {
  ChannelScrapePersistenceService,
  type ListingDailyState,
  type ListingOptionDailyState,
  type ListingDailyAdMetrics,
  type ListingDailyTrafficMetrics,
  type AdTargetDailyMetrics,
  type ScrapeMatchStatus,
} from './channel-scrape-persistence.service';

export interface ListingMap {
  // Wave C2: option matches keep `listingOptionId` even when internal
  // `optionId` is null. C3 daily option-snapshot upsert needs the listing
  // option id to land facts before internal product matching is complete.
  // Wave C3: also carry the listing's `externalId` so daily-snapshot rows can
  // populate the denormalized `externalId` column without an extra DB lookup.
  externalOptionIdMap: Map<
    string,
    {
      listingId: string;
      listingOptionId: string;
      optionId: string | null;
      externalId: string;
    }
  >;
  externalIdMap: Map<string, { listingId: string }>;
}

export interface ListingMatch {
  listingId: string | null;
  listingOptionId: string | null;
  optionId: string | null;
  // Wave C3: canonical channel identifiers needed for daily-snapshot upsert.
  // `externalId` is the `ChannelListing.externalId` (e.g. Coupang sellerProductId).
  // `externalOptionId` is `ChannelListingOption.externalOptionId` (e.g. vendorItemId).
  externalId: string | null;
  externalOptionId: string | null;
}

type ScrapeRowPair = {
  rawRow: Record<string, any>;
  normalizedRow: Record<string, any>;
  hasNormalizedRow: boolean;
};

@Injectable()
export class AdSyncService {
  private readonly logger = new Logger(AdSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly scrapePersistence: ChannelScrapePersistenceService,
  ) {}

  async sync(payload: ExtensionSyncDto, companyId: string) {
    const map = await this.buildListingMap(companyId);

    switch (payload.type) {
      case 'ad_campaign':
        return this.handleAdCampaign(payload, companyId, map);
      case 'raw_scrape':
        return this.handleRawScrape(payload, companyId, map);
      case 'traffic':
        return this.handleTraffic(payload, companyId, map);
      case 'coupang_ads_daily':
        return this.handleCoupangAdsDaily(payload, companyId);
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
    const [options, listings] = await Promise.all([
      this.prisma.channelListingOption.findMany({
        where: {
          companyId,
          isActive: true,
          listing: { channel: 'coupang', isDeleted: false },
        },
        select: {
          id: true,
          externalOptionId: true,
          listingId: true,
          optionId: true,
          // Wave C3: pull listing's externalId so daily-option-snapshot upsert
          // can populate the denormalized column without extra round-trips.
          listing: { select: { externalId: true } },
        },
      }),
      this.prisma.channelListing.findMany({
        where: { companyId, isDeleted: false, channel: 'coupang' },
        select: { id: true, externalId: true },
      }),
    ]);

    const externalOptionIdMap: ListingMap['externalOptionIdMap'] = new Map();
    for (const opt of options) {
      if (!opt.externalOptionId) continue;
      // Wave C2: 내부 ProductOption 매칭이 아직 안 된 row 도 listingOption 자체는
      // 보존한다. C3 가 option daily snapshot 을 land 하려면 listingOptionId 가
      // 필요하기 때문 (internal optionId 가 null 이어도).
      externalOptionIdMap.set(opt.externalOptionId, {
        listingId: opt.listingId,
        listingOptionId: opt.id,
        optionId: opt.optionId ?? null,
        externalId: opt.listing.externalId,
      });
    }

    const externalIdMap = new Map<string, { listingId: string }>();
    for (const l of listings) {
      externalIdMap.set(l.externalId, { listingId: l.id });
    }

    return { externalOptionIdMap, externalIdMap };
  }

  matchListingFromRow(
    row: Record<string, unknown>,
    map: ListingMap,
  ): ListingMatch {
    const providerOptionId = this.pickStringField(row, [
      'vendorItemId',
      'vendor_item_id',
      'itemId',
    ]);
    if (providerOptionId) {
      const hit = map.externalOptionIdMap.get(providerOptionId);
      if (hit) {
        return {
          listingId: hit.listingId,
          listingOptionId: hit.listingOptionId,
          optionId: hit.optionId,
          externalId: hit.externalId,
          externalOptionId: providerOptionId,
        };
      }
    }

    const externalId = this.pickStringField(row, [
      'externalId',
      'external_id',
      'productId',
      'coupangProductId',
    ]);
    if (externalId) {
      const hit = map.externalIdMap.get(externalId);
      if (hit) {
        return {
          listingId: hit.listingId,
          listingOptionId: null,
          optionId: null,
          externalId,
          externalOptionId: null,
        };
      }
    }

    return {
      listingId: null,
      listingOptionId: null,
      optionId: null,
      externalId: null,
      externalOptionId: null,
    };
  }

  /** Wave C2: snapshot match status derivation. */
  private matchStatusOf(match: ListingMatch): ScrapeMatchStatus {
    if (match.listingOptionId) return 'matched';
    if (match.listingId) return 'matched_listing_only';
    return 'unmatched';
  }

  private asScrapeRow(row: unknown): Record<string, any> {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return row as Record<string, any>;
    }
    return { value: row };
  }

  /**
   * Pair raw extension rows with normalized parser rows. Matching/legacy writes
   * use the normalized row, while `ChannelScrapeSnapshot.rawJson` keeps the
   * original source row for replay/debuggability.
   */
  private pairScrapeRows(
    rawRowsInput: unknown[] | undefined,
    normalizedRowsInput: unknown[] | undefined,
  ): ScrapeRowPair[] {
    const rawRows = (rawRowsInput ?? []).map((row) => this.asScrapeRow(row));
    const normalizedRows = (normalizedRowsInput ?? []).map((row) =>
      this.asScrapeRow(row),
    );
    const rowCount = Math.max(rawRows.length, normalizedRows.length);

    return Array.from({ length: rowCount }, (_, index) => {
      const normalizedRow = normalizedRows[index] ?? rawRows[index] ?? {};
      return {
        rawRow: rawRows[index] ?? normalizedRow,
        normalizedRow,
        hasNormalizedRow: normalizedRows[index] !== undefined,
      };
    });
  }

  /**
   * Convert any payload date string to a KST `@db.Date` Date (UTC midnight of
   * the KST day). Pre-MEDIUM-1 fix: naive `slice(0,10)` of a UTC ISO string
   * dropped the day for KST early-morning timestamps (e.g.,
   * `2026-04-13T15:30:00Z` is 2026-04-14 00:30 KST but used to land as
   * 2026-04-13). Plan §10 risk explicitly calls this out.
   *
   * Accepts:
   * - `YYYY-MM-DD` / `YYYY-M-D` (treated as already a KST business date)
   * - any longer ISO/parseable string (parsed → shifted to KST → date slice)
   */
  private toBusinessDate(raw: string | undefined | null): Date | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
      const [, year, monthRaw, dayRaw] = ymd;
      const month = Number(monthRaw);
      const day = Number(dayRaw);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const parsed = new Date(`${normalized}T00:00:00Z`);
      if (
        parsed.getUTCFullYear() !== Number(year) ||
        parsed.getUTCMonth() + 1 !== month ||
        parsed.getUTCDate() !== day
      ) {
        return null;
      }
      return parsed;
    }
    if (trimmed.includes('T')) {
      const parsed = new Date(trimmed);
      if (!Number.isFinite(parsed.getTime())) return null;
      const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
      const kstDate = new Date(parsed.getTime() + KST_OFFSET_MS);
      const y = kstDate.getUTCFullYear();
      const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(kstDate.getUTCDate()).padStart(2, '0');
      return new Date(`${y}-${m}-${d}T00:00:00Z`);
    }
    return null;
  }

  private currentBusinessDate(): Date {
    return (
      this.toBusinessDate(new Date().toISOString()) ??
      new Date(new Date().toISOString().slice(0, 10))
    );
  }

  private resolveBusinessDate(
    ...candidates: Array<string | undefined | null>
  ): Date {
    for (const candidate of candidates) {
      const parsed = this.toBusinessDate(candidate);
      if (parsed) return parsed;
    }
    return this.currentBusinessDate();
  }

  /**
   * Wave C2 — finalize a scrape run with `status='error'` after a thrown
   * exception. Keeps the run row from being stuck on `status='running'`
   * forever (HIGH-1 in code review). Counts at the time of failure are
   * recorded so observability can see partial progress.
   */
  private async finalizeScrapeRunOnError(
    scrapeRunId: string,
    companyId: string,
    counts: { rowCount: number; matchedCount: number; unmatchedCount: number },
    err: unknown,
  ): Promise<void> {
    try {
      await this.scrapePersistence.finalizeRun({
        scrapeRunId,
        companyId,
        status: 'error',
        rowCount: counts.rowCount,
        matchedCount: counts.matchedCount,
        unmatchedCount: counts.unmatchedCount,
        errorCount: 1,
        errorJson: this.serializeError(err),
      });
    } catch (finalizeError) {
      // 운영 모니터링은 최종적으로 channel_scrape_runs 의 stuck 'running' row
      // 로 잡힘. finalize 자체가 실패하는 상황은 PG 연결 자체가 죽은 케이스라
      // 이 시점에 다시 throw 해봐야 원본 에러를 가린다.
      this.logger.error(
        `Failed to record error status on scrape run ${scrapeRunId}: ${
          finalizeError instanceof Error ? finalizeError.message : String(finalizeError)
        }`,
      );
    }
  }

  private serializeError(err: unknown): Prisma.InputJsonValue {
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: err.stack ?? null,
      } as unknown as Prisma.InputJsonValue;
    }
    return { message: String(err) } as unknown as Prisma.InputJsonValue;
  }

  /**
   * H2 — `ad_campaign` payloads land in three places:
   *   1. `ChannelScrapeRun` + `ChannelScrapeSnapshot` per row (raw audit/replay)
   *   2. `ChannelListingDailySnapshot` listing-day metrics + state when the
   *      row has listing identity (matched or matched_listing_only)
   *   3. `ChannelAdTargetDailySnapshot` per row at the appropriate
   *      campaign/keyword/product grain
   *
   * Account-level KPI rows (the `_kpiOnly` summary row + any payload-level
   * `kpis` map for the campaign as a whole) land in
   * `ChannelAccountDailyKpiSnapshot` with `kpiType='advertising_campaign_kpis'`.
   *
   * Provider ratios (ROAS/CTR/CVR) are NOT trusted: only the additive
   * numerator/denominator columns are stored; provider ratios survive in
   * `metaJson` for audit. Reads recompute ratios in H3.
   */
  private async handleAdCampaign(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const campaignName = payload.campaignName || '_전체';
    const period = String(payload.period || '7d');
    const today = this.resolveBusinessDate(
      payload.timestamp,
      payload.dateFrom,
      payload.dateTo,
    );
    const kpis = payload.kpis || {};
    const normalizedRows = payload.normalizedRows ?? [];
    const scrapeRows = this.pairScrapeRows(payload.data, normalizedRows);

    const scrapeRun = await this.scrapePersistence.createRun({
      companyId,
      channel: 'coupang',
      source: 'advertising',
      pageType: 'campaign',
      businessDate: today,
      periodStart: this.toBusinessDate(payload.dateFrom),
      periodEnd: this.toBusinessDate(payload.dateTo),
      targetUrl: payload.url ?? null,
      period,
      metaJson: {
        campaignName,
        kpis,
        rowCount: scrapeRows.length,
        normalizedRowCount: normalizedRows.length,
      } as unknown as Prisma.InputJsonValue,
    });
    let scrapeSnapshotCount = 0;
    let scrapeMatched = 0;
    let scrapeUnmatched = 0;

    try {
      let listingDailyCount = 0;
      let targetDailyCount = 0;
      let accountKpiCount = 0;

      for (const pair of scrapeRows) {
        const row = pair.normalizedRow;
        const match = this.matchListingFromRow(row, map);
        const matchStatus = this.matchStatusOf(match);
        const externalIdRaw = this.pickStringField(row, [
          'externalId',
          'external_id',
          'productId',
          'coupangProductId',
        ]);
        const externalOptionIdRaw = this.pickStringField(row, [
          'vendorItemId',
          'vendor_item_id',
          'itemId',
        ]);
        const snapshot = await this.scrapePersistence.appendSnapshot({
          scrapeRunId: scrapeRun.id,
          companyId,
          channel: 'coupang',
          source: 'advertising',
          pageType: this.cleanString(row.pageType) || 'campaign',
          businessDate: today,
          externalId: externalIdRaw,
          externalOptionId: externalOptionIdRaw,
          listingId: match.listingId,
          listingOptionId: match.listingOptionId,
          optionId: match.optionId,
          matchStatus,
          matchReason: !pair.hasNormalizedRow
            ? 'missing normalized row (snapshot only)'
            : row._kpiOnly
              ? 'kpi-only row (snapshot only)'
              : !row.campaignName && !row.productName && !row.keyword
                ? 'missing campaign/product/keyword identity (snapshot only)'
                : null,
          rawJson: pair.rawRow as unknown as Prisma.InputJsonValue,
          normalizedJson: pair.hasNormalizedRow
            ? (row as unknown as Prisma.InputJsonValue)
            : null,
        });
        scrapeSnapshotCount += 1;
        if (matchStatus === 'unmatched') scrapeUnmatched += 1;
        else scrapeMatched += 1;

        if (!pair.hasNormalizedRow) continue;
        if (row._kpiOnly) continue;
        if (!row.campaignName && !row.productName && !row.keyword) continue;

        const rowCampaignName =
          this.cleanString(row.campaignName) || campaignName;
        const rowCampaignId = this.cleanString(row.campaignId);
        const rowAdGroup = this.cleanString(row.adGroup);
        const rowKeyword = this.cleanString(row.keyword);
        const rowStatus = this.cleanString(row.status);
        const rowOnOff = this.cleanString(row.onOff);
        const rowPageType = this.cleanString(row.pageType) || 'campaign';
        const rowSpend = Math.round(
          this.toNumber(row.runningAdSpend ?? row.spend),
        );
        const rowRevenue = Math.round(this.toNumber(row.revenue));
        const rowImpressions = Math.round(this.toNumber(row.impressions));
        const rowClicks = Math.round(this.toNumber(row.clicks));
        const rowConversions = Math.round(this.toNumber(row.conversions));
        const rowOrders = Math.round(this.toNumber(row.orders));
        const rowDailyBudget = this.toNumberOrNull(row.dailyBudget);
        const rowCurrentBid = this.toNumberOrNull(row.currentBid);
        const providerRoas = this.toNumber(row.roas || row.adEfficiencyTarget);
        const providerCtr = this.toNumber(row.ctr);
        const providerConversionRate = this.toNumber(row.conversionRate);

        // Listing-day metric upsert when listing identity is known.
        if (match.listingId && match.externalId) {
          const adMetrics: ListingDailyAdMetrics = {
            adSpend: rowSpend,
            adRevenue: rowRevenue,
            adImpressions: rowImpressions,
            adClicks: rowClicks,
            adConversions: rowConversions,
            adOrders: rowOrders,
          };
          await this.scrapePersistence.upsertListingDaily({
            companyId,
            listingId: match.listingId,
            channel: 'coupang',
            externalId: match.externalId,
            businessDate: today,
            rawSnapshotId: snapshot.id,
            productName: this.cleanString(row.productName),
            metaJson: {
              source: 'advertising.campaign',
              data: {
                campaignName: rowCampaignName,
                providerRoas,
                providerCtr,
                providerConversionRate,
              },
            },
            metrics: { ad: adMetrics },
          });
          listingDailyCount += 1;
        }

        // Target-day fact: prefer the most specific grain available on the row.
        const targetType = this.deriveTargetType(rowPageType, rowKeyword);
        try {
          const targetKey = buildAdTargetKey({
            targetType,
            campaignId: rowCampaignId,
            campaignName: rowCampaignName,
            adGroup: rowAdGroup,
            keyword: rowKeyword,
            externalId: externalIdRaw ?? match.externalId,
            listingId: match.listingId,
          });
          const targetMetrics: AdTargetDailyMetrics = {
            spend: rowSpend,
            revenue: rowRevenue,
            impressions: rowImpressions,
            clicks: rowClicks,
            conversions: rowConversions,
            orders: rowOrders,
            adSpend: rowSpend,
            adRevenue: rowRevenue,
          };
          await this.scrapePersistence.upsertAdTargetDaily({
            companyId,
            channel: 'coupang',
            businessDate: today,
            targetType,
            targetKey,
            listingId: match.listingId ?? null,
            listingOptionId: match.listingOptionId ?? null,
            optionId: match.optionId ?? null,
            externalId: externalIdRaw ?? match.externalId ?? null,
            externalOptionId:
              externalOptionIdRaw ?? match.externalOptionId ?? null,
            campaignId: rowCampaignId,
            campaignName: rowCampaignName,
            adGroup: rowAdGroup,
            keyword: rowKeyword,
            placement: this.cleanString(row.placement),
            status: rowStatus,
            onOff: rowOnOff,
            currentBid: rowCurrentBid,
            dailyBudget: rowDailyBudget,
            rawSnapshotId: snapshot.id,
            metaJson: {
              source: 'advertising.campaign.target',
              data: {
                providerRoas,
                providerCtr,
                providerConversionRate,
                pageType: rowPageType,
              },
            },
            ...targetMetrics,
          });
          targetDailyCount += 1;
        } catch (e) {
          // Non-buildable identity (e.g., neither campaignId nor campaignName
          // present) — raw snapshot is preserved above. Skip target daily so
          // we never land an `unknown:unknown` row.
          this.logger.debug(
            `handleAdCampaign skipped target daily upsert: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }

      // Account-level KPI fact for the campaign-as-a-whole. Provider ROAS /
      // CTR / CVR live inside `metaJson`/`normalizedJson` only — reads
      // recompute from additive numerators in H3.
      if (Object.keys(kpis).length > 0) {
        const kpiRecord: Record<string, unknown> = {
          kpis,
          campaignName,
          period,
          rowCount: scrapeRows.length,
        };
        await this.scrapePersistence.upsertAccountKpi({
          companyId,
          channel: 'coupang',
          source: 'advertising',
          kpiType: 'advertising_campaign_kpis',
          businessDate: today,
          periodStart: this.toBusinessDate(payload.dateFrom),
          periodEnd: this.toBusinessDate(payload.dateTo),
          normalizedJson: kpiRecord as unknown as Prisma.InputJsonValue,
          rawJson: kpiRecord as unknown as Prisma.InputJsonValue,
        });
        accountKpiCount += 1;
      }

      await this.scrapePersistence.finalizeRun({
        scrapeRunId: scrapeRun.id,
        companyId,
        status: 'complete',
        rowCount: scrapeSnapshotCount,
        matchedCount: scrapeMatched,
        unmatchedCount: scrapeUnmatched,
      });

      return {
        success: true,
        type: 'ad_campaign',
        campaignName,
        period,
        kpiCount: Object.keys(kpis).length,
        listingDailyCount,
        targetDailyCount,
        accountKpiCount,
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount,
        scrapeMatchedCount: scrapeMatched,
        scrapeUnmatchedCount: scrapeUnmatched,
      };
    } catch (err) {
      await this.finalizeScrapeRunOnError(
        scrapeRun.id,
        companyId,
        {
          rowCount: scrapeSnapshotCount,
          matchedCount: scrapeMatched,
          unmatchedCount: scrapeUnmatched,
        },
        err,
      );
      throw err;
    }
  }

  /**
   * H2 — derive the appropriate target grain for a campaign-page row.
   * `keyword` rows always fall to keyword grain; otherwise infer from
   * `pageType`. Ad-product rows are reserved for `coupang_ads_daily` since
   * that's where the provider distinguishes ad placement.
   */
  private deriveTargetType(
    pageType: string,
    keyword: string | null,
  ): AdTargetType {
    if (keyword) return 'keyword';
    if (pageType === 'product') return 'product';
    return 'campaign';
  }

  /**
   * H2 — `raw_scrape` covers both wing item-winner rows and advertising
   * dashboard rows. Each row creates a `ChannelScrapeSnapshot` first;
   * matched rows then upsert listing/option daily state (winner state)
   * for wing, and listing-day ad metrics + target-day fact for advertising.
   * Wing dashboard KPI cards land in `ChannelAccountDailyKpiSnapshot`.
   */
  private async handleRawScrape(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const source = payload.source || 'unknown';
    const rows = payload.data ?? [];
    const normalizedRowsAll = payload.normalizedRows ?? [];

    const businessDate = this.resolveBusinessDate(
      payload.timestamp,
      payload.startDate,
      payload.dateFrom,
      payload.dateTo,
    );
    const scrapeRun = await this.scrapePersistence.createRun({
      companyId,
      channel: 'coupang',
      source,
      pageType: source === 'wing' ? 'itemwinner' : 'advertising',
      businessDate,
      periodStart: this.toBusinessDate(payload.dateFrom),
      periodEnd: this.toBusinessDate(payload.dateTo),
      targetUrl: payload.url ?? null,
      metaJson: {
        kpis: payload.kpis ?? {},
        rowCount: rows.length,
        normalizedRowCount: normalizedRowsAll.length,
      } as unknown as Prisma.InputJsonValue,
    });
    let scrapeSnapshotCount = 0;
    let scrapeMatched = 0;
    let scrapeUnmatched = 0;

    try {
      let listingDailyCount = 0;
      let optionDailyCount = 0;
      let targetDailyCount = 0;
      let accountKpiCount = 0;

      if (source === 'wing') {
        for (const row of rows) {
          const productName = row.productName || '';
          const match = this.matchListingFromRow(row, map);
          const matchStatus = this.matchStatusOf(match);
          const externalIdRaw = this.pickStringField(row, [
            'externalId',
            'external_id',
            'productId',
            'coupangProductId',
          ]);
          const externalOptionIdRaw = this.pickStringField(row, [
            'vendorItemId',
            'vendor_item_id',
            'itemId',
          ]);
          const snapshot = await this.scrapePersistence.appendSnapshot({
            scrapeRunId: scrapeRun.id,
            companyId,
            channel: 'coupang',
            source: 'wing',
            pageType: 'itemwinner',
            businessDate,
            externalId: externalIdRaw,
            externalOptionId: externalOptionIdRaw,
            listingId: match.listingId,
            listingOptionId: match.listingOptionId,
            optionId: match.optionId,
            matchStatus,
            matchReason:
              !productName || productName.length < 3
                ? 'short-product-name (snapshot only)'
                : null,
            rawJson: row as unknown as Prisma.InputJsonValue,
          });
          scrapeSnapshotCount += 1;
          if (matchStatus === 'unmatched') scrapeUnmatched += 1;
          else scrapeMatched += 1;

          // Wave C3 — daily fact upsert for matched rows. Winner state is
          // valuable even when productName is short (no legacy filter applied).
          if (match.listingId && businessDate) {
            const listingState = this.normalizeWingListingState(row);
            if (listingState) {
              await this.scrapePersistence.upsertListingDaily({
                companyId,
                listingId: match.listingId,
                channel: 'coupang',
                externalId: match.externalId ?? externalIdRaw ?? '',
                businessDate,
                rawSnapshotId: snapshot.id,
                ...listingState,
              });
              listingDailyCount += 1;
            }
            if (match.listingOptionId) {
              const optionState = this.normalizeWingOptionState(row);
              if (optionState) {
                await this.scrapePersistence.upsertOptionDaily({
                  companyId,
                  listingId: match.listingId,
                  listingOptionId: match.listingOptionId,
                  optionId: match.optionId,
                  channel: 'coupang',
                  externalId: match.externalId ?? externalIdRaw ?? '',
                  externalOptionId:
                    match.externalOptionId ?? externalOptionIdRaw ?? '',
                  businessDate,
                  rawSnapshotId: snapshot.id,
                  ...optionState,
                });
                optionDailyCount += 1;
              }
            }
          }
        }

        const kpis = payload.kpis || {};
        if (Object.keys(kpis).length > 0 && businessDate) {
          await this.scrapePersistence.upsertAccountKpi({
            companyId,
            channel: 'coupang',
            source: 'wing',
            kpiType: 'wing_itemwinner_kpi',
            businessDate,
            normalizedJson: {
              kpis,
              rowCount: rows.length,
              timestamp: payload.timestamp,
            } as unknown as Prisma.InputJsonValue,
            rawJson: {
              kpis,
              rowCount: rows.length,
              timestamp: payload.timestamp,
            } as unknown as Prisma.InputJsonValue,
          });
          accountKpiCount += 1;
        }
      }

      const normalizedRows = payload.normalizedRows ?? [];
      const advertisingScrapeRows = this.pairScrapeRows(rows, normalizedRows);
      if (source === 'advertising' && advertisingScrapeRows.length > 0) {
        for (const pair of advertisingScrapeRows) {
          const row = pair.normalizedRow;
          const match = this.matchListingFromRow(row, map);
          const matchStatus = this.matchStatusOf(match);

          const pageType = this.cleanString(row.pageType) || 'campaign';
          const externalIdRaw = this.pickStringField(row, [
            'externalId',
            'external_id',
            'productId',
            'coupangProductId',
          ]);
          const externalOptionIdRaw = this.pickStringField(row, [
            'vendorItemId',
            'vendor_item_id',
            'itemId',
          ]);
          const snapshot = await this.scrapePersistence.appendSnapshot({
            scrapeRunId: scrapeRun.id,
            companyId,
            channel: 'coupang',
            source: 'advertising',
            pageType,
            businessDate,
            externalId: externalIdRaw,
            externalOptionId: externalOptionIdRaw,
            listingId: match.listingId,
            listingOptionId: match.listingOptionId,
            optionId: match.optionId,
            matchStatus,
            matchReason: pair.hasNormalizedRow
              ? null
              : 'missing normalized row (snapshot only)',
            rawJson: pair.rawRow as unknown as Prisma.InputJsonValue,
            normalizedJson: pair.hasNormalizedRow
              ? (row as unknown as Prisma.InputJsonValue)
              : null,
          });
          scrapeSnapshotCount += 1;
          if (matchStatus === 'unmatched') scrapeUnmatched += 1;
          else scrapeMatched += 1;

          if (!pair.hasNormalizedRow) continue;

          const rowCampaignName = this.cleanString(row.campaignName);
          const rowCampaignId = this.cleanString(row.campaignId);
          const rowAdGroup = this.cleanString(row.adGroup);
          const rowKeyword = this.cleanString(row.keyword);
          const rowSpend = Math.round(this.toNumber(row.spend));
          const rowRevenue = Math.round(this.toNumber(row.revenue));
          const rowImpressions = Math.round(this.toNumber(row.impressions));
          const rowClicks = Math.round(this.toNumber(row.clicks));
          const rowConversions = Math.round(this.toNumber(row.conversions));
          const rowOrders = Math.round(this.toNumber(row.orders));
          const providerRoas = this.toNumber(row.roas);
          const providerCtr = this.toNumber(row.ctr);

          // Listing-day metric upsert when listing identity is known.
          if (match.listingId && match.externalId) {
            await this.scrapePersistence.upsertListingDaily({
              companyId,
              listingId: match.listingId,
              channel: 'coupang',
              externalId: match.externalId,
              businessDate,
              rawSnapshotId: snapshot.id,
              productName: this.cleanString(row.productName),
              metaJson: {
                source: 'advertising.raw',
                data: {
                  campaignName: rowCampaignName,
                  providerRoas,
                  providerCtr,
                },
              },
              metrics: {
                ad: {
                  adSpend: rowSpend,
                  adRevenue: rowRevenue,
                  adImpressions: rowImpressions,
                  adClicks: rowClicks,
                  adConversions: rowConversions,
                  adOrders: rowOrders,
                },
              },
            });
            listingDailyCount += 1;
          }

          // Target-day fact at the row's grain.
          const targetType = this.deriveTargetType(pageType, rowKeyword);
          try {
            const targetKey = buildAdTargetKey({
              targetType,
              campaignId: rowCampaignId,
              campaignName: rowCampaignName,
              adGroup: rowAdGroup,
              keyword: rowKeyword,
              externalId: externalIdRaw ?? match.externalId,
              listingId: match.listingId,
            });
            await this.scrapePersistence.upsertAdTargetDaily({
              companyId,
              channel: 'coupang',
              businessDate,
              targetType,
              targetKey,
              listingId: match.listingId ?? null,
              listingOptionId: match.listingOptionId ?? null,
              optionId: match.optionId ?? null,
              externalId: externalIdRaw ?? match.externalId ?? null,
              externalOptionId:
                externalOptionIdRaw ?? match.externalOptionId ?? null,
              campaignId: rowCampaignId,
              campaignName: rowCampaignName,
              adGroup: rowAdGroup,
              keyword: rowKeyword,
              placement: this.cleanString(row.placement),
              status: this.cleanString(row.status),
              onOff: this.cleanString(row.onOff),
              currentBid: this.toNumberOrNull(row.currentBid),
              dailyBudget: this.toNumberOrNull(row.dailyBudget),
              rawSnapshotId: snapshot.id,
              metaJson: {
                source: 'advertising.raw.target',
                data: {
                  providerRoas,
                  providerCtr,
                  pageType,
                },
              },
              spend: rowSpend,
              revenue: rowRevenue,
              impressions: rowImpressions,
              clicks: rowClicks,
              conversions: rowConversions,
              orders: rowOrders,
              adSpend: rowSpend,
              adRevenue: rowRevenue,
            });
            targetDailyCount += 1;
          } catch (e) {
            this.logger.debug(
              `handleRawScrape advertising skipped target daily upsert: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
          }
        }
      }

      // Wave C2 — unknown source fallback. Snapshot every row as unmatched.
      if (source !== 'wing' && source !== 'advertising') {
        for (const row of rows) {
          const match = this.matchListingFromRow(row, map);
          const matchStatus = this.matchStatusOf(match);
          const externalIdRaw = this.pickStringField(row, [
            'externalId',
            'external_id',
            'productId',
            'coupangProductId',
          ]);
          const externalOptionIdRaw = this.pickStringField(row, [
            'vendorItemId',
            'vendor_item_id',
            'itemId',
          ]);
          await this.scrapePersistence.appendSnapshot({
            scrapeRunId: scrapeRun.id,
            companyId,
            channel: 'coupang',
            source,
            pageType: 'unknown',
            businessDate,
            externalId: externalIdRaw,
            externalOptionId: externalOptionIdRaw,
            listingId: match.listingId,
            listingOptionId: match.listingOptionId,
            optionId: match.optionId,
            matchStatus,
            matchReason: `unknown source '${source}' — raw preserved`,
            rawJson: row as unknown as Prisma.InputJsonValue,
          });
          scrapeSnapshotCount += 1;
          if (matchStatus === 'unmatched') scrapeUnmatched += 1;
          else scrapeMatched += 1;
        }
      }

      await this.scrapePersistence.finalizeRun({
        scrapeRunId: scrapeRun.id,
        companyId,
        status: 'complete',
        rowCount: scrapeSnapshotCount,
        matchedCount: scrapeMatched,
        unmatchedCount: scrapeUnmatched,
      });

      return {
        success: true,
        type: 'raw_scrape',
        source,
        rowCount: rows.length,
        kpiCount: Object.keys(payload.kpis || {}).length,
        listingDailyCount,
        optionDailyCount,
        targetDailyCount,
        accountKpiCount,
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount,
        scrapeMatchedCount: scrapeMatched,
        scrapeUnmatchedCount: scrapeUnmatched,
      };
    } catch (err) {
      await this.finalizeScrapeRunOnError(
        scrapeRun.id,
        companyId,
        {
          rowCount: scrapeSnapshotCount,
          matchedCount: scrapeMatched,
          unmatchedCount: scrapeUnmatched,
        },
        err,
      );
      throw err;
    }
  }

  /**
   * H2 — `traffic` payloads (Wing page-traffic dashboard) land as:
   *   1. `ChannelScrapeSnapshot` per row
   *   2. `ChannelListingDailySnapshot` traffic-metric upsert per matched row
   *   3. `ChannelAccountDailyKpiSnapshot` for dashboard-level KPI cards
   */
  private async handleTraffic(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const period = Number(payload.period) || 14;
    const today = this.resolveBusinessDate(
      payload.startDate,
      payload.dateFrom,
      payload.timestamp,
      payload.endDate,
      payload.dateTo,
    );
    const data = payload.data ?? [];

    const scrapeRun = await this.scrapePersistence.createRun({
      companyId,
      channel: 'coupang',
      source: 'wing',
      pageType: 'traffic',
      businessDate: today,
      periodStart: this.toBusinessDate(payload.dateFrom ?? payload.startDate),
      periodEnd: this.toBusinessDate(payload.dateTo ?? payload.endDate),
      targetUrl: payload.url ?? null,
      period: String(period),
      metaJson: {
        kpis: payload.kpis ?? {},
        adSummary: payload.adSummary ?? null,
        summary: payload.summary ?? null,
        rowCount: data.length,
      } as unknown as Prisma.InputJsonValue,
    });
    let scrapeSnapshotCount = 0;
    let scrapeMatched = 0;
    let scrapeUnmatched = 0;

    try {
      let listingDailyCount = 0;
      let skipped = 0;
      let accountKpiCount = 0;

      for (const item of data) {
        const match = this.matchListingFromRow(item, map);
        const matchStatus = this.matchStatusOf(match);
        const externalIdRaw = this.pickStringField(item, [
          'externalId',
          'external_id',
          'productId',
          'coupangProductId',
        ]);
        const externalOptionIdRaw = this.pickStringField(item, [
          'vendorItemId',
          'vendor_item_id',
          'itemId',
        ]);
        const snapshot = await this.scrapePersistence.appendSnapshot({
          scrapeRunId: scrapeRun.id,
          companyId,
          channel: 'coupang',
          source: 'wing',
          pageType: 'traffic',
          businessDate: today,
          externalId: externalIdRaw,
          externalOptionId: externalOptionIdRaw,
          listingId: match.listingId,
          listingOptionId: match.listingOptionId,
          optionId: match.optionId,
          matchStatus,
          rawJson: item as unknown as Prisma.InputJsonValue,
        });
        scrapeSnapshotCount += 1;
        if (matchStatus === 'unmatched') scrapeUnmatched += 1;
        else scrapeMatched += 1;

        if (!match.listingId) {
          skipped += 1;
          continue;
        }

        const trafficMetrics: ListingDailyTrafficMetrics = {
          trafficVisitors: Math.round(this.toNumber(item.visitors)),
          trafficViews: Math.round(this.toNumber(item.views)),
          trafficCartAdds: Math.round(this.toNumber(item.cartAdds)),
          trafficOrders: Math.round(this.toNumber(item.orders)),
          trafficSalesQty: Math.round(this.toNumber(item.salesQty)),
          trafficRevenue: Math.round(this.toNumber(item.revenue)),
        };
        const providerConversionRate =
          item.visitors > 0
            ? Math.round((item.orders / item.visitors) * 10000) / 100
            : 0;
        await this.scrapePersistence.upsertListingDaily({
          companyId,
          listingId: match.listingId,
          channel: 'coupang',
          externalId: match.externalId ?? externalIdRaw ?? '',
          businessDate: today,
          rawSnapshotId: snapshot.id,
          metaJson: {
            source: 'wing.traffic',
            data: {
              periodDays: period,
              providerConversionRate,
            },
          },
          metrics: { traffic: trafficMetrics },
        });
        listingDailyCount += 1;
      }

      const kpis = payload.kpis || {};
      const adSummary = payload.adSummary || null;
      const summary = payload.summary || null;
      const hasWingSignal =
        Object.keys(kpis).length > 0 || adSummary !== null || summary !== null;

      if (hasWingSignal) {
        const kpiPayload = {
          kpis,
          adSummary,
          summary,
          period,
          startDate: payload.startDate,
          endDate: payload.endDate,
          rowCount: data.length,
          timestamp: payload.timestamp,
        };
        await this.scrapePersistence.upsertAccountKpi({
          companyId,
          channel: 'coupang',
          source: 'wing',
          kpiType: 'wing_dashboard',
          businessDate: today,
          periodStart: this.toBusinessDate(
            payload.dateFrom ?? payload.startDate,
          ),
          periodEnd: this.toBusinessDate(payload.dateTo ?? payload.endDate),
          normalizedJson: kpiPayload as unknown as Prisma.InputJsonValue,
          rawJson: kpiPayload as unknown as Prisma.InputJsonValue,
        });
        accountKpiCount += 1;
      }

      if (listingDailyCount > 0) {
        this.eventEmitter.emit('products.classify-grades');
      }

      await this.scrapePersistence.finalizeRun({
        scrapeRunId: scrapeRun.id,
        companyId,
        status: 'complete',
        rowCount: scrapeSnapshotCount,
        matchedCount: scrapeMatched,
        unmatchedCount: scrapeUnmatched,
      });

      return {
        success: true,
        type: 'traffic',
        listingDailyCount,
        accountKpiCount,
        skipped,
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount,
        scrapeMatchedCount: scrapeMatched,
        scrapeUnmatchedCount: scrapeUnmatched,
      };
    } catch (err) {
      await this.finalizeScrapeRunOnError(
        scrapeRun.id,
        companyId,
        {
          rowCount: scrapeSnapshotCount,
          matchedCount: scrapeMatched,
          unmatchedCount: scrapeUnmatched,
        },
        err,
      );
      throw err;
    }
  }

  /**
   * H2 — `coupang_ads_daily` is the Coupang ads dashboard daily-aggregate
   * KPI feed. There is no listing identity per row, so each row lands in
   * `ChannelAccountDailyKpiSnapshot` with `source='coupang_ads'`.
   */
  private async handleCoupangAdsDaily(
    payload: ExtensionSyncDto,
    companyId: string,
  ) {
    const rows = payload.data ?? [];

    const scrapeRun = await this.scrapePersistence.createRun({
      companyId,
      channel: 'coupang',
      source: 'coupang_ads',
      pageType: 'dashboard_daily',
      businessDate: this.resolveBusinessDate(
        payload.startDate,
        payload.dateFrom,
        payload.timestamp,
        payload.endDate,
        payload.dateTo,
      ),
      periodStart: this.toBusinessDate(payload.dateFrom ?? payload.startDate),
      periodEnd: this.toBusinessDate(payload.dateTo ?? payload.endDate),
      targetUrl: payload.url ?? null,
      metaJson: { rowCount: rows.length } as unknown as Prisma.InputJsonValue,
    });
    let scrapeSnapshotCount = 0;

    try {
      let accountKpiCount = 0;
      for (const row of rows) {
        // Wave C2 — snapshot every row before applying the missing-date skip
        // so raw payload data is preserved (plan §3 principle "Raw before
        // normalized"). Rows without `date` get a null businessDate + a
        // matchReason so reviewers can see why downstream KPI was skipped.
        const rowBusinessDate = row.date
          ? this.toBusinessDate(String(row.date))
          : null;
        const snapshot = await this.scrapePersistence.appendSnapshot({
          scrapeRunId: scrapeRun.id,
          companyId,
          channel: 'coupang',
          source: 'coupang_ads',
          pageType: 'dashboard_daily',
          businessDate: rowBusinessDate,
          externalId: null,
          externalOptionId: null,
          listingId: null,
          listingOptionId: null,
          optionId: null,
          matchStatus: 'unmatched',
          matchReason: row.date
            ? 'kpi-only daily aggregate (no listing identity)'
            : 'missing-date — snapshot only, no daily fact upsert',
          rawJson: row as unknown as Prisma.InputJsonValue,
        });
        scrapeSnapshotCount += 1;

        if (!rowBusinessDate) continue;

        const adSpend = Math.round(this.toNumber(row.adSpend));
        const adRevenue = Math.round(this.toNumber(row.adRevenue));
        const impressions = Math.round(this.toNumber(row.impressions));
        const clicks = Math.round(this.toNumber(row.clicks));
        const conversions = Math.round(this.toNumber(row.conversions));
        const orders = Math.round(this.toNumber(row.orders));
        const providerRoas = this.toNumber(row.roas);
        const providerCtr = this.toNumber(row.ctr);
        const providerConversionRate = this.toNumber(row.conversionRate);

        const normalized = {
          adSpend,
          adRevenue,
          impressions,
          clicks,
          conversions,
          orders,
          providerRoas,
          providerCtr,
          providerConversionRate,
        };
        await this.scrapePersistence.upsertAccountKpi({
          companyId,
          channel: 'coupang',
          source: 'coupang_ads',
          kpiType: 'coupang_ads_daily',
          businessDate: rowBusinessDate,
          normalizedJson: normalized as unknown as Prisma.InputJsonValue,
          rawJson: row as unknown as Prisma.InputJsonValue,
          rawSnapshotId: snapshot.id,
        });
        accountKpiCount += 1;
      }

      await this.scrapePersistence.finalizeRun({
        scrapeRunId: scrapeRun.id,
        companyId,
        status: 'complete',
        rowCount: scrapeSnapshotCount,
        matchedCount: 0,
        unmatchedCount: scrapeSnapshotCount,
      });

      return {
        success: true,
        type: 'coupang_ads_daily',
        accountKpiCount,
        scrapeRunId: scrapeRun.id,
        scrapeSnapshotCount,
        scrapeMatchedCount: 0,
        scrapeUnmatchedCount: scrapeSnapshotCount,
      };
    } catch (err) {
      await this.finalizeScrapeRunOnError(
        scrapeRun.id,
        companyId,
        {
          rowCount: scrapeSnapshotCount,
          matchedCount: 0,
          unmatchedCount: scrapeSnapshotCount,
        },
        err,
      );
      throw err;
    }
  }

  async getScrapeTargets(companyId: string) {
    return this.prisma.scrapeTarget.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createScrapeTarget(
    url: string,
    label: string | undefined,
    category: string | undefined,
    companyId: string,
  ) {
    return this.prisma.scrapeTarget.create({
      data: {
        companyId,
        url,
        label: label || url,
        category: category || 'advertising',
      },
    });
  }

  async markScraped(id: string, companyId: string) {
    const target = await this.prisma.scrapeTarget.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Scrape target not found');
    return this.prisma.scrapeTarget.update({
      where: { id },
      data: { lastScrapedAt: new Date() },
    });
  }

  async deleteScrapeTarget(id: string, companyId: string) {
    const target = await this.prisma.scrapeTarget.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Scrape target not found');
    return this.prisma.scrapeTarget.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private pickStringField(
    row: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const v = row[key];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return null;
  }

  private cleanString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const normalized = value.replace(/[^\d.-]/g, '');
    return normalized ? Number(normalized) || 0 : 0;
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = this.toNumber(value);
    return Number.isFinite(num) ? Math.round(num) : null;
  }

  /**
   * Wave C3 — derive listing-level observable state from a Wing item-winner
   * row. Returns `null` when the row carries no observable state, so the
   * caller can skip the daily upsert entirely (e.g., a row that is only there
   * to feed `ChannelScrapeSnapshot` raw preservation).
   */
  private normalizeWingListingState(
    row: Record<string, any>,
  ): ListingDailyState | null {
    const productName = this.cleanString(row.productName);
    const isOfferWinner = this.toBooleanOrNull(row.isWinner);
    const myPrice = this.toNumberOrNull(row.myPrice);
    const winnerPrice = this.toNumberOrNull(row.winnerPrice);
    if (
      productName === null &&
      isOfferWinner === null &&
      myPrice === null &&
      winnerPrice === null
    ) {
      return null;
    }
    const winnerGapPrice =
      myPrice !== null && winnerPrice !== null ? winnerPrice - myPrice : null;
    return {
      productName,
      isOfferWinner,
      myPrice,
      winnerPrice,
      winnerGapPrice,
    };
  }

  /**
   * Wave C3 — Wing item-winner rows are per-vendor-item, so the same winner
   * fields apply to the option daily fact. Returns `null` when no observable
   * field is present.
   */
  private normalizeWingOptionState(
    row: Record<string, any>,
  ): ListingOptionDailyState | null {
    const isOfferWinner = this.toBooleanOrNull(row.isWinner);
    const myPrice = this.toNumberOrNull(row.myPrice);
    const winnerPrice = this.toNumberOrNull(row.winnerPrice);
    if (isOfferWinner === null && myPrice === null && winnerPrice === null) {
      return null;
    }
    const winnerGapPrice =
      myPrice !== null && winnerPrice !== null ? winnerPrice - myPrice : null;
    return {
      isOfferWinner,
      myPrice,
      winnerPrice,
      winnerGapPrice,
    };
  }

  private toBooleanOrNull(value: unknown): boolean | null {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return null;
  }
}

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
import type { NormalizedCampaignKpi } from './types';
import {
  ChannelScrapePersistenceService,
  type ScrapeMatchStatus,
} from './channel-scrape-persistence.service';

export interface ListingMap {
  // Wave C2: option matches keep `listingOptionId` even when internal
  // `optionId` is null. C3 daily option-snapshot upsert needs the listing
  // option id to land facts before internal product matching is complete.
  externalOptionIdMap: Map<
    string,
    { listingId: string; listingOptionId: string; optionId: string | null }
  >;
  externalIdMap: Map<string, { listingId: string }>;
}

export interface ListingMatch {
  listingId: string | null;
  listingOptionId: string | null;
  optionId: string | null;
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

  async getExtensionStatus(companyId: string) {
    const [listingCount, snapshotCount, wingKpiSnapshot, itemWinnerStats] =
      await Promise.all([
        this.prisma.channelListing.count({
          where: { companyId, isDeleted: false },
        }),
        this.prisma.adSnapshot.count({ where: { companyId } }),
        this.prisma.adSnapshot.findFirst({
          where: { companyId, source: 'wing', pageType: 'itemwinner_kpi' },
          orderBy: { capturedAt: 'desc' },
          select: { rawJson: true, capturedAt: true },
        }),
        this.prisma.itemWinner.groupBy({
          by: ['isWinner'],
          where: { companyId },
          _count: true,
        }),
      ]);

    let wingKpis: Record<string, string> = {};
    if (wingKpiSnapshot?.rawJson) {
      const raw = wingKpiSnapshot.rawJson as Record<string, unknown>;
      if (raw.kpis && typeof raw.kpis === 'object') {
        wingKpis = raw.kpis as Record<string, string>;
      }
    }

    if (Object.keys(wingKpis).length === 0) {
      const total = itemWinnerStats.reduce((s, g) => s + g._count, 0);
      const winners = itemWinnerStats.find((g) => g.isWinner)?._count || 0;
      const nonWinners = itemWinnerStats.find((g) => !g.isWinner)?._count || 0;
      if (total > 0) {
        wingKpis = {
          '아이템위너 상품': String(winners),
          '노출제한 상품': '0',
          '아이템위너 아닌 상품': String(nonWinners),
          '쿠팡 상위 20% 인기 상품': '0',
          '판매자 자동가격조정 상품': '0',
        };
      }
    }

    return {
      connected: true,
      listingCount,
      snapshotCount,
      itemWinnerCount: itemWinnerStats.reduce((s, g) => s + g._count, 0),
      wing: { kpis: wingKpis, lastSync: wingKpiSnapshot?.capturedAt ?? null },
    };
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
        };
      }
    }

    return { listingId: null, listingOptionId: null, optionId: null };
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

  private async handleAdCampaign(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const campaignName = payload.campaignName || '_전체';
    const period = String(payload.period || '7d');
    const today = this.toBusinessDate(payload.timestamp) ?? this.currentBusinessDate();
    const kpis = payload.kpis || {};
    const normalizedRows = payload.normalizedRows ?? [];
    const scrapeRows = this.pairScrapeRows(payload.data, normalizedRows);
    const capturedAt = payload.timestamp
      ? new Date(payload.timestamp)
      : new Date();

    // Wave C2 — dual-write into channel-generic ChannelScrapeRun/Snapshot.
    // Existing AdSnapshot/Ad writes below are preserved unchanged.
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
    let productCount = 0;
    let campaignSnapshotCount = 0;
    let snapshotCount = 0;
    let adCount = 0;
    const rowContexts: Array<
      ScrapeRowPair & {
        match: ListingMatch;
        matchStatus: ScrapeMatchStatus;
      }
    > = [];

    // Wave C2 raw-first contract: persist every source/normalized row before
    // any legacy AdSnapshot/Ad writes. If a downstream legacy write fails, the
    // ChannelScrapeSnapshot rows are still available for replay.
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
      await this.scrapePersistence.appendSnapshot({
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
      rowContexts.push({ ...pair, match, matchStatus });
    }

    const totalKpi: NormalizedCampaignKpi = {
      adSpend: Math.round(
        this.getKpiNumber(kpis, ['전체 집행 광고비', '집행 광고비', '광고비']),
      ),
      adRevenue: Math.round(
        this.getKpiNumber(kpis, ['광고 전환 매출', '전환 매출']),
      ),
      totalRevenue: Math.round(this.getKpiNumber(kpis, ['전체 매출'])),
      impressions: Math.round(this.getKpiNumber(kpis, ['노출수', '노출'])),
      clicks: Math.round(this.getKpiNumber(kpis, ['클릭수', '클릭'])),
      ctr: this.getKpiNumber(kpis, ['클릭률', 'ctr']),
      conversions: Math.round(
        this.getKpiNumber(kpis, ['광고 전환 판매수', '전환 판매수', '전환수']),
      ),
      orders: Math.round(
        this.getKpiNumber(kpis, ['광고 전환 주문수', '전환 주문수', '주문수']),
      ),
      roas: this.getKpiNumber(kpis, ['광고 수익률', '광고수익률', 'roas']),
      conversionRate: this.getKpiNumber(kpis, ['전환율']),
    };

    const existingTotal = await this.prisma.adSnapshot.findFirst({
      where: {
        companyId,
        level: 'campaign',
        campaignName,
        date: today,
        period,
      },
      select: { id: true },
    });
    if (existingTotal) {
      await this.prisma.adSnapshot.update({
        where: { id: existingTotal.id },
        data: { ...totalKpi, collectedAt: capturedAt },
      });
    } else {
      await this.prisma.adSnapshot.create({
        data: {
          companyId,
          level: 'campaign',
          source: 'advertising',
          pageType: 'campaign',
          campaignName,
          date: today,
          period,
          ...totalKpi,
          collectedAt: capturedAt,
        },
      });
    }

    for (const { normalizedRow: row, match, hasNormalizedRow } of rowContexts) {
      if (!hasNormalizedRow) continue;
      if (!row.campaignName && !row.productName && !row.keyword) continue;
      if (row._kpiOnly) continue;
      const rowCampaignName = this.cleanString(row.campaignName) || campaignName;
      const rowStatus = this.cleanString(row.status);
      const rowOnOff = this.cleanString(row.onOff);
      const rowRoas = this.toNumber(row.roas || row.adEfficiencyTarget);
      const rowCtr = this.toNumber(row.ctr);
      const rowSpend = Math.round(this.toNumber(row.runningAdSpend ?? row.spend));
      const rowRevenue = Math.round(this.toNumber(row.revenue));
      const rowDailyBudget = Math.round(this.toNumber(row.dailyBudget));
      const rowTodaySpend = Math.round(this.toNumber(row.todaySpend));
      const rowImpressions = Math.round(this.toNumber(row.impressions));
      const rowClicks = Math.round(this.toNumber(row.clicks));
      const rowConversions = Math.round(this.toNumber(row.conversions));
      const rowOrders = Math.round(this.toNumber(row.orders));
      const rowConversionRate =
        rowClicks > 0
          ? Math.round((rowConversions / Math.max(rowClicks, 1)) * 10000) / 100
          : this.toNumber(row.conversionRate);

      if (
        row.pageType === 'campaign' &&
        rowCampaignName &&
        rowCampaignName !== '_전체'
      ) {
        const existing = await this.prisma.adSnapshot.findFirst({
          where: {
            companyId,
            level: 'campaign',
            campaignName: rowCampaignName,
            date: today,
            period,
          },
          select: { id: true },
        });
        const campaignData = {
          onOff: rowOnOff,
          status: rowStatus,
          adSpend: rowSpend,
          adRevenue: rowRevenue,
          impressions: rowImpressions,
          clicks: rowClicks,
          ctr: rowCtr,
          conversions: rowConversions,
          orders: rowOrders,
          roas: rowRoas,
          conversionRate: rowConversionRate,
          budget: rowDailyBudget,
          todaySpend: rowTodaySpend,
          collectedAt: capturedAt,
        };
        if (existing) {
          await this.prisma.adSnapshot.update({
            where: { id: existing.id },
            data: campaignData,
          });
        } else {
          await this.prisma.adSnapshot.create({
            data: {
              companyId,
              level: 'campaign',
              source: 'advertising',
              pageType: 'campaign',
              campaignName: rowCampaignName,
              date: today,
              period,
              listingId: match.listingId,
              optionId: match.optionId,
              ...campaignData,
            },
          });
        }
        campaignSnapshotCount++;
      }

      const externalId = String(
        row.externalId ||
          [
            row.pageType || 'campaign',
            rowCampaignName || '',
            row.keyword || '',
            row.productName || '',
          ].join('::'),
      );
      await this.prisma.adSnapshot.create({
        data: {
          companyId,
          listingId: match.listingId,
          optionId: match.optionId,
          source: 'advertising',
          pageType: this.cleanString(row.pageType) || 'campaign',
          externalId,
          campaignName: rowCampaignName,
          keyword: this.cleanString(row.keyword),
          productName: this.cleanString(row.productName),
          status: rowStatus,
          currentBid: this.toNumberOrNull(row.currentBid),
          dailyBudget: this.toNumberOrNull(row.dailyBudget),
          impressions: rowImpressions,
          clicks: rowClicks,
          conversions: rowConversions,
          spend: rowSpend,
          revenue: rowRevenue,
          roas: Number.isFinite(rowRoas) ? rowRoas : 0,
          ctr: Number.isFinite(rowCtr) ? rowCtr : 0,
          rawJson: row,
          capturedAt,
        },
      });
      snapshotCount++;

      if (match.listingId) {
        try {
          await this.prisma.adSnapshot.create({
            data: {
              companyId,
              listingId: match.listingId,
              optionId: match.optionId,
              level: 'product',
              source: 'advertising',
              pageType: 'product',
              campaignName: rowCampaignName,
              period,
              date: today,
              productName: row.productName || '',
              vendorItemId: this.cleanString(row.itemId) || '',
              onOff: rowOnOff || '',
              status: rowStatus || '',
              keyword: row.keyword || '',
              adSpend: rowSpend,
              adRevenue: rowRevenue,
              impressions: rowImpressions,
              clicks: rowClicks,
              ctr: rowCtr || 0,
              adConversions: rowConversions,
              conversionRate: rowConversionRate || 0,
            },
          });
          productCount++;
        } catch {
          /* 중복 등 무시 */
        }

        try {
          await this.prisma.ad.create({
            data: {
              companyId,
              listingId: match.listingId,
              optionId: match.optionId,
              platform: 'coupang',
              campaignName: rowCampaignName,
              dailyBudget: rowDailyBudget > 0 ? rowDailyBudget : null,
              spend: rowSpend,
              impressions: rowImpressions,
              clicks: rowClicks,
              conversions: rowConversions,
              revenue: rowRevenue,
              roas: Number.isFinite(rowRoas) ? rowRoas : 0,
              date: today,
            },
          });
          adCount++;
        } catch {
          /* 멱등 — unique conflict 는 skip */
        }
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
      type: 'ad_campaign',
      campaignName,
      period,
      kpiCount: Object.keys(kpis).length,
      campaignSnapshotCount,
      snapshotCount,
      productCount,
      adCount,
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

  private async handleRawScrape(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const source = payload.source || 'unknown';
    const rows = payload.data ?? [];
    const normalizedRowsAll = payload.normalizedRows ?? [];
    let upserted = 0;

    // Wave C2 — pageType: wing → 'itemwinner', advertising rows are
    // per-row pageType. businessDate from payload.timestamp (KST date).
    const businessDate = this.toBusinessDate(payload.timestamp ?? null);
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
    if (source === 'wing') {
      for (const row of rows) {
        const productName = row.productName || '';
        // Wave C2 — snapshot raw row first regardless of downstream filters.
        // The ItemWinner write below skips short product names, but the raw
        // row must be preserved (plan §3 principle "Raw before normalized").
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

        // Legacy ItemWinner downstream write keeps its original filters.
        if (!productName || productName.length < 3) continue;
        if (!match.listingId) continue;

        await this.prisma.itemWinner.create({
          data: {
            companyId,
            listingId: match.listingId,
            productName,
            isWinner: row.isWinner === true || row.isWinner === 'true',
            myPrice: Math.round(Number(row.myPrice) || 0),
            winnerPrice: row.winnerPrice
              ? Math.round(Number(row.winnerPrice))
              : null,
          },
        });
        upserted++;
      }

      const kpis = payload.kpis || {};
      if (Object.keys(kpis).length > 0) {
        await this.prisma.adSnapshot.create({
          data: {
            companyId,
            source: 'wing',
            pageType: 'itemwinner_kpi',
            impressions: 0,
            clicks: 0,
            conversions: 0,
            spend: 0,
            revenue: 0,
            rawJson: {
              kpis,
              rowCount: rows.length,
              timestamp: payload.timestamp,
            },
            capturedAt: payload.timestamp
              ? new Date(payload.timestamp)
              : new Date(),
          },
        });
      }
    }

    const normalizedRows = payload.normalizedRows ?? [];
    const advertisingScrapeRows = this.pairScrapeRows(rows, normalizedRows);
    let snapshotCount = 0;
    if (source === 'advertising' && advertisingScrapeRows.length > 0) {
      for (const pair of advertisingScrapeRows) {
        const row = pair.normalizedRow;
        const match = this.matchListingFromRow(row, map);
        const matchStatus = this.matchStatusOf(match);
        const roas = this.toNumber(row.roas);
        const ctr = this.toNumber(row.ctr);

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
        await this.scrapePersistence.appendSnapshot({
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

        const rawExternalId = String(
          row.externalId ||
            [
              pageType,
              row.campaignName || '',
              row.keyword || '',
              row.productName || '',
            ].join('::'),
        );
        await this.prisma.adSnapshot.create({
          data: {
            companyId,
            listingId: match.listingId,
            optionId: match.optionId,
            source: 'advertising',
            pageType,
            externalId: rawExternalId,
            campaignName: this.cleanString(row.campaignName),
            keyword: this.cleanString(row.keyword),
            productName: this.cleanString(row.productName),
            status: this.cleanString(row.status),
            currentBid: this.toNumberOrNull(row.currentBid),
            dailyBudget: this.toNumberOrNull(row.dailyBudget),
            impressions: Math.round(this.toNumber(row.impressions)),
            clicks: Math.round(this.toNumber(row.clicks)),
            conversions: Math.round(this.toNumber(row.conversions)),
            spend: Math.round(this.toNumber(row.spend)),
            revenue: Math.round(this.toNumber(row.revenue)),
            roas: Number.isFinite(roas) ? roas : 0,
            ctr: Number.isFinite(ctr) ? ctr : 0,
            rawJson: row,
            capturedAt: payload.timestamp
              ? new Date(payload.timestamp)
              : new Date(),
          },
        });
        snapshotCount++;
      }
    }

    // Wave C2 — unknown source fallback. If `source` is neither 'wing' nor
    // 'advertising', the loops above don't fire. Without this fallback
    // `payload.data` rows would be silently dropped — violating plan §3
    // ("preserve scrape source rows"). Snapshot every row as unmatched and
    // record the matchReason so the channel namespace owner can see the
    // unrecognised source surfaced.
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
      upserted,
      snapshotCount,
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

  private async handleTraffic(
    payload: ExtensionSyncDto,
    companyId: string,
    map: ListingMap,
  ) {
    const period = Number(payload.period) || 14;
    const today = this.toBusinessDate(payload.startDate ?? payload.timestamp)
      ?? this.currentBusinessDate();
    const data = payload.data ?? [];
    let upserted = 0;
    let skipped = 0;

    // Wave C2 — traffic 는 wing 의 page-traffic dashboard. periodStart/periodEnd 는
    // dateFrom/dateTo > startDate/endDate 우선순위로 채운다.
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
    type TrafficUpsertRow = {
      listingId: string;
      companyId: string;
      date: Date;
      periodDays: number;
      visitors: number;
      views: number;
      cartAdds: number;
      orders: number;
      salesQty: number;
      revenue: number;
      conversionRate: number;
    };

    const toUpsert: TrafficUpsertRow[] = [];
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
      await this.scrapePersistence.appendSnapshot({
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
        skipped++;
        continue;
      }
      toUpsert.push({
        listingId: match.listingId,
        companyId,
        date: today,
        periodDays: period,
        visitors: item.visitors || 0,
        views: item.views || 0,
        cartAdds: item.cartAdds || 0,
        orders: item.orders || 0,
        salesQty: item.salesQty || 0,
        revenue: Math.round(item.revenue || 0),
        conversionRate:
          item.visitors > 0
            ? Math.round((item.orders / item.visitors) * 10000) / 100
            : 0,
      });
    }

    if (toUpsert.length > 0) {
      await this.prisma.$transaction(
        toUpsert.map((d) =>
          this.prisma.trafficStats.upsert({
            where: {
              listingId_date_periodDays: {
                listingId: d.listingId,
                date: d.date,
                periodDays: d.periodDays,
              },
            },
            update: {
              visitors: d.visitors,
              views: d.views,
              cartAdds: d.cartAdds,
              orders: d.orders,
              salesQty: d.salesQty,
              revenue: d.revenue,
              conversionRate: d.conversionRate,
            },
            create: d,
          }),
        ),
      );
      upserted = toUpsert.length;
    }

    const kpis = payload.kpis || {};
    const adSummary = payload.adSummary || null;
    const summary = payload.summary || null;
    const hasWingSignal =
      Object.keys(kpis).length > 0 || adSummary !== null || summary !== null;

    let wingSnapshotSaved = false;
    if (hasWingSignal) {
      await this.prisma.adSnapshot.create({
        data: {
          companyId,
          source: 'wing',
          pageType: 'dashboard_kpi',
          impressions: 0,
          clicks: 0,
          conversions: 0,
          spend: 0,
          revenue: 0,
          rawJson: {
            kpis,
            adSummary,
            summary,
            period,
            startDate: payload.startDate,
            endDate: payload.endDate,
            rowCount: data.length,
            timestamp: payload.timestamp,
          },
          capturedAt: payload.timestamp
            ? new Date(payload.timestamp)
            : new Date(),
        },
      });
      wingSnapshotSaved = true;
    }

    if (upserted > 0) {
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
      upserted,
      skipped: skipped + (data.length - toUpsert.length - skipped),
      wingSnapshotSaved,
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

  private async handleCoupangAdsDaily(
    payload: ExtensionSyncDto,
    companyId: string,
  ) {
    const rows = payload.data ?? [];
    let upserted = 0;

    // Wave C2 — coupang_ads_daily 는 일별 dashboard scrape. 각 row 가 자체
    // businessDate 를 가지므로 run-level 은 dateFrom/dateTo 만 채우고 row append 시
    // 정확한 businessDate 를 부착한다. 이 source 는 listing 매칭이 없는 KPI 집계라
    // matchStatus = 'unmatched' 로 일관 기록.
    const scrapeRun = await this.scrapePersistence.createRun({
      companyId,
      channel: 'coupang',
      source: 'coupang_ads',
      pageType: 'dashboard_daily',
      businessDate: this.toBusinessDate(payload.startDate),
      periodStart: this.toBusinessDate(payload.dateFrom ?? payload.startDate),
      periodEnd: this.toBusinessDate(payload.dateTo ?? payload.endDate),
      targetUrl: payload.url ?? null,
      metaJson: { rowCount: rows.length } as unknown as Prisma.InputJsonValue,
    });
    let scrapeSnapshotCount = 0;

    try {
    for (const row of rows) {
      // Wave C2 — snapshot every row before applying the missing-date skip
      // so raw payload data is preserved (plan §3 principle "Raw before
      // normalized"). Rows without `date` get a null businessDate + a
      // matchReason so reviewers can see why downstream AdSnapshot was skipped.
      await this.scrapePersistence.appendSnapshot({
        scrapeRunId: scrapeRun.id,
        companyId,
        channel: 'coupang',
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        businessDate: row.date ? this.toBusinessDate(String(row.date)) : null,
        externalId: null,
        externalOptionId: null,
        listingId: null,
        listingOptionId: null,
        optionId: null,
        matchStatus: 'unmatched',
        matchReason: row.date
          ? 'kpi-only daily aggregate (no listing identity)'
          : 'missing-date — snapshot only, no AdSnapshot upsert',
        rawJson: row as unknown as Prisma.InputJsonValue,
      });
      scrapeSnapshotCount += 1;

      const date = row.date ? this.toBusinessDate(String(row.date)) : null;
      if (!date) continue;
      const adSpend = Math.round(Number(row.adSpend) || 0);
      const adRevenue = Math.round(Number(row.adRevenue) || 0);
      const impressions = Math.round(Number(row.impressions) || 0);
      const clicks = Math.round(Number(row.clicks) || 0);
      const conversions = Math.round(Number(row.conversions) || 0);
      const orders = Math.round(Number(row.orders) || 0);
      const roas = Number(row.roas) || 0;
      const ctr = Number(row.ctr) || 0;
      const conversionRate = Number(row.conversionRate) || 0;

      const existing = await this.prisma.adSnapshot.findFirst({
        where: {
          companyId,
          source: 'coupang_ads',
          pageType: 'dashboard_daily',
          date,
        },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.adSnapshot.update({
          where: { id: existing.id },
          data: {
            adSpend,
            adRevenue,
            impressions,
            clicks,
            conversions,
            orders,
            roas,
            ctr,
            conversionRate,
          },
        });
      } else {
        await this.prisma.adSnapshot.create({
          data: {
            companyId,
            source: 'coupang_ads',
            pageType: 'dashboard_daily',
            level: 'campaign',
            period: '1d',
            date,
            adSpend,
            adRevenue,
            impressions,
            clicks,
            conversions,
            orders,
            spend: adSpend,
            revenue: adRevenue,
            roas,
            ctr,
            conversionRate,
          },
        });
      }
      upserted++;
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
      upserted,
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

  private getKpiNumber(kpis: Record<string, unknown>, matchers: string[]): number {
    const normalizedMatchers = matchers.map((m) =>
      String(m || '').replace(/\s+/g, '').toLowerCase(),
    );

    for (const [label, rawValue] of Object.entries(kpis || {})) {
      const normalizedLabel = String(label || '')
        .replace(/\s+/g, '')
        .toLowerCase();
      if (!normalizedMatchers.some((m) => normalizedLabel.includes(m))) continue;

      const value =
        typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue
          ? (rawValue as { value?: unknown }).value
          : rawValue;

      return this.toNumber(value);
    }

    return 0;
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
}

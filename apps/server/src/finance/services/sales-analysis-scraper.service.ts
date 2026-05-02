import { Injectable, Logger } from '@nestjs/common';
import type {
  SalesAnalysisAdsCampaignRollup,
  SalesAnalysisAdsDayRow,
  SalesAnalysisAdsMonthly,
  SalesAnalysisDataSources,
} from '@kiditem/shared/finance';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Scraper-driven data freshness + monthly Coupang ads aggregate.
 *
 * `/sales-analysis` 화면은 현재 Drive replay 데이터에서 동작하는데,
 * 그 데이터의 본질은 (1) Wing 매출분석 일자 트래픽 + (2) 쿠팡 광고센터
 * 일자 KPI 라서 첫 두 method 가 그 두 source 의 coverage / aggregate 를 그대로
 * 반환한다. Order 기반 손익은 0 건이라 기존 sales-analysis.service 로
 * 충분.
 *
 * Date columns (`businessDate`) 는 모두 `@db.Date` 다 → KST instant 로
 * 비교하면 1일씩 어긋난다 (PR #183 의 traffic.service 버그 패턴 참고).
 * 아래 boundary 는 모두 plain UTC midnight 으로 만든다.
 */
@Injectable()
export class SalesAnalysisScraperService {
  private readonly logger = new Logger(SalesAnalysisScraperService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDataSources(
    organizationId: string,
  ): Promise<SalesAnalysisDataSources> {
    const startedAt = Date.now();

    const [wingAgg, adsAgg, ordersAgg, wingDates, adsDates] = await Promise.all(
      [
        this.prisma.channelListingDailySnapshot.aggregate({
          where: { organizationId, trafficVisitors: { gt: 0 } },
          _min: { businessDate: true, lastObservedAt: true },
          _max: { businessDate: true, lastObservedAt: true },
        }),
        this.prisma.channelAccountDailyKpiSnapshot.aggregate({
          where: {
            organizationId,
            kpiType: 'coupang_ads_daily',
          },
          _min: { businessDate: true, lastObservedAt: true },
          _max: { businessDate: true, lastObservedAt: true },
        }),
        this.prisma.order.aggregate({
          where: { organizationId },
          _count: { _all: true },
          _min: { orderedAt: true },
          _max: { orderedAt: true },
        }),
        this.prisma.channelListingDailySnapshot.groupBy({
          by: ['businessDate'],
          where: { organizationId, trafficVisitors: { gt: 0 } },
        }),
        this.prisma.channelAccountDailyKpiSnapshot.groupBy({
          by: ['businessDate'],
          where: {
            organizationId,
            kpiType: 'coupang_ads_daily',
          },
        }),
      ],
    );

    const wingDateSet = new Set(
      wingDates.map((row) => formatBusinessDate(row.businessDate)),
    );
    const adsDateSet = new Set(
      adsDates.map((row) => formatBusinessDate(row.businessDate)),
    );

    const result: SalesAnalysisDataSources = {
      wing: {
        firstDate: wingAgg._min.businessDate
          ? formatBusinessDate(wingAgg._min.businessDate)
          : null,
        lastDate: wingAgg._max.businessDate
          ? formatBusinessDate(wingAgg._max.businessDate)
          : null,
        dateCount: wingDateSet.size,
        lastSyncedAt: wingAgg._max.lastObservedAt
          ? wingAgg._max.lastObservedAt.toISOString()
          : null,
      },
      ads: {
        firstDate: adsAgg._min.businessDate
          ? formatBusinessDate(adsAgg._min.businessDate)
          : null,
        lastDate: adsAgg._max.businessDate
          ? formatBusinessDate(adsAgg._max.businessDate)
          : null,
        dateCount: adsDateSet.size,
        lastSyncedAt: adsAgg._max.lastObservedAt
          ? adsAgg._max.lastObservedAt.toISOString()
          : null,
        missingDates: computeMissingAdsDates(wingDateSet, adsDateSet),
      },
      orders: {
        count: ordersAgg._count._all,
        firstDate: ordersAgg._min.orderedAt
          ? ordersAgg._min.orderedAt.toISOString().slice(0, 10)
          : null,
        lastDate: ordersAgg._max.orderedAt
          ? ordersAgg._max.orderedAt.toISOString().slice(0, 10)
          : null,
      },
      generatedAt: new Date().toISOString(),
    };

    this.logger.log({
      msg: 'sales-analysis.dataSources',
      organizationId,
      wingDates: result.wing.dateCount,
      adsDates: result.ads.dateCount,
      adsMissing: result.ads.missingDates.length,
      orderCount: result.orders.count,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }

  async getMonthlyAds(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<SalesAnalysisAdsMonthly> {
    const startedAt = Date.now();
    const start = new Date(Date.UTC(year, month - 1, 1));
    const endExclusive = new Date(Date.UTC(year, month, 1));

    const [adsRows, wingRows, campaignRows] = await Promise.all([
      this.prisma.channelAccountDailyKpiSnapshot.findMany({
        where: {
          organizationId,
          kpiType: 'coupang_ads_daily',
          businessDate: { gte: start, lt: endExclusive },
        },
        select: { businessDate: true, normalizedJson: true },
        orderBy: { businessDate: 'asc' },
      }),
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['businessDate'],
        where: {
          organizationId,
          businessDate: { gte: start, lt: endExclusive },
          trafficVisitors: { gt: 0 },
        },
      }),
      this.prisma.$queryRaw<
        Array<{
          targetKey: string;
          campaignName: string | null;
          listingId: string | null;
          adSpend: number;
          adRevenue: number;
          impressions: number;
          clicks: number;
          conversions: number;
        }>
      >(Prisma.sql`
        SELECT
          target_key                  AS "targetKey",
          MAX(campaign_name)          AS "campaignName",
          MAX(listing_id::text)::uuid AS "listingId",
          COALESCE(SUM(spend), 0)::int       AS "adSpend",
          COALESCE(SUM(revenue), 0)::int     AS "adRevenue",
          COALESCE(SUM(impressions), 0)::int AS "impressions",
          COALESCE(SUM(clicks), 0)::int      AS "clicks",
          COALESCE(SUM(conversions), 0)::int AS "conversions"
        FROM channel_ad_target_daily_snapshots
        WHERE organization_id = ${organizationId}::uuid
          AND target_type = 'campaign'
          AND business_date >= ${start}
          AND business_date < ${endExclusive}
        GROUP BY target_key
        ORDER BY "adSpend" DESC
        LIMIT 50
      `),
    ]);

    const days: SalesAnalysisAdsDayRow[] = adsRows.map((row) =>
      buildDayRow(formatBusinessDate(row.businessDate), row.normalizedJson),
    );

    const total = sumDays(days);

    const adsDateSet = new Set(days.map((d) => d.date));
    const wingDateSet = new Set(
      wingRows.map((row) => formatBusinessDate(row.businessDate)),
    );
    const missingDates = [...wingDateSet]
      .filter((d) => !adsDateSet.has(d))
      .sort();

    const campaigns: SalesAnalysisAdsCampaignRollup[] = campaignRows.map(
      (row) => ({
        targetKey: row.targetKey,
        campaignName: row.campaignName,
        listingId: row.listingId,
        adSpend: row.adSpend,
        adRevenue: row.adRevenue,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        roas: row.adSpend > 0 ? (row.adRevenue / row.adSpend) * 100 : 0,
      }),
    );

    const result: SalesAnalysisAdsMonthly = {
      year,
      month,
      days,
      total,
      missingDates,
      campaigns,
      generatedAt: new Date().toISOString(),
    };

    this.logger.log({
      msg: 'sales-analysis.adsMonthly',
      organizationId,
      year,
      month,
      dayCount: days.length,
      missingDates: missingDates.length,
      campaignCount: campaigns.length,
      totalSpend: total.adSpend,
      totalRevenue: total.adRevenue,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }
}

function formatBusinessDate(date: Date): string {
  // `@db.Date` columns serialize as `YYYY-MM-DDT00:00:00.000Z` regardless of
  // server timezone, so the leading 10 chars are the canonical KST business
  // date.
  return date.toISOString().slice(0, 10);
}

function computeMissingAdsDates(
  wingDates: Set<string>,
  adsDates: Set<string>,
): string[] {
  if (wingDates.size === 0) return [];
  const sortedWing = [...wingDates].sort();
  const firstWing = sortedWing[0];
  const lastWing = sortedWing[sortedWing.length - 1];
  return enumerateDates(firstWing, lastWing).filter((d) => !adsDates.has(d));
}

function enumerateDates(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${fromIso}T00:00:00.000Z`);
  const end = new Date(`${toIso}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function buildDayRow(date: string, raw: unknown): SalesAnalysisAdsDayRow {
  const payload = (raw ?? {}) as Record<string, unknown>;
  const adSpend = toInt(payload.adSpend);
  const adRevenue = toInt(payload.adRevenue);
  const impressions = toInt(payload.impressions);
  const clicks = toInt(payload.clicks);
  const conversions = toInt(payload.conversions);
  const orders = toInt(payload.orders);
  return {
    date,
    adSpend,
    adRevenue,
    impressions,
    clicks,
    conversions,
    orders,
    roas: adSpend > 0 ? (adRevenue / adSpend) * 100 : 0,
    ctr: impressions > 0 ? clicks / impressions : 0,
    // CVR = orders / clicks. The scraper's `conversions` field on
    // `coupang_ads_daily` rows currently mirrors `adRevenue` (KRW amount,
    // not a count), so dividing it by clicks produces a misleading ratio.
    // `orders` is the canonical post-attribution transaction count.
    cvr: clicks > 0 ? orders / clicks : 0,
  } satisfies SalesAnalysisAdsDayRow;
}

function sumDays(
  days: SalesAnalysisAdsDayRow[],
): Omit<SalesAnalysisAdsDayRow, 'date'> {
  const adSpend = days.reduce((s, d) => s + d.adSpend, 0);
  const adRevenue = days.reduce((s, d) => s + d.adRevenue, 0);
  const impressions = days.reduce((s, d) => s + d.impressions, 0);
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  const conversions = days.reduce((s, d) => s + d.conversions, 0);
  const orders = days.reduce((s, d) => s + d.orders, 0);
  return {
    adSpend,
    adRevenue,
    impressions,
    clicks,
    conversions,
    orders,
    roas: adSpend > 0 ? (adRevenue / adSpend) * 100 : 0,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cvr: clicks > 0 ? orders / clicks : 0,
  };
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/[,%]/g, ''));
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return 0;
}

import { Injectable, Logger } from '@nestjs/common';
import type { SalesAnalysisDataSources } from '@kiditem/shared/finance';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Scraper-driven data freshness summary.
 *
 * `/sales-analysis` 화면은 현재 Drive replay 데이터에서 동작하는데,
 * 그 데이터의 본질은 (1) Wing 매출분석 일자 트래픽 + (2) 쿠팡 광고센터
 * 일자 KPI 라서 이 service 는 source coverage 만 반환한다. Order 기반
 * 손익은 0 건이라 기존 sales-analysis.service 로 충분.
 *
 * Date columns (`businessDate`) 는 모두 `@db.Date` 다 → KST instant 로
 * 비교하면 1일씩 어긋난다 (PR #183 의 traffic.service 버그 패턴 참고).
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

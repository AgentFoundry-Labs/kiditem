import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AD_ACCOUNT_DAILY_KPI_READ_PORT,
  type AdAccountDailyKpiReadPort,
} from '../../advertising/application/port/in/ad-account-daily-kpi-source.port';
import {
  AD_TRAFFIC_READ_PORT,
  type AdTrafficReadPort,
} from '../../advertising/application/port/in/ad-traffic-source.port';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdTrafficSourceAccountDaily,
  AdTrafficSourceCoverage,
  AdTrafficSourceDailyPublished,
  AdTrafficSourcePublished,
} from '@kiditem/shared/advertising';
import type { SalesAnalysisDataSources } from '@kiditem/shared/finance';

/**
 * Scraper-driven data freshness summary.
 *
 * `/sales-analysis` 화면은 현재 Drive replay 데이터에서 동작하는데,
 * 그 데이터의 본질은 (1) Wing 매출분석 일자 트래픽 + (2) 쿠팡 광고센터
 * 일자 KPI 라서 이 service 는 source coverage 만 반환한다. Wing traffic은
 * Advertising source-owner read를 통해서만 읽는다. Order 기반 손익은 0
 * 건이라 기존 sales-analysis.service 로 충분.
 *
 * Date columns (`businessDate`) 는 모두 `@db.Date` 다 → KST instant 로
 * 비교하면 1일씩 어긋난다 (PR #183 의 traffic.service 버그 패턴 참고).
 */
@Injectable()
export class SalesAnalysisScraperService {
  private readonly logger = new Logger(SalesAnalysisScraperService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AD_ACCOUNT_DAILY_KPI_READ_PORT)
    private readonly adAccountDailyKpiRead: AdAccountDailyKpiReadPort,
    @Inject(AD_TRAFFIC_READ_PORT)
    private readonly adTrafficRead: AdTrafficReadPort,
  ) {}

  async getDataSources(
    organizationId: string,
  ): Promise<SalesAnalysisDataSources> {
    const startedAt = Date.now();

    const [wingPublished, adsPublished, ordersAgg] = await Promise.all([
      this.readTrafficPublished(organizationId),
      this.readAdsPublished(organizationId),
      this.prisma.order.aggregate({
        where: { organizationId },
        _count: { _all: true },
        _min: { orderedAt: true },
        _max: { orderedAt: true },
      }),
    ]);

    const wingRows = accountDailyRows(wingPublished);
    const adsRows = adsPublished?.rows ?? [];
    const adsDateSet = new Set(adsRows.map((row) => row.businessDate));
    const sortedAdsDates = [...adsDateSet].sort();

    const wingDateSet = new Set(wingRows.map((row) => row.businessDate));
    const sortedWingDates = [...wingDateSet].sort();

    const result: SalesAnalysisDataSources = {
      wing: {
        firstDate: sortedWingDates[0] ?? null,
        lastDate: sortedWingDates.at(-1) ?? null,
        dateCount: wingDateSet.size,
        lastSyncedAt: latestTrafficObservedAt(wingPublished),
        coverage: trafficCoverage(wingPublished),
      },
      ads: {
        firstDate: sortedAdsDates[0] ?? null,
        lastDate: sortedAdsDates[sortedAdsDates.length - 1] ?? null,
        dateCount: sortedAdsDates.length,
        lastSyncedAt: latestObservedAt(adsRows),
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

  private async readAdsPublished(
    organizationId: string,
  ): Promise<Awaited<ReturnType<AdAccountDailyKpiReadPort['readPublished']>> | null> {
    try {
      return await this.adAccountDailyKpiRead.readPublished({ organizationId });
    } catch (error) {
      if (
        error instanceof NotFoundException &&
        error.message === 'COUPANG_ACCOUNT_NOT_FOUND'
      ) {
        return null;
      }
      throw error;
    }
  }

  private async readTrafficPublished(
    organizationId: string,
  ): Promise<AdTrafficSourcePublished | null> {
    try {
      return await this.adTrafficRead.readPublished({ organizationId });
    } catch (error) {
      if (
        error instanceof NotFoundException
        && ['COUPANG_ACCOUNT_NOT_FOUND', 'AD_TRAFFIC_SOURCE_MISSING'].includes(error.message)
      ) {
        return null;
      }
      throw error;
    }
  }
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

function latestObservedAt(
  rows: ReadonlyArray<{ observedAt: string }>,
): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (!latest || Date.parse(row.observedAt) > Date.parse(latest)) {
      latest = row.observedAt;
    }
  }
  return latest;
}

function latestTrafficObservedAt(
  published: AdTrafficSourcePublished | null,
): string | null {
  if (!published) return null;
  return latestObservedAt(accountDailyRows(published));
}

function accountDailyRows(
  published: AdTrafficSourcePublished | null,
): AdTrafficSourceAccountDaily[] {
  const daily = dailyPublished(published);
  return daily?.accountDaily ?? [];
}

function trafficCoverage(
  published: AdTrafficSourcePublished | null,
): AdTrafficSourceCoverage | null {
  return dailyPublished(published)?.coverage ?? null;
}

function dailyPublished(
  published: AdTrafficSourcePublished | null,
): AdTrafficSourceDailyPublished | null {
  return published && 'accountDaily' in published ? published : null;
}

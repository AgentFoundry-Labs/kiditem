import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { isKiditemError } from '@kiditem/shared/errors';
import { Prisma } from '@prisma/client';
import {
  AD_TRAFFIC_READ_PORT,
  type AdTrafficReadPort,
} from '../../../../advertising/application/port/in/ad-traffic-source.port';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  businessDateKey,
  datesInclusive,
  kstWindowDateRange,
  parseBusinessDate,
} from '../../../../common/kst';
import {
  readObservedOrderBounds,
  readObservedOrderCount,
} from '../../../../orders/adapter/out/persistence/read/order-facts.reader';
import { readAdWindowFacts } from '../../../../advertising/adapter/out/persistence/read/ad-target-facts';
import type { AdTrafficSourceAccountDaily, AdTrafficSourceCoverage, AdTrafficSourceDailyPublished, AdTrafficSourcePublished } from '@kiditem/shared/advertising-operations';
import type { SalesAnalysisDataSources } from '@kiditem/shared/finance';

/**
 * Scraper-driven data freshness summary.
 *
 * `/sales-analysis` 화면은 현재 Drive replay 데이터에서 동작하는데,
 * 그 데이터의 본질은 (1) Wing 매출분석 일자 트래픽 + (2) 쿠팡 광고 캠페인
 * sweep 이 측정한 영업일이라 이 service 는 source coverage 만 반환한다.
 * Wing traffic 은 Advertising source-owner read 로, 광고 날짜는 광고
 * target-일 원장 리더로만 읽는다. Order 기반 손익은 0 건이라 기존
 * sales-analysis.service 로 충분.
 *
 * Date columns (`businessDate`) 는 모두 `@db.Date` 다 → KST instant 로
 * 비교하면 1일씩 어긋난다 (PR #183 의 traffic.service 버그 패턴 참고).
 */
@Injectable()
export class SalesAnalysisScraperService {
  private readonly logger = new Logger(SalesAnalysisScraperService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AD_TRAFFIC_READ_PORT)
    private readonly adTrafficRead: AdTrafficReadPort,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
  ) {}

  async getDataSources(
    organizationId: string,
  ): Promise<SalesAnalysisDataSources> {
    const startedAt = Date.now();

    const [wingPublished, adsMeasured, orders] = await Promise.all([
      this.readTrafficPublished(organizationId),
      this.readMeasuredAdDates(organizationId),
      this.readPublishedOrders(organizationId),
    ]);

    const wingRows = accountDailyRows(wingPublished);
    const adsDateSet = new Set(adsMeasured.days.map((day) => day.businessDate));
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
        lastSyncedAt: adsMeasured.observedAt?.toISOString() ?? null,
        missingDates: computeMissingAdsDates(wingDateSet, adsDateSet),
      },
      orders,
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

  /**
   * Orders a completed Orders collection published and the KST business dates
   * they span, through the same Orders reader fence as the P&L table.
   */
  private async readPublishedOrders(
    organizationId: string,
  ): Promise<SalesAnalysisDataSources['orders']> {
    const { count, bounds } = await this.prisma.$transaction(async (tx) => ({
      count: await readObservedOrderCount(tx, organizationId),
      bounds: await readObservedOrderBounds(tx, organizationId),
    }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const range = bounds ? kstWindowDateRange(bounds) : null;
    return {
      count,
      firstDate: range?.from ?? null,
      lastDate: range?.to ?? null,
    };
  }

  /**
   * Business dates the Coupang campaign sweep measured, through the
   * advertising target-day reader. With no active Coupang account nothing is
   * measured and the list is empty.
   */
  private readMeasuredAdDates(organizationId: string) {
    return this.prisma.$transaction(
      (tx) => readAdWindowFacts(tx, { organizationId }, this.channelAccounts),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async readTrafficPublished(
    organizationId: string,
  ): Promise<AdTrafficSourcePublished | null> {
    try {
      return await this.adTrafficRead.readPublished({ organizationId });
    } catch (error) {
      if (
        isKiditemError(error) && error.code === 'CHANNELS_ACCOUNT_NOT_FOUND'
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
  const from = parseBusinessDate(fromIso);
  const to = parseBusinessDate(toIso);
  if (!from || !to) return [];
  return datesInclusive(from, to).map(businessDateKey);
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

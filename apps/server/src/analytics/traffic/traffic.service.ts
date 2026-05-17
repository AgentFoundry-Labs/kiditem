import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { MulterFile } from '../../common/types';
import { resolvePricing } from '../../common/option-pricing-resolver';
import { kstDayStart } from '../../common/kst';
import {
  uploadTrafficStats as uploadTrafficStatsIngest,
  type TrafficUploadOptions,
} from './traffic-upload';
import {
  TRAFFIC_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from './application/port/out/operation-alert.port';

interface DayRevenue {
  date: string;
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
  netProfit?: number;
  profitRate?: number;
}

/**
 * Pricing 원천 — ProductOption. ChannelListing.master.options[0] 을 대표 옵션으로 사용.
 * 멀티 option listing 은 listing 단위 일별 트래픽이 listing 단위 집계라
 * 첫 option 기준으로 충분.
 * option 이 0 개이면 pricing 없음 → row skip (아래 profit 루프에서 처리).
 */
const LISTING_PRICING_SELECT = {
  id: true,
  master: {
    select: {
      options: {
        where: { isDeleted: false },
        select: {
          costPrice: true,
          sellPrice: true,
          commissionRate: true,
          shippingCost: true,
          otherCost: true,
        },
        orderBy: { sortOrder: 'asc' },
        take: 1,
      },
    },
  },
} as const;

/**
 * `TrafficService` reads + writes daily facts only.
 *
 * Read paths (`getTrafficSummary`, `getMonthlyRevenue`) aggregate
 * `ChannelListingDailySnapshot.trafficVisitors / trafficViews / trafficCartAdds
 * / trafficOrders / trafficSalesQty / trafficRevenue` over the requested
 * KST-anchored window.
 *
 * Ingest path (`uploadTrafficStats`) — CSV/XLSX upload from the operator
 * console. Writes `ChannelListingDailySnapshot` directly with the same
 * overwrite-on-replay semantics the extension-sync ingest uses. Raw audit
 * lands in `ChannelScrapeSnapshot` via a single `ChannelScrapeRun`. The
 * traffic domain owns its own ingest entrypoint (controller route `POST
 * /api/traffic/upload`) — not unified into `/api/ads/extension/sync` because
 * the upload flow is operator-driven (not extension-pushed) and the
 * cross-domain service injection is forbidden by `apps/server/AGENTS.md`.
 * Inline use of the same low-level Prisma primitives keeps the domain
 * boundary clean.
 *
 * Daily fact upsert keys on `(organizationId, listingId, businessDate)` matching
 * the unique index on `ChannelListingDailySnapshot`. Repeated uploads for
 * the same day overwrite the additive `traffic*` columns to the new total
 * (idempotent under operator re-uploads of the same period).
 */
@Injectable()
export class TrafficService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(TRAFFIC_OPERATION_ALERT_PORT)
    private readonly operationAlerts?: OperationAlertPort,
  ) {}

  async uploadTrafficStats(
    file: MulterFile,
    organizationId: string,
    options: TrafficUploadOptions = {},
  ) {
    return uploadTrafficStatsIngest({
      file,
      organizationId,
      options,
      prisma: this.prisma,
      operationAlerts: this.operationAlerts,
    });
  }

  /**
   * Period traffic summary — KST-anchored half-open window over
   * `ChannelListingDailySnapshot.traffic*` columns.
   *
   * `organizationId` is required by the multi-tenant rule. The controller passes
   * the request organization.
   */
  async getTrafficSummary(days: number, organizationId: string) {
    const todayStart = kstDayStart(new Date());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    let start: Date;
    let end: Date;
    if (days <= 1) {
      start = todayStart;
      end = todayEnd;
    } else {
      start = new Date(todayStart.getTime() - (days - 1) * 86400000);
      end = todayEnd;
    }

    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = start;

    const [cur, prev, listingRows] = await Promise.all([
      this.prisma.channelListingDailySnapshot.aggregate({
        _sum: {
          trafficRevenue: true,
          trafficOrders: true,
          trafficSalesQty: true,
          trafficVisitors: true,
          trafficViews: true,
          trafficCartAdds: true,
        },
        where: { organizationId, businessDate: { gte: start, lt: end } },
      }),
      this.prisma.channelListingDailySnapshot.aggregate({
        _sum: {
          trafficRevenue: true,
          trafficOrders: true,
          trafficSalesQty: true,
          trafficVisitors: true,
        },
        where: {
          organizationId,
          businessDate: { gte: prevStart, lt: prevEnd },
        },
      }),
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId'],
        _sum: {
          trafficRevenue: true,
          trafficSalesQty: true,
          trafficOrders: true,
        },
        where: { organizationId, businessDate: { gte: start, lt: end } },
      }),
    ]);

    const revenue = cur._sum.trafficRevenue ?? 0;
    const prevRevenue = prev._sum.trafficRevenue ?? 0;
    const orders = cur._sum.trafficOrders ?? 0;
    const prevOrders = prev._sum.trafficOrders ?? 0;

    let netProfit: number | undefined;
    let profitRate: number | undefined;
    let costCoverage: number | undefined;

    if (listingRows.length > 0) {
      const listingIds = listingRows.map((r) => r.listingId);
      const listings = await this.prisma.channelListing.findMany({
        where: { id: { in: listingIds }, organizationId, isDeleted: false },
        select: LISTING_PRICING_SELECT,
      });
      const listingMap = new Map(listings.map((l) => [l.id, l]));

      let totalNetProfit = 0;
      let revenueWithCost = 0;

      for (const row of listingRows) {
        const salesQty = row._sum.trafficSalesQty ?? 0;
        const rowRevenue = row._sum.trafficRevenue ?? 0;
        if (salesQty === 0) continue;

        const listing = listingMap.get(row.listingId);
        if (!listing) continue;
        const option = listing.master.options[0];
        if (!option) continue;

        const resolved = resolvePricing({ option });
        const commRate = resolved.commissionRate || 0.108;
        const ordersCount = row._sum.trafficOrders ?? salesQty;
        const rowNetProfit =
          rowRevenue -
          resolved.costPrice * salesQty -
          rowRevenue * commRate -
          resolved.shippingCost * ordersCount -
          resolved.otherCost * salesQty;

        totalNetProfit += rowNetProfit;
        if (!resolved.isCostMissing) {
          revenueWithCost += rowRevenue;
        }
      }

      netProfit = Math.round(totalNetProfit);
      profitRate =
        revenue > 0 ? Math.round((totalNetProfit / revenue) * 1000) / 10 : 0;
      costCoverage =
        revenue > 0 ? Math.round((revenueWithCost / revenue) * 100) / 100 : 0;
    }

    return {
      days,
      revenue,
      orders,
      salesQty: cur._sum.trafficSalesQty ?? 0,
      visitors: cur._sum.trafficVisitors ?? 0,
      views: cur._sum.trafficViews ?? 0,
      cartAdds: cur._sum.trafficCartAdds ?? 0,
      prevRevenue,
      prevOrders,
      revenueChange:
        prevRevenue > 0
          ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10
          : 0,
      ordersChange:
        prevOrders > 0
          ? Math.round(((orders - prevOrders) / prevOrders) * 1000) / 10
          : 0,
      netProfit,
      profitRate,
      costCoverage,
    };
  }

  async getMonthlyRevenue(year: number, month: number, organizationId: string) {
    // `businessDate` is a Postgres date column. Prisma compares it as a
    // calendar date, so use DB date midnights instead of KST instants; otherwise
    // the month window shifts one date backward at both boundaries.
    const start = new Date(Date.UTC(year, month - 1, 1));
    const endExclusive = new Date(Date.UTC(year, month, 1));

    const [rows, listingRows] = await Promise.all([
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['businessDate'],
        where: {
          organizationId,
          businessDate: { gte: start, lt: endExclusive },
        },
        _sum: {
          trafficRevenue: true,
          trafficOrders: true,
          trafficSalesQty: true,
          trafficVisitors: true,
        },
        orderBy: { businessDate: 'asc' },
      }),
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId', 'businessDate'],
        where: {
          organizationId,
          businessDate: { gte: start, lt: endExclusive },
        },
        _sum: {
          trafficRevenue: true,
          trafficSalesQty: true,
          trafficOrders: true,
        },
      }),
    ]);

    const listingIds = [...new Set(listingRows.map((r) => r.listingId))];
    const listings =
      listingIds.length > 0
        ? await this.prisma.channelListing.findMany({
            where: { id: { in: listingIds }, organizationId, isDeleted: false },
            select: LISTING_PRICING_SELECT,
          })
        : [];
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const dailyProfitMap = new Map<string, number>();
    for (const row of listingRows) {
      const salesQty = row._sum.trafficSalesQty ?? 0;
      const rowRevenue = row._sum.trafficRevenue ?? 0;
      if (salesQty === 0) continue;
      const listing = listingMap.get(row.listingId);
      if (!listing) continue;
      const option = listing.master.options[0];
      if (!option) continue;
      const resolved = resolvePricing({ option });
      const commRate = resolved.commissionRate || 0.108;
      const ordersCount = row._sum.trafficOrders ?? salesQty;
      const rowNetProfit =
        rowRevenue -
        resolved.costPrice * salesQty -
        rowRevenue * commRate -
        resolved.shippingCost * ordersCount -
        resolved.otherCost * salesQty;
      const dateKey = row.businessDate.toISOString().slice(0, 10);
      dailyProfitMap.set(
        dateKey,
        (dailyProfitMap.get(dateKey) ?? 0) + rowNetProfit,
      );
    }

    const days: DayRevenue[] = rows.map((r) => {
      const dateKey = r.businessDate.toISOString().slice(0, 10);
      const rev = r._sum.trafficRevenue ?? 0;
      const np = Math.round(dailyProfitMap.get(dateKey) ?? 0);
      return {
        date: dateKey,
        revenue: rev,
        orders: r._sum.trafficOrders ?? 0,
        salesQty: r._sum.trafficSalesQty ?? 0,
        visitors: r._sum.trafficVisitors ?? 0,
        netProfit: np,
        profitRate: rev > 0 ? Math.round((np / rev) * 1000) / 10 : 0,
      };
    });

    const total = {
      revenue: days.reduce((s, d) => s + d.revenue, 0),
      orders: days.reduce((s, d) => s + d.orders, 0),
      salesQty: days.reduce((s, d) => s + d.salesQty, 0),
      visitors: days.reduce((s, d) => s + d.visitors, 0),
      netProfit: days.reduce((s, d) => s + (d.netProfit ?? 0), 0),
    };

    return { year, month, days, total };
  }
}

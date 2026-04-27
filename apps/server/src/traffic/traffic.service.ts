import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import type { MulterFile } from '../common/types';
import { resolvePricing } from '../common/option-pricing-resolver';
import { kstDayStart } from '../common/kst';

export interface DayRevenue {
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
 * Hard rewrite Phase H3b — `TrafficService` reads + writes daily facts only.
 *
 * Read paths (`getTrafficSummary`, `getMonthlyRevenue`) aggregate
 * `ChannelListingDailySnapshot.trafficVisitors / trafficViews / trafficCartAdds
 * / trafficOrders / trafficSalesQty / trafficRevenue` over the requested
 * KST-anchored window. Replaces the legacy `TrafficStats.aggregate` /
 * `TrafficStats.groupBy` / `FROM traffic_stats` raw SQL.
 *
 * Ingest path (`uploadTrafficStats`) — CSV/XLSX upload from the operator
 * console. **Decision**: rewire to write `ChannelListingDailySnapshot` (the
 * H1 daily-fact table) directly with the same overwrite-on-replay semantics
 * the H2 extension-sync ingest uses. Raw audit lands in `ChannelScrapeSnapshot`
 * via a single `ChannelScrapeRun`. The traffic domain still owns its own
 * ingest entrypoint (controller route `POST /api/traffic/upload`) — the
 * ingest is not unified into `/api/ads/extension/sync` because the upload
 * flow is operator-driven (not extension-pushed) and the cross-domain
 * service injection is forbidden by `apps/server/AGENTS.md`. Inline use
 * of the same low-level Prisma primitives keeps the domain boundary clean
 * while retiring the `TrafficStats` writes.
 *
 * Daily fact upsert keys on `(companyId, listingId, businessDate)` matching
 * the unique index on `ChannelListingDailySnapshot`. Repeated uploads for
 * the same day overwrite the additive `traffic*` columns to the new total
 * (idempotent under operator re-uploads of the same period).
 */
@Injectable()
export class TrafficService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadTrafficStats(file: MulterFile, companyId: string) {
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('파일 크기 10MB 초과');
    }

    const buffer = file.buffer;
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      throw new BadRequestException('데이터가 없습니다');
    }

    const keys = Object.keys(rows[0]);

    function findCol(...candidates: string[]): string | null {
      for (const c of candidates) {
        const found = keys.find((k) => k === c);
        if (found) return found;
      }
      for (const c of candidates) {
        const found = keys.find(
          (k) => k.includes(c) && !k.includes('전환') && !k.includes('총'),
        );
        if (found) return found;
      }
      return null;
    }

    const colProductId = findCol('등록상품ID', '등록상품 ID', 'sellerProductId');
    const colVisitors = findCol('방문자');
    const colViews =
      keys.find((k) => k === '조회') || keys.find((k) => k === '조회수') || null;
    const colCart = findCol('장바구니');
    const colOrders =
      keys.find((k) => k === '주문') || keys.find((k) => k === '주문수') || null;
    const colSalesQty = findCol('판매량', '판매수량');
    const colRevenue =
      keys.find((k) => k === '매출(원)') ||
      keys.find((k) => k === '매출') ||
      null;
    const colDate = findCol('날짜', '기간', '일자');

    if (!colProductId) {
      throw new BadRequestException(
        `등록상품ID 컬럼을 찾을 수 없습니다. 감지된 컬럼: ${keys.join(', ')}`,
      );
    }

    // Coupang 의 '등록상품ID' 는 ChannelListing.externalId 에 해당.
    // CSV upload 는 Coupang 전용이므로 channel='coupang' 로 제한.
    const listings = await this.prisma.channelListing.findMany({
      where: { companyId, isDeleted: false, channel: 'coupang' },
      select: { id: true, externalId: true },
    });
    const listingMap = new Map<string, string>(
      listings.map((l) => [l.externalId, l.id]),
    );

    const todayKst = kstDayStart(new Date());
    const todayStr = todayKst.toISOString().slice(0, 10);

    const parseNum = (val: unknown): number => {
      if (val === null || val === undefined) return 0;
      const n = Number(String(val).replace(/[,%]/g, ''));
      return isNaN(n) ? 0 : n;
    };

    type AggregatedRow = {
      listingId: string;
      externalId: string;
      visitors: number;
      views: number;
      cartAdds: number;
      orders: number;
      salesQty: number;
      revenue: number;
      date: string; // 'YYYY-MM-DD' KST
    };

    const aggregated = new Map<string, AggregatedRow>();
    const skippedRows: Array<{ raw: Record<string, unknown>; reason: string }> = [];

    let skipped = 0;

    for (const row of rows) {
      const cpId = String(row[colProductId] || '').trim();
      if (!cpId) {
        skipped++;
        skippedRows.push({ raw: row, reason: 'missing-external-id' });
        continue;
      }

      const listingId = listingMap.get(cpId);
      if (!listingId) {
        skipped++;
        skippedRows.push({ raw: row, reason: 'unmatched-listing' });
        continue;
      }

      const date = colDate
        ? String(row[colDate] || todayStr).slice(0, 10)
        : todayStr;
      const key = `${listingId}::${date}`;

      const visitors = parseNum(colVisitors ? row[colVisitors] : 0);
      const views = parseNum(colViews ? row[colViews] : 0);
      const cartAdds = parseNum(colCart ? row[colCart] : 0);
      const orders = parseNum(colOrders ? row[colOrders] : 0);
      const salesQty = parseNum(colSalesQty ? row[colSalesQty] : 0);
      const revenue = parseNum(colRevenue ? row[colRevenue] : 0);

      const existing = aggregated.get(key);
      if (existing) {
        existing.visitors += visitors;
        existing.views += views;
        existing.cartAdds += cartAdds;
        existing.orders += orders;
        existing.salesQty += salesQty;
        existing.revenue += revenue;
      } else {
        aggregated.set(key, {
          listingId,
          externalId: cpId,
          date,
          visitors,
          views,
          cartAdds,
          orders,
          salesQty,
          revenue,
        });
      }
    }

    const dataArr = [...aggregated.values()];
    const observedAt = new Date();

    if (dataArr.length > 0 || skippedRows.length > 0) {
      // Persist a `ChannelScrapeRun` + per-row `ChannelScrapeSnapshot` so the
      // raw upload is auditable / replay-able the same way extension-sync
      // payloads are. Daily-fact upserts run in the same transaction so a
      // partial failure rolls everything back.
      await this.prisma.$transaction(async (tx) => {
        const run = await tx.channelScrapeRun.create({
          data: {
            companyId,
            channel: 'coupang',
            source: 'traffic_csv_upload',
            pageType: 'traffic',
            businessDate: todayKst,
            status: 'running',
            rowCount: rows.length,
            metaJson: {
              detectedColumns: {
                productId: colProductId,
                visitors: colVisitors,
                views: colViews,
                cart: colCart,
                orders: colOrders,
                salesQty: colSalesQty,
                revenue: colRevenue,
                date: colDate,
              },
              fileName: file.originalname,
            } as Prisma.InputJsonValue,
          },
          select: { id: true },
        });

        for (const d of dataArr) {
          const businessDate = new Date(d.date);
          const snapshot = await tx.channelScrapeSnapshot.create({
            data: {
              companyId,
              scrapeRunId: run.id,
              channel: 'coupang',
              source: 'traffic_csv_upload',
              pageType: 'traffic',
              businessDate,
              externalId: d.externalId,
              listingId: d.listingId,
              matchStatus: 'matched',
              rawJson: {
                visitors: d.visitors,
                views: d.views,
                cartAdds: d.cartAdds,
                orders: d.orders,
                salesQty: d.salesQty,
                revenue: d.revenue,
              } as Prisma.InputJsonValue,
            },
            select: { id: true },
          });

          // Daily-fact upsert — overwrite-on-replay metric semantics so a
          // re-upload of the same day yields the same totals (idempotent).
          await tx.channelListingDailySnapshot.upsert({
            where: {
              companyId_listingId_businessDate: {
                companyId,
                listingId: d.listingId,
                businessDate,
              },
            },
            create: {
              companyId,
              listingId: d.listingId,
              channel: 'coupang',
              externalId: d.externalId,
              businessDate,
              sampleCount: 1,
              firstObservedAt: observedAt,
              lastObservedAt: observedAt,
              rawSnapshotId: snapshot.id,
              trafficVisitors: d.visitors,
              trafficViews: d.views,
              trafficCartAdds: d.cartAdds,
              trafficOrders: d.orders,
              trafficSalesQty: d.salesQty,
              trafficRevenue: d.revenue,
              metaJson: {
                'traffic.csv_upload': {
                  source: 'traffic_csv_upload',
                  data: {
                    fileName: file.originalname,
                    uploadedAt: observedAt.toISOString(),
                  },
                },
              } as Prisma.InputJsonValue,
            },
            update: {
              sampleCount: { increment: 1 },
              lastObservedAt: observedAt,
              rawSnapshotId: snapshot.id,
              trafficVisitors: d.visitors,
              trafficViews: d.views,
              trafficCartAdds: d.cartAdds,
              trafficOrders: d.orders,
              trafficSalesQty: d.salesQty,
              trafficRevenue: d.revenue,
            },
          });
        }

        for (const s of skippedRows) {
          await tx.channelScrapeSnapshot.create({
            data: {
              companyId,
              scrapeRunId: run.id,
              channel: 'coupang',
              source: 'traffic_csv_upload',
              pageType: 'traffic',
              matchStatus: 'unmatched',
              matchReason: s.reason,
              rawJson: s.raw as Prisma.InputJsonValue,
            },
          });
        }

        await tx.channelScrapeRun.update({
          where: { id: run.id },
          data: {
            status: 'complete',
            matchedCount: dataArr.length,
            unmatchedCount: skippedRows.length,
            finishedAt: new Date(),
          },
        });
      });
    }

    return {
      success: true,
      upserted: dataArr.length,
      skipped,
      detectedColumns: {
        productId: colProductId,
        visitors: colVisitors,
        views: colViews,
        cart: colCart,
        orders: colOrders,
        salesQty: colSalesQty,
        revenue: colRevenue,
        date: colDate,
      },
    };
  }

  /**
   * Period traffic summary — KST-anchored half-open window over
   * `ChannelListingDailySnapshot.traffic*` columns.
   *
   * `companyId` is required by the H3b multi-tenant rule (legacy code allowed
   * `undefined` here because legacy `TrafficStats.aggregate` was filtered by
   * `periodDays = 1` only). The controller passes the request company.
   */
  async getTrafficSummary(days: number, companyId: string) {
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
        where: { companyId, businessDate: { gte: start, lt: end } },
      }),
      this.prisma.channelListingDailySnapshot.aggregate({
        _sum: {
          trafficRevenue: true,
          trafficOrders: true,
          trafficSalesQty: true,
          trafficVisitors: true,
        },
        where: { companyId, businessDate: { gte: prevStart, lt: prevEnd } },
      }),
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId'],
        _sum: {
          trafficRevenue: true,
          trafficSalesQty: true,
          trafficOrders: true,
        },
        where: { companyId, businessDate: { gte: start, lt: end } },
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
        where: { id: { in: listingIds }, companyId, isDeleted: false },
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
      profitRate = revenue > 0 ? Math.round((totalNetProfit / revenue) * 1000) / 10 : 0;
      costCoverage = revenue > 0 ? Math.round((revenueWithCost / revenue) * 100) / 100 : 0;
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
      revenueChange: prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10 : 0,
      ordersChange: prevOrders > 0 ? Math.round(((orders - prevOrders) / prevOrders) * 1000) / 10 : 0,
      netProfit,
      profitRate,
      costCoverage,
    };
  }

  async getMonthlyRevenue(year: number, month: number, companyId: string) {
    // KST month boundaries via `kstDayStart` of month-first / next-month-first.
    const startUtc = new Date(Date.UTC(year, month - 1, 1));
    const endUtcExclusive = new Date(Date.UTC(year, month, 1));
    const start = kstDayStart(startUtc);
    const endExclusive = kstDayStart(endUtcExclusive);

    const [rows, listingRows] = await Promise.all([
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['businessDate'],
        where: {
          companyId,
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
          companyId,
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
            where: { id: { in: listingIds }, companyId, isDeleted: false },
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
      dailyProfitMap.set(dateKey, (dailyProfitMap.get(dateKey) ?? 0) + rowNetProfit);
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

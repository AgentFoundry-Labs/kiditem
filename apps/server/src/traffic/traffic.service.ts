import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import type { MulterFile } from '../common/types';
import { resolvePricing } from '../common/master-product-resolver';

export interface DayRevenue {
  date: string;
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
  netProfit?: number;
  profitRate?: number;
}

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

    const products = await this.prisma.product.findMany({
      where: { companyId, coupangProductId: { not: null } },
      select: { id: true, coupangProductId: true },
    });
    const productMap = new Map(
      products.map((p) => [p.coupangProductId!, p.id]),
    );

    const today = new Date().toISOString().slice(0, 10);

    const parseNum = (val: unknown): number => {
      if (val === null || val === undefined) return 0;
      const n = Number(String(val).replace(/[,%]/g, ''));
      return isNaN(n) ? 0 : n;
    };

    const aggregated = new Map<
      string,
      {
        productId: string;
        periodDays: number;
        visitors: number;
        views: number;
        cartAdds: number;
        orders: number;
        salesQty: number;
        revenue: number;
        conversionRate: number;
        date: string;
      }
    >();

    let skipped = 0;

    for (const row of rows) {
      const cpId = String(row[colProductId] || '').trim();
      if (!cpId) {
        skipped++;
        continue;
      }

      const productId = productMap.get(cpId);
      if (!productId) {
        skipped++;
        continue;
      }

      const date = colDate
        ? String(row[colDate] || today).slice(0, 10)
        : today;
      const periodDays = 7;
      const key = `${productId}::${date}::${periodDays}`;

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
          productId,
          date,
          periodDays,
          visitors,
          views,
          cartAdds,
          orders,
          salesQty,
          revenue,
          conversionRate: 0,
        });
      }
    }

    for (const d of aggregated.values()) {
      d.conversionRate =
        d.visitors > 0
          ? Math.round((d.orders / d.visitors) * 10000) / 100
          : 0;
    }

    const dataArr = [...aggregated.values()];
    if (dataArr.length > 0) {
      await this.prisma.$transaction(
        dataArr.map((d) =>
          this.prisma.trafficStats.upsert({
            where: {
              productId_date_periodDays: {
                productId: d.productId,
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

  async getTrafficSummary(days: number) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

    // 이전 동일 기간 (비교용)
    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = start;

    const [cur, prev, productRows] = await Promise.all([
      this.prisma.trafficStats.aggregate({
        _sum: { revenue: true, orders: true, salesQty: true, visitors: true, views: true, cartAdds: true },
        where: { periodDays: 1, date: { gte: start, lt: end } },
      }),
      this.prisma.trafficStats.aggregate({
        _sum: { revenue: true, orders: true, salesQty: true, visitors: true },
        where: { periodDays: 1, date: { gte: prevStart, lt: prevEnd } },
      }),
      // 기간 내 상품별 revenue/salesQty 집계 (수익 계산용)
      this.prisma.$queryRaw<{ product_id: string; revenue: number; sales_qty: number; orders_count: number }[]>`
        SELECT product_id, SUM(revenue)::int AS revenue, SUM(sales_qty)::int AS sales_qty,
               SUM(orders)::int AS orders_count
        FROM traffic_stats
        WHERE period_days = 1 AND date >= ${start} AND date < ${end}
        GROUP BY product_id
      `,
    ]);

    const revenue = cur._sum.revenue ?? 0;
    const prevRevenue = prev._sum.revenue ?? 0;
    const orders = cur._sum.orders ?? 0;
    const prevOrders = prev._sum.orders ?? 0;

    // 수익 계산 — product pricing 조회
    let netProfit: number | undefined;
    let profitRate: number | undefined;
    let costCoverage: number | undefined;

    if (productRows.length > 0) {
      const productIds = productRows.map((r) => r.product_id);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          costPrice: true,
          costCny: true,
          commissionRate: true,
          shippingCost: true,
          masterProduct: { select: { costPrice: true, commissionRate: true } },
        },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      let totalNetProfit = 0;
      let revenueWithCost = 0;

      for (const row of productRows) {
        const salesQty = Number(row.sales_qty) || 0;
        const rowRevenue = Number(row.revenue) || 0;
        if (salesQty === 0) continue;

        const prod = productMap.get(row.product_id);
        if (!prod) continue;

        const resolved = resolvePricing(prod);
        // commissionRate: Decimal(5,4) = 0.108 형식 (분수), /100 하지 않음
        const commRate = resolved.commissionRate || 0.108;
        // shippingCost는 주문 단위 고정비 — orders_count 기준으로 곱해야 과계산 방지
        const ordersCount = Number(row.orders_count) || salesQty;
        const rowNetProfit =
          rowRevenue -
          resolved.costPrice * salesQty -
          rowRevenue * commRate -
          (prod.shippingCost ? Number(prod.shippingCost) : 0) * ordersCount;

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
      salesQty: cur._sum.salesQty ?? 0,
      visitors: cur._sum.visitors ?? 0,
      views: cur._sum.views ?? 0,
      cartAdds: cur._sum.cartAdds ?? 0,
      prevRevenue,
      prevOrders,
      revenueChange: prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10 : 0,
      ordersChange: prevOrders > 0 ? Math.round(((orders - prevOrders) / prevOrders) * 1000) / 10 : 0,
      netProfit,
      profitRate,
      costCoverage,
    };
  }

  async getMonthlyRevenue(year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0); // 해당 월 마지막 날
    const endExclusive = new Date(year, month, 1);

    const [rows, productRows] = await Promise.all([
      this.prisma.trafficStats.groupBy({
        by: ['date'],
        where: {
          periodDays: 1,
          date: { gte: start, lte: end },
        },
        _sum: {
          revenue: true,
          orders: true,
          salesQty: true,
          visitors: true,
        },
        orderBy: { date: 'asc' },
      }),
      // 월간 상품별 집계 (수익 계산용)
      this.prisma.$queryRaw<{ product_id: string; date: string; revenue: number; sales_qty: number; orders_count: number }[]>`
        SELECT product_id, date::text AS date, SUM(revenue)::int AS revenue, SUM(sales_qty)::int AS sales_qty,
               SUM(orders)::int AS orders_count
        FROM traffic_stats
        WHERE period_days = 1 AND date >= ${start} AND date < ${endExclusive}
        GROUP BY product_id, date
      `,
    ]);

    // 상품 pricing 조회
    const productIds = [...new Set(productRows.map((r) => r.product_id))];
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              costPrice: true,
              costCny: true,
              commissionRate: true,
              shippingCost: true,
              masterProduct: { select: { costPrice: true, commissionRate: true } },
            },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    // 일별 netProfit 집계
    const dailyProfitMap = new Map<string, number>();
    for (const row of productRows) {
      const salesQty = Number(row.sales_qty) || 0;
      const rowRevenue = Number(row.revenue) || 0;
      if (salesQty === 0) continue;
      const prod = productMap.get(row.product_id);
      if (!prod) continue;
      const resolved = resolvePricing(prod);
      const commRate = resolved.commissionRate || 0.108;
      const ordersCount = Number(row.orders_count) || salesQty;
      const rowNetProfit =
        rowRevenue -
        resolved.costPrice * salesQty -
        rowRevenue * commRate -
        (prod.shippingCost ? Number(prod.shippingCost) : 0) * ordersCount;
      const dateKey = typeof row.date === 'string' ? row.date.slice(0, 10) : new Date(row.date).toISOString().slice(0, 10);
      dailyProfitMap.set(dateKey, (dailyProfitMap.get(dateKey) ?? 0) + rowNetProfit);
    }

    const days: DayRevenue[] = rows.map((r) => {
      const dateKey = r.date.toISOString().slice(0, 10);
      const rev = r._sum.revenue ?? 0;
      const np = Math.round(dailyProfitMap.get(dateKey) ?? 0);
      return {
        date: dateKey,
        revenue: rev,
        orders: r._sum.orders ?? 0,
        salesQty: r._sum.salesQty ?? 0,
        visitors: r._sum.visitors ?? 0,
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

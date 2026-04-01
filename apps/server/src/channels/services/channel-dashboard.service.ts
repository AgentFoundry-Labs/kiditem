import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { kstDayStart } from '../../common/kst';
import { ORDER_STATUSES, RETURN_STATUSES } from '../adapters/coupang/constants';

@Injectable()
export class ChannelDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(companyId: string): Promise<{
    todayOrders: { count: number; revenue: number };
    pendingAccept: number;
    pendingReturns: number;
    lastSyncedAt: Date | null;
  }> {
    const todayStart = kstDayStart(new Date());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [todayOrders, pendingAccept, pendingReturns, lastOrder] = await Promise.all([
      this.prisma.coupangOrder.aggregate({
        _sum: { totalPrice: true },
        _count: true,
        where: {
          companyId,
          orderedAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.coupangOrder.count({
        where: { companyId, status: ORDER_STATUSES.ACCEPT },
      }),
      this.prisma.coupangReturn.count({
        where: { companyId, receiptStatus: RETURN_STATUSES.UC },
      }),
      this.prisma.coupangOrder.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      todayOrders: {
        count: todayOrders._count,
        revenue: todayOrders._sum.totalPrice ?? 0,
      },
      pendingAccept,
      pendingReturns,
      lastSyncedAt: lastOrder?.createdAt ?? null,
    };
  }

  async getRevenueTrend(companyId: string, from: Date, to: Date): Promise<{ day: string; revenue: number; orderCount: number }[]> {
    const rows = await this.prisma.$queryRaw<
      { day: Date; revenue: number; order_count: number }[]
    >`
      SELECT
        DATE_TRUNC('day', co.ordered_at AT TIME ZONE 'Asia/Seoul') AS day,
        SUM(co.total_price)::int AS revenue,
        COUNT(*)::int AS order_count
      FROM coupang_orders co
      WHERE co.company_id = ${companyId}::uuid
        AND co.ordered_at >= ${from}
        AND co.ordered_at < ${to}
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      revenue: Number(r.revenue),
      orderCount: Number(r.order_count),
    }));
  }

  async getProductRanking(companyId: string, from: Date, to: Date): Promise<{
    sellerProductId: string;
    sellerProductName: string;
    revenue: number;
    orderCount: number;
  }[]> {
    const rows = await this.prisma.$queryRaw<
      {
        seller_product_id: string | null;
        seller_product_name: string;
        revenue: number;
        order_count: number;
      }[]
    >`
      SELECT
        coi.seller_product_id,
        coi.seller_product_name,
        SUM(coi.order_price)::int AS revenue,
        COUNT(DISTINCT co.id)::int AS order_count
      FROM coupang_order_items coi
      JOIN coupang_orders co ON co.id = coi.order_id
      WHERE co.company_id = ${companyId}::uuid
        AND co.ordered_at >= ${from}
        AND co.ordered_at < ${to}
        AND coi.seller_product_id IS NOT NULL
      GROUP BY coi.seller_product_id, coi.seller_product_name
      ORDER BY revenue DESC
      LIMIT 20
    `;

    return rows.map((r) => ({
      sellerProductId: r.seller_product_id as string,
      sellerProductName: r.seller_product_name,
      revenue: Number(r.revenue),
      orderCount: Number(r.order_count),
    }));
  }

  async getReturnSummary(companyId: string, from: Date, to: Date): Promise<{ returnCount: number; orderCount: number; returnRate: number }> {
    const [returnRows, orderRows] = await Promise.all([
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM coupang_returns
        WHERE company_id = ${companyId}::uuid
          AND requested_at >= ${from}
          AND requested_at < ${to}
      `,
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM coupang_orders
        WHERE company_id = ${companyId}::uuid
          AND ordered_at >= ${from}
          AND ordered_at < ${to}
      `,
    ]);

    const returnCount = Number(returnRows[0]?.count ?? 0);
    const orderCount = Number(orderRows[0]?.count ?? 0);
    const returnRate =
      orderCount > 0
        ? Math.round((returnCount / orderCount) * 10000) / 100
        : 0;

    return { returnCount, orderCount, returnRate };
  }

  async getReturnReasonBreakdown(companyId: string, from: Date, to: Date): Promise<{ reason: string; count: number }[]> {
    const rows = await this.prisma.$queryRaw<
      { reason: string | null; count: number }[]
    >`
      SELECT
        cancel_reason_category1 AS reason,
        COUNT(*)::int AS count
      FROM coupang_returns
      WHERE company_id = ${companyId}::uuid
        AND requested_at >= ${from}
        AND requested_at < ${to}
      GROUP BY cancel_reason_category1
      ORDER BY count DESC
    `;

    return rows.map((r) => ({
      reason: r.reason ?? '미분류',
      count: Number(r.count),
    }));
  }

  async getReturnFaultSplit(companyId: string, from: Date, to: Date): Promise<{ customer: number; vendor: number }> {
    const rows = await this.prisma.$queryRaw<
      { fault_type: string; count: number }[]
    >`
      SELECT
        fault_by_type AS fault_type,
        COUNT(*)::int AS count
      FROM coupang_returns
      WHERE company_id = ${companyId}::uuid
        AND requested_at >= ${from}
        AND requested_at < ${to}
      GROUP BY fault_by_type
    `;

    const result: Record<string, number> = {};
    for (const r of rows) {
      result[r.fault_type] = Number(r.count);
    }

    return {
      customer: result['CUSTOMER'] ?? 0,
      vendor: result['VENDOR'] ?? 0,
    };
  }
}

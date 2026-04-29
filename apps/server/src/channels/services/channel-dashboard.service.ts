import { Injectable, Logger } from '@nestjs/common';
import type { ReturnSummary } from '@kiditem/shared/return-summary';
import type {
  ChannelDashboardSummary,
  RevenueTrendPoint,
  ProductRankingRow,
  ReturnReasonRow,
  ReturnFaultSplit,
} from '@kiditem/shared/channel-dashboard';
import { PrismaService } from '../../prisma/prisma.service';
import { kstDayStart } from '../../common/kst';

/**
 * Channel dashboard response shapes — typed via `@kiditem/shared` Zod schemas
 * with `satisfies` drift guard (no local interfaces).
 *
 * Service invariants (must be preserved by future edits):
 * - revenue = SUM(oli.total_price), never SUM(o.total_price).
 * - companyId is threaded from `@CurrentCompany()` and required on every read.
 * - Time windows are half-open: `gte` / `lt` only, never `lte`.
 * - `ChannelListing.updatedAt` ("lastModifiedAt") is bumped on any edit, not
 *   only sync ops — do not present it as "last synced at".
 * - `_count: true` in Prisma returns a flat `number` (no wrapper object).
 * - `OrderReturn.faultBy` is `VarChar(20)` and is currently `CUSTOMER` /
 *   `VENDOR` only; unknown values must be dropped before persistence.
 * - returnRate has a known limitation: past-period orders' returns land in
 *   the current period numerator. The fix is to JOIN
 *   `OrderReturn.orderId → Order.orderedAt` (tracked but not implemented here).
 */

@Injectable()
export class ChannelDashboardService {
  private readonly logger = new Logger(ChannelDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(companyId: string): Promise<ChannelDashboardSummary> {
    const todayStart = kstDayStart(new Date());
    const [todayOrders, pendingAccept, pendingReturns, lastSync] = await Promise.all([
      this.prisma.order.aggregate({
        where: { companyId, orderedAt: { gte: todayStart } },
        _count: { id: true },
        _sum: { totalPrice: true },
      }),
      this.prisma.order.count({
        where: { companyId, status: 'accept_wait' },
      }),
      this.prisma.orderReturn.count({
        where: { companyId, status: 'return_request' },
      }),
      this.prisma.channelListing.findFirst({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);
    return {
      todayOrders: {
        count: todayOrders._count.id,
        revenue: todayOrders._sum.totalPrice ?? 0,
      },
      pendingAccept,
      pendingReturns,
      lastModifiedAt: lastSync?.updatedAt ?? null,
    } satisfies ChannelDashboardSummary;
  }

  async getRevenueTrend(
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<RevenueTrendPoint[]> {
    type Row = { day: Date; revenue: bigint | null; orderCount: bigint };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT DATE_TRUNC('day', o.ordered_at AT TIME ZONE 'Asia/Seoul')::date AS day,
             SUM(oli.total_price)::bigint AS revenue,
             COUNT(DISTINCT o.id)::bigint AS "orderCount"
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      WHERE o.company_id = ${companyId}::uuid
        AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({
      day: r.day.toISOString().split('T')[0],
      revenue: Number(r.revenue ?? 0n),
      orderCount: Number(r.orderCount),
    }) satisfies RevenueTrendPoint);
  }

  async getProductRanking(
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<ProductRankingRow[]> {
    type Row = {
      sellerProductId: string;
      sellerProductName: string;
      revenue: bigint | null;
      orderCount: bigint;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT cl.external_id AS "sellerProductId",
             mp.name AS "sellerProductName",
             SUM(oli.total_price)::bigint AS revenue,
             COUNT(DISTINCT o.id)::bigint AS "orderCount"
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      JOIN channel_listings cl ON cl.id = o.listing_id
      JOIN master_products mp ON mp.id = cl.master_id
      WHERE o.company_id = ${companyId}::uuid
        AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
        AND o.listing_id IS NOT NULL
      GROUP BY cl.external_id, mp.name
      ORDER BY revenue DESC
      LIMIT 10
    `;
    return rows.map((r) => ({
      sellerProductId: r.sellerProductId,
      sellerProductName: r.sellerProductName,
      revenue: Number(r.revenue ?? 0n),
      orderCount: Number(r.orderCount),
    }) satisfies ProductRankingRow);
  }

  async getReturnSummary(
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnSummary> {
    const startedAt = Date.now();

    const [orderCount, returnCount, orphanReturnCount] = await Promise.all([
      // 분모: 이 기간 내 주문 수
      this.prisma.order.count({
        where: {
          companyId,
          orderedAt: { gte: from, lt: to },
        },
      }),
      // 분자: 이 기간 내 주문 중 return 된 건 (INNER JOIN + 2-hop IDOR)
      this.prisma.orderReturn.count({
        where: {
          companyId,
          order: {
            companyId,                                  // 2-hop defense-in-depth
            orderedAt: { gte: from, lt: to },
          },
        },
      }),
      // Side metric: orphan (orderId NULL) requestedAt ∈ period
      this.prisma.orderReturn.count({
        where: {
          companyId,
          orderId: null,
          requestedAt: { gte: from, lt: to },
        },
      }),
    ]);

    const returnRate = orderCount === 0 ? 0 : returnCount / orderCount;

    const result = {
      orderCount,
      returnCount,
      returnRate,
      orphanReturnCount,
    } satisfies ReturnSummary;

    this.logger.log({
      msg: 'channel-dashboard.getReturnSummary',
      companyId,
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount,
      returnCount,
      returnRate,
      orphanReturnCount,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }

  async getReturnReasonBreakdown(
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnReasonRow[]> {
    const groups = await this.prisma.orderReturn.groupBy({
      by: ['reason'],
      _count: true,
      where: { companyId, requestedAt: { gte: from, lt: to } },
    });
    // R-12 flat _count: Prisma returns `_count: number` for flat form.
    return groups.map((g) => ({ reason: g.reason, count: g._count }) satisfies ReturnReasonRow);
  }

  async getReturnFaultSplit(
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnFaultSplit> {
    const groups = await this.prisma.orderReturn.groupBy({
      by: ['faultBy'],
      _count: true,
      where: { companyId, requestedAt: { gte: from, lt: to } },
    });
    // C-11 unknown faultBy drop: faultBy is VarChar(20) — only CUSTOMER/VENDOR are reported.
    const find = (key: string) => groups.find((g) => g.faultBy === key)?._count ?? 0;
    return { customer: find('CUSTOMER'), vendor: find('VENDOR') } satisfies ReturnFaultSplit;
  }
}

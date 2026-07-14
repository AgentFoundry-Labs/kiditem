import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  RocketRevenueRepositoryPort,
  RocketRevenueMetrics,
  RocketDailyRow,
  RocketOrderRow,
  RocketOrderItem,
} from '../../../application/port/out/repository/rocket-revenue.repository.port';

/**
 * Coupang Rocket(공급사 발주) revenue read model.
 *
 * Reads confirmed `rocket_purchase_orders` (발주금액=공급가, 발주일 KST 기준 일별
 * fact). The dashboard surfaces this as a separate revenue lane from Wing.
 *
 * Multi-tenant: every read binds `organizationId`. `business_date` is `@db.Date`;
 * callers pass UTC-midnight `Date` instants that compare cleanly against the
 * calendar-date column.
 */
@Injectable()
export class RocketRevenueRepositoryAdapter implements RocketRevenueRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestDataDate(organizationId: string): Promise<Date | null> {
    const agg = await this.prisma.rocketPurchaseOrder.aggregate({
      where: {
        organizationId,
        ...confirmedPurchaseOrderWhere(),
      },
      _max: { businessDate: true },
    });
    return agg._max.businessDate ?? null;
  }

  async aggregateRevenue(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RocketRevenueMetrics> {
    const agg = await this.prisma.rocketPurchaseOrder.aggregate({
      where: {
        organizationId,
        businessDate: { gte: from, lt: to },
        ...confirmedPurchaseOrderWhere(),
      },
      _sum: { orderAmount: true, orderQty: true },
      _max: { updatedAt: true },
      _count: { _all: true },
    });

    return {
      revenue: agg._sum.orderAmount ?? 0,
      poCount: agg._count._all ?? 0,
      itemQty: agg._sum.orderQty ?? 0,
      hasData: (agg._count._all ?? 0) > 0,
      lastObservedAt: agg._max.updatedAt ?? null,
    };
  }

  async fetchDaily(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<RocketDailyRow[]> {
    const rows = await this.prisma.rocketPurchaseOrder.groupBy({
      by: ['businessDate'],
      where: {
        organizationId,
        businessDate: until ? { gte: since, lt: until } : { gte: since },
        ...confirmedPurchaseOrderWhere(),
      },
      _sum: { orderAmount: true, orderQty: true },
      _count: { _all: true },
      orderBy: { businessDate: 'asc' },
    });

    return rows.map((r) => ({
      date: r.businessDate.toISOString().slice(0, 10),
      revenue: r._sum.orderAmount ?? 0,
      poCount: r._count._all ?? 0,
      itemQty: r._sum.orderQty ?? 0,
    }));
  }

  private static readonly ORDER_SELECT = {
    poSeq: true,
    businessDate: true,
    orderedAt: true,
    status: true,
    vendorName: true,
    centerName: true,
    firstSkuName: true,
    skuCount: true,
    orderQty: true,
    orderAmount: true,
    items: true,
  } as const;

  async fetchOrdersForDate(organizationId: string, date: Date): Promise<RocketOrderRow[]> {
    const dayEnd = new Date(date.getTime() + 24 * 3600 * 1000);
    const rows = await this.prisma.rocketPurchaseOrder.findMany({
      where: {
        organizationId,
        businessDate: { gte: date, lt: dayEnd },
        ...confirmedPurchaseOrderWhere(),
      },
      orderBy: { orderAmount: 'desc' },
      select: RocketRevenueRepositoryAdapter.ORDER_SELECT,
    });
    return rows.map((r) => mapOrderRow(r));
  }

  async fetchOrders(
    organizationId: string,
    from: Date,
    to: Date,
    status?: string,
  ): Promise<RocketOrderRow[]> {
    const rows = await this.prisma.rocketPurchaseOrder.findMany({
      where: {
        organizationId,
        businessDate: { gte: from, lt: to },
        ...(status ? { status } : {}),
      },
      orderBy: [{ businessDate: 'desc' }, { orderAmount: 'desc' }],
      select: RocketRevenueRepositoryAdapter.ORDER_SELECT,
    });
    return rows.map((r) => mapOrderRow(r));
  }
}

function confirmedPurchaseOrderWhere(): Prisma.RocketPurchaseOrderWhereInput {
  return {
    OR: [{ status: 'PA' }, { status: { contains: '발주확정' } }],
  };
}

function mapOrderRow(r: {
  poSeq: number;
  businessDate: Date;
  orderedAt: Date;
  status: string | null;
  vendorName: string | null;
  centerName: string | null;
  firstSkuName: string | null;
  skuCount: number;
  orderQty: number;
  orderAmount: number;
  items: unknown;
}): RocketOrderRow {
  const items = Array.isArray(r.items) ? (r.items as unknown as RocketOrderItem[]) : [];
  return {
    poSeq: r.poSeq,
    businessDate: r.businessDate.toISOString().slice(0, 10),
    orderedAt: r.orderedAt.toISOString(),
    expectedInboundDate: resolveExpectedInboundDate(items),
    status: r.status,
    vendorName: r.vendorName,
    centerName: r.centerName,
    firstSkuName: r.firstSkuName,
    skuCount: r.skuCount,
    orderQty: r.orderQty,
    orderAmount: r.orderAmount,
    items,
  };
}

function resolveExpectedInboundDate(items: RocketOrderItem[]): string | null {
  for (const item of items) {
    if (item.expectedInboundDate) return item.expectedInboundDate;
  }
  return null;
}

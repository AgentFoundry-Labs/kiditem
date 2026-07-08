import { Injectable } from '@nestjs/common';
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
 * Reads `rocket_supply_daily_snapshots` (발주금액=공급가, 입고예정일 KST 기준 일별
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
    const agg = await this.prisma.rocketSupplyDailySnapshot.aggregate({
      where: {
        organizationId,
        OR: [
          { revenueKrw: { gt: 0 } },
          { poCount: { gt: 0 } },
          { itemQty: { gt: 0 } },
        ],
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
    const agg = await this.prisma.rocketSupplyDailySnapshot.aggregate({
      where: {
        organizationId,
        businessDate: { gte: from, lt: to },
      },
      _sum: { revenueKrw: true, poCount: true, itemQty: true },
      _max: { updatedAt: true },
      _count: { _all: true },
    });

    return {
      revenue: agg._sum.revenueKrw ?? 0,
      poCount: agg._sum.poCount ?? 0,
      itemQty: agg._sum.itemQty ?? 0,
      hasData: (agg._count._all ?? 0) > 0,
      lastObservedAt: agg._max.updatedAt ?? null,
    };
  }

  async fetchDaily(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<RocketDailyRow[]> {
    const rows = await this.prisma.rocketSupplyDailySnapshot.findMany({
      where: {
        organizationId,
        businessDate: until ? { gte: since, lt: until } : { gte: since },
      },
      orderBy: { businessDate: 'asc' },
      select: { businessDate: true, revenueKrw: true, poCount: true, itemQty: true },
    });

    return rows.map((r) => ({
      date: r.businessDate.toISOString().slice(0, 10),
      revenue: r.revenueKrw,
      poCount: r.poCount,
      itemQty: r.itemQty,
    }));
  }

  private static readonly ORDER_SELECT = {
    poSeq: true,
    businessDate: true,
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
      where: { organizationId, businessDate: { gte: date, lt: dayEnd } },
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

function mapOrderRow(r: {
  poSeq: number;
  businessDate: Date;
  status: string | null;
  vendorName: string | null;
  centerName: string | null;
  firstSkuName: string | null;
  skuCount: number;
  orderQty: number;
  orderAmount: number;
  items: unknown;
}): RocketOrderRow {
  return {
    poSeq: r.poSeq,
    businessDate: r.businessDate.toISOString().slice(0, 10),
    status: r.status,
    vendorName: r.vendorName,
    centerName: r.centerName,
    firstSkuName: r.firstSkuName,
    skuCount: r.skuCount,
    orderQty: r.orderQty,
    orderAmount: r.orderAmount,
    items: Array.isArray(r.items) ? (r.items as unknown as RocketOrderItem[]) : [],
  };
}

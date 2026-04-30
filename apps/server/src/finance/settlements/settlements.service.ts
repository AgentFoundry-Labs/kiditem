import { Injectable, BadRequestException } from '@nestjs/common';
import type {
  SettlementReconcileDetail,
  SettlementReconcileResponse,
} from '@kiditem/shared/settlements';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../common/per-listing-profit';
import { kstMonthStart } from '../../common/kst';
import { CreateSettlementDto, UpdateSettlementDto } from './dto';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveWindow(period: string) {
    const [year, month] = period.split('-').map(Number);
    return {
      year,
      month,
      from: kstMonthStart(year, month),
      to: kstMonthStart(year, month + 1),
    };
  }

  async findAll(companyId: string, period?: string) {
    const periodFilter =
      period?.length === 7
        ? { period }
        : period?.length === 4
          ? { period: { startsWith: period } }
          : undefined;

    return this.prisma.settlement.findMany({
      where: { companyId, ...periodFilter },
      orderBy: { period: 'desc' },
    });
  }

  async create(companyId: string, dto: CreateSettlementDto) {
    return this.prisma.settlement.create({
      data: {
        companyId,
        period: dto.period,
        expectedAmount: dto.expectedAmount,
        commission: dto.commission,
        shippingFee: dto.shippingFee,
        orderCount: dto.orderCount,
        returnCount: dto.returnCount,
      },
    });
  }

  async reconcile(companyId: string, period: string) {
    const { from, to } = this.resolveWindow(period);

    // 1. Build live metrics and compare them to the order aggregate side.
    //    SUM(total_price)::bigint — 단일 월 매출이 int32 (~21억 KRW) 초과 가능성 (대형 셀러).
    //    bigint → Number() 로 안전 변환 (2^53 이하 보장).
    const [metrics, rows] = await Promise.all([
      buildPerListingMetrics(this.prisma, companyId, from, to),
      this.prisma.$queryRaw<
        Array<{
          listing_id: string;
          total_price: bigint;
          order_count: bigint;
        }>
      >`
        SELECT clo.listing_id AS listing_id,
               SUM(oli.total_price)::bigint AS total_price,
               COUNT(DISTINCT o.id)::bigint  AS order_count
          FROM order_line_items oli
          JOIN channel_listing_options clo ON oli.listing_option_id = clo.id
          JOIN orders o ON oli.order_id = o.id
         WHERE o.company_id = ${companyId}::uuid
           AND o.ordered_at >= ${from}
           AND o.ordered_at <  ${to}
           AND o.status NOT IN ('cancelled', 'returned', 'refunded')
         GROUP BY clo.listing_id
      `,
    ]);
    const orderMap = new Map<string, { total: number; count: number }>(
      rows.map((r) => [r.listing_id, { total: Number(r.total_price), count: Number(r.order_count) }]),
    );

    // 2. Match live finance metrics with order aggregates by listingId.
    let totalPlRevenue = 0;
    let totalOrderRevenue = 0;
    let matchedCount = 0;
    let mismatchCount = 0;

    const details = metrics.map((metric) => {
      const od = orderMap.get(metric.listingId) ?? { total: 0, count: 0 };
      const revenueDiff = metric.revenue - od.total;
      const absDiff = Math.abs(revenueDiff);
      const status: 'matched' | 'minor_diff' | 'mismatch' =
        absDiff <= 100 ? 'matched' : absDiff <= 1000 ? 'minor_diff' : 'mismatch';

      totalPlRevenue += metric.revenue;
      totalOrderRevenue += od.total;
      if (status === 'matched') matchedCount++;
      else mismatchCount++;

      return {
        listingId: metric.listingId,
        externalId: metric.externalId,
        channelName: metric.channelName,
        masterCode: metric.masterCode,
        masterName: metric.masterName,
        plRevenue: metric.revenue,
        plCommission: metric.commission,
        plNetProfit: metric.netProfit,
        plOrderCount: metric.orderCount,
        orderTotal: od.total,
        orderCount: od.count,
        revenueDiff,
        isMatched: status === 'matched',
        status,
      } satisfies SettlementReconcileDetail;
    });

    const productCount = details.length;
    const matchRate = productCount > 0
      ? Math.round((matchedCount / productCount) * 100)
      : 0;

    return {
      success: true,
      period,
      summary: {
        totalPlRevenue,
        totalOrderRevenue,
        totalCommission: metrics.reduce((sum, metric) => sum + metric.commission, 0),
        totalShipping: metrics.reduce((sum, metric) => sum + metric.shippingCost, 0),
        revenueDifference: totalPlRevenue - totalOrderRevenue,
        productCount,
        orderCount: rows.reduce((s, r) => s + Number(r.order_count), 0),
        matchedCount,
        mismatchCount,
        matchRate,
      },
      details,
    } satisfies SettlementReconcileResponse;
  }

  async update(id: string, companyId: string, dto: UpdateSettlementDto) {
    const existing = await this.prisma.settlement.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new BadRequestException('정산 내역을 찾을 수 없습니다');
    }

    return this.prisma.settlement.update({
      where: { id },
      data: {
        ...(dto.actualAmount !== undefined && { actualAmount: dto.actualAmount }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }
}

import { Injectable, BadRequestException, Optional, Inject } from '@nestjs/common';
import type {
  SettlementReconcileDetail,
  SettlementReconcileResponse,
} from '@kiditem/shared/settlements';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../common/per-listing-profit';
import { kstMonthStart } from '../../common/kst';
import {
  FINANCE_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../application/port/out/operation-alert.port';
import { CreateSettlementDto, UpdateSettlementDto } from './dto';

const FINANCE_ALERT_HREF = '/sales-analysis';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(FINANCE_OPERATION_ALERT_PORT)
    private readonly operationAlerts?: OperationAlertPort,
  ) {}

  private resolveWindow(period: string) {
    const [year, month] = period.split('-').map(Number);
    return {
      year,
      month,
      from: kstMonthStart(year, month),
      to: kstMonthStart(year, month + 1),
    };
  }

  async findAll(organizationId: string, period?: string) {
    const periodFilter =
      period?.length === 7
        ? { period }
        : period?.length === 4
          ? { period: { startsWith: period } }
          : undefined;

    return this.prisma.settlement.findMany({
      where: { organizationId, ...periodFilter },
      orderBy: { period: 'desc' },
    });
  }

  async create(organizationId: string, dto: CreateSettlementDto) {
    return this.prisma.settlement.create({
      data: {
        organizationId,
        period: dto.period,
        expectedAmount: dto.expectedAmount,
        commission: dto.commission,
        shippingFee: dto.shippingFee,
        orderCount: dto.orderCount,
        returnCount: dto.returnCount,
      },
    });
  }

  async reconcile(organizationId: string, period: string, actorUserId: string | null = null) {
    const operationKey = `settlements-reconcile:${period}`;
    await this.operationAlerts?.start({
      organizationId,
      operationKey,
      type: 'settlements_reconcile',
      title: '정산 대사 실행',
      sourceType: 'finance_reconcile',
      sourceId: period,
      actorUserId,
      href: FINANCE_ALERT_HREF,
      message: `${period} 정산 대사를 실행하고 있습니다.`,
      progress: 0,
      metadata: { period },
    });

    try {
      const { from, to } = this.resolveWindow(period);

      // 1. Build live metrics and compare them to the order aggregate side.
      //    SUM(total_price)::bigint — 단일 월 매출이 int32 (~21억 KRW) 초과 가능성 (대형 셀러).
      //    bigint → Number() 로 안전 변환 (2^53 이하 보장).
      const [metrics, rows] = await Promise.all([
        buildPerListingMetrics(this.prisma, organizationId, from, to),
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
           WHERE o.organization_id = ${organizationId}::uuid
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

      const response = {
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
      await this.operationAlerts?.succeed(organizationId, operationKey, {
        href: FINANCE_ALERT_HREF,
        message: `${period} 정산 대사 완료: 매칭 ${matchedCount}건, 불일치 ${mismatchCount}건`,
        severity: mismatchCount > 0 ? 'warning' : 'info',
        metadata: {
          period,
          productCount,
          matchedCount,
          mismatchCount,
          matchRate,
          totalPlRevenue,
          totalOrderRevenue,
        },
      });
      return response;
    } catch (err) {
      await this.operationAlerts?.fail(organizationId, operationKey, {
        href: FINANCE_ALERT_HREF,
        message: `${period} 정산 대사 실패: ${errorMessage(err)}`,
        metadata: { period, error: errorMessage(err) },
      });
      throw err;
    }
  }

  async update(id: string, organizationId: string, dto: UpdateSettlementDto) {
    const existing = await this.prisma.settlement.findFirst({
      where: { id, organizationId },
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

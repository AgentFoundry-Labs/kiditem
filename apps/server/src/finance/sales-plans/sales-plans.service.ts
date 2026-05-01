import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../common/per-listing-profit';
import { kstMonthStart } from '../../common/kst';
import { CreateSalesPlanDto, UpdateSalesPlanDto } from './dto';

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

@Injectable()
export class SalesPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveWindow(period: string) {
    const [year, month] = period.split('-').map(Number);
    return {
      from: kstMonthStart(year, month),
      to: kstMonthStart(year, month + 1),
    };
  }

  async findAll(organizationId: string) {
    return this.prisma.salesPlan.findMany({
      where: { organizationId },
      orderBy: { period: 'desc' },
    });
  }

  async create(organizationId: string, dto: CreateSalesPlanDto) {
    const existing = await this.prisma.salesPlan.findFirst({
      where: { organizationId, period: dto.period },
    });

    if (existing) {
      throw new BadRequestException(`해당 기간(${dto.period})의 판매 계획이 이미 존재합니다`);
    }

    return this.prisma.salesPlan.create({
      data: {
        organizationId,
        period: dto.period,
        targetRevenue: dto.targetRevenue ?? 0,
        targetOrders: dto.targetOrders ?? 0,
        targetProfit: dto.targetProfit ?? 0,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateSalesPlanDto) {
    const existing = await this.prisma.salesPlan.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }

    return this.prisma.salesPlan.update({
      where: { id },
      data: dto,
    });
  }

  async syncActuals(id: string, organizationId: string) {
    const plan = await this.prisma.salesPlan.findFirst({
      where: { id, organizationId },
    });
    if (!plan) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }

    const { from, to } = this.resolveWindow(plan.period);

    const [orderAgg, metrics] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          organizationId,
          orderedAt: {
            gte: from,
            lt: to,
          },
          status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      buildPerListingMetrics(this.prisma, organizationId, from, to),
    ]);
    const actualProfit = metrics.reduce((sum, metric) => sum + metric.netProfit, 0);

    return this.prisma.salesPlan.update({
      where: { id },
      data: {
        actualRevenue: orderAgg._sum.totalPrice ?? 0,
        actualOrders: orderAgg._count.id ?? 0,
        actualProfit,
      },
    });
  }

  async delete(id: string, organizationId: string) {
    const existing = await this.prisma.salesPlan.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }

    await this.prisma.salesPlan.delete({ where: { id } });
    return { ok: true };
  }
}

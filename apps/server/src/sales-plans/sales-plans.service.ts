import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { kstMonthStart } from '../common/kst';
import { CreateSalesPlanDto, UpdateSalesPlanDto } from './dto';

@Injectable()
export class SalesPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.salesPlan.findMany({
      where: { companyId },
      orderBy: { period: 'desc' },
    });
  }

  async create(companyId: string, dto: CreateSalesPlanDto) {
    const existing = await this.prisma.salesPlan.findUnique({
      where: {
        companyId_period: {
          companyId,
          period: dto.period,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`해당 기간(${dto.period})의 판매 계획이 이미 존재합니다`);
    }

    return this.prisma.salesPlan.create({
      data: {
        companyId,
        period: dto.period,
        targetRevenue: dto.targetRevenue ?? 0,
        targetOrders: dto.targetOrders ?? 0,
        targetProfit: dto.targetProfit ?? 0,
        notes: dto.notes,
      },
    });
  }

  async update(id: string, companyId: string, dto: UpdateSalesPlanDto) {
    const existing = await this.prisma.salesPlan.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }

    return this.prisma.salesPlan.update({
      where: { id },
      data: dto,
    });
  }

  async syncActuals(id: string, companyId: string) {
    const plan = await this.prisma.salesPlan.findFirst({
      where: { id, companyId },
    });
    if (!plan) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }

    const [year, month] = plan.period.split('-').map(Number);
    const periodStart = kstMonthStart(year, month);
    const periodEnd = kstMonthStart(year, month + 1);

    // Aggregate actuals from Order (KST month boundary)
    const orderAgg = await this.prisma.order.aggregate({
      where: {
        companyId,
        orderedAt: {
          gte: periodStart,
          lt: periodEnd,
        },
        status: { notIn: ['cancelled', 'returned'] },
      },
      _sum: { totalPrice: true },
      _count: { id: true },
    });

    // Aggregate actuals from ProfitLoss
    const plAgg = await this.prisma.profitLoss.aggregate({
      where: {
        companyId,
        year,
        month,
      },
      _sum: { netProfit: true },
    });

    return this.prisma.salesPlan.update({
      where: { id },
      data: {
        actualRevenue: orderAgg._sum.totalPrice ?? 0,
        actualOrders: orderAgg._count.id ?? 0,
        actualProfit: plAgg._sum.netProfit ?? 0,
      },
    });
  }

  async delete(id: string, companyId: string) {
    const existing = await this.prisma.salesPlan.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }

    await this.prisma.salesPlan.delete({ where: { id } });
    return { ok: true };
  }
}

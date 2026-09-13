import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SalesPlanActuals, SalesPlanView } from '@kiditem/shared/finance';
import { PrismaService } from '../../prisma/prisma.service';
import {
  profitWindowBasis,
  profitWindowTotals,
  readProfitWindowFacts,
} from '../../common/per-listing-profit';
import { kstMonthStart } from '../../common/kst';
import { CreateSalesPlanDto, UpdateSalesPlanDto } from './dto';

const PLAN_TARGET_SELECT = {
  id: true,
  period: true,
  targetRevenue: true,
  targetOrders: true,
  targetProfit: true,
  notes: true,
} satisfies Prisma.SalesPlanSelect;

type PlanTargets = Prisma.SalesPlanGetPayload<{ select: typeof PLAN_TARGET_SELECT }>;

const MONTH_PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Sales plans are operator targets; their actuals are the month's collected
 * order lines, read live with the observation time and basis behind them.
 * Actuals are never written back: a stored default of 0 cannot say whether a
 * month sold nothing or was never collected.
 */
@Injectable()
export class SalesPlansService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(organizationId: string): Promise<SalesPlanView[]> {
    const plans = await this.prisma.salesPlan.findMany({
      where: { organizationId },
      orderBy: { period: 'desc' },
      select: PLAN_TARGET_SELECT,
    });
    // One snapshot per month, read one at a time so a long plan list does not
    // hold several interactive transactions open together.
    const views: SalesPlanView[] = [];
    for (const plan of plans) views.push(await this.toView(organizationId, plan));
    return views;
  }

  async create(organizationId: string, dto: CreateSalesPlanDto): Promise<SalesPlanView> {
    const existing = await this.prisma.salesPlan.findFirst({
      where: { organizationId, period: dto.period },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(`해당 기간(${dto.period})의 판매 계획이 이미 존재합니다`);
    }

    const plan = await this.prisma.salesPlan.create({
      data: {
        organizationId,
        period: dto.period,
        targetRevenue: dto.targetRevenue ?? 0,
        targetOrders: dto.targetOrders ?? 0,
        targetProfit: dto.targetProfit ?? 0,
        notes: dto.notes,
      },
      select: PLAN_TARGET_SELECT,
    });
    return this.toView(organizationId, plan);
  }

  async update(id: string, organizationId: string, dto: UpdateSalesPlanDto): Promise<SalesPlanView> {
    const existing = await this.prisma.salesPlan.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }

    const plan = await this.prisma.salesPlan.update({
      where: { id },
      data: {
        period: dto.period,
        targetRevenue: dto.targetRevenue,
        targetOrders: dto.targetOrders,
        targetProfit: dto.targetProfit,
        notes: dto.notes,
      },
      select: PLAN_TARGET_SELECT,
    });
    return this.toView(organizationId, plan);
  }

  /** Re-reads the plan's live actuals; nothing is stored. */
  async syncActuals(id: string, organizationId: string): Promise<SalesPlanView> {
    const plan = await this.prisma.salesPlan.findFirst({
      where: { id, organizationId },
      select: PLAN_TARGET_SELECT,
    });
    if (!plan) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }
    return this.toView(organizationId, plan);
  }

  async delete(id: string, organizationId: string) {
    const existing = await this.prisma.salesPlan.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('판매 계획을 찾을 수 없습니다');
    }

    await this.prisma.salesPlan.delete({ where: { id } });
    return { ok: true };
  }

  private async toView(organizationId: string, plan: PlanTargets): Promise<SalesPlanView> {
    return {
      id: plan.id,
      period: plan.period,
      targetRevenue: plan.targetRevenue,
      targetOrders: plan.targetOrders,
      targetProfit: plan.targetProfit,
      notes: plan.notes,
      actuals: await this.readActuals(organizationId, plan.period),
    } satisfies SalesPlanView;
  }

  private async readActuals(organizationId: string, period: string): Promise<SalesPlanActuals | null> {
    const match = MONTH_PERIOD.exec(period);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const facts = await this.prisma.$transaction(
      (tx) => readProfitWindowFacts(tx, organizationId, kstMonthStart(year, month), kstMonthStart(year, month + 1)),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const totals = profitWindowTotals(facts);
    return {
      revenue: totals.revenue,
      orderCount: totals.orderCount,
      netProfit: totals.netProfit,
      observedAt: facts.orderWindow.observedAt,
      basis: profitWindowBasis(facts),
    } satisfies SalesPlanActuals;
  }
}

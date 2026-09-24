import { AI_LISTING_CONTENT_QUERY_PORT, type ListingContentQueryPort } from '../../../../content/application/port/in/workspace/listing-content-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SalesPlanActuals, SalesPlanView } from '@kiditem/shared/finance';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  profitWindowBasis,
  profitWindowTotals,
  readProfitWindowFacts,
  resolveFinanceWindow,
} from '../../../../common/per-listing-profit';
import { kstMonthWindow } from '../../../../common/kst';
import { CreateSalesPlanDto, UpdateSalesPlanDto } from '../../../adapter/in/web/sales-plan/dto';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';

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

/** Percent of a target reached; a zero target or an unavailable actual has no rate. */
function achievementRate(actual: number | null | undefined, target: number): number | null {
  if (actual === null || actual === undefined || target === 0) return null;
  return Math.round((actual / target) * 100);
}

/**
 * Sales plans are operator targets; their actuals are the month's collected
 * order lines over its KST business days closed at `now` (ADR-0001), read live
 * with the observation time and basis behind them. Actuals are never written
 * back: a stored default of 0 cannot say whether a month sold nothing or was
 * never collected.
 */
@Injectable()
export class SalesPlansService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    @Inject(AI_LISTING_CONTENT_QUERY_PORT) private readonly listingContent: ListingContentQueryPort,
  ) {}

  async findAll(organizationId: string, now: Date): Promise<SalesPlanView[]> {
    const plans = await this.prisma.salesPlan.findMany({
      where: { organizationId },
      orderBy: { period: 'desc' },
      select: PLAN_TARGET_SELECT,
    });
    // One snapshot per month, read one at a time so a long plan list does not
    // hold several interactive transactions open together.
    const views: SalesPlanView[] = [];
    for (const plan of plans) views.push(await this.toView(organizationId, plan, now));
    return views;
  }

  async create(organizationId: string, dto: CreateSalesPlanDto, now: Date): Promise<SalesPlanView> {
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
    return this.toView(organizationId, plan, now);
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateSalesPlanDto,
    now: Date,
  ): Promise<SalesPlanView> {
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
    return this.toView(organizationId, plan, now);
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

  private async toView(organizationId: string, plan: PlanTargets, now: Date): Promise<SalesPlanView> {
    const actuals = await this.readActuals(organizationId, plan.period, now);
    return {
      id: plan.id,
      period: plan.period,
      targetRevenue: plan.targetRevenue,
      targetOrders: plan.targetOrders,
      targetProfit: plan.targetProfit,
      notes: plan.notes,
      actuals,
      achievement: {
        revenue: achievementRate(actuals?.revenue, plan.targetRevenue),
        orders: achievementRate(actuals?.orderCount, plan.targetOrders),
        profit: achievementRate(actuals?.netProfit, plan.targetProfit),
      },
    } satisfies SalesPlanView;
  }

  private async readActuals(
    organizationId: string,
    period: string,
    now: Date,
  ): Promise<SalesPlanActuals | null> {
    const match = MONTH_PERIOD.exec(period);
    if (!match) return null;
    const window = resolveFinanceWindow(kstMonthWindow(Number(match[1]), Number(match[2])), now);
    const facts = await this.prisma.$transaction(
      (tx) => readProfitWindowFacts(
        tx,
        organizationId,
        window,
        this.inventoryTransactionalRead, { listings: this.channelListings, recipes: this.channelRecipes, accounts: this.channelAccounts, content: this.listingContent }
      ),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const totals = profitWindowTotals(facts);
    return {
      revenue: totals.revenue,
      orderCount: totals.orderCount,
      netProfit: totals.netProfit,
      // A month with no closed day was not observed at all.
      observedAt: facts.orderWindow.requestedDates.length === 0 ? null : facts.orderWindow.observedAt,
      basis: profitWindowBasis(facts),
    } satisfies SalesPlanActuals;
  }
}

import { AI_LISTING_CONTENT_QUERY_PORT, type ListingContentQueryPort } from '../../content/application/port/in/workspace/listing-content-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../channels/application/port/in/channel-option-recipe.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../channels/application/port/in/account/channel-account.port';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PLData, ProfitLossResponse } from '@kiditem/shared/finance';
import { PrismaService } from '../../prisma/prisma.service';
import { kstMonthWindow } from '../../common/kst';
import {
  perListingProfitRows,
  profitWindowBasis,
  profitWindowTotals,
  readProfitWindowFacts,
  resolveFinanceWindow,
} from '../../common/per-listing-profit';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../products/application/port/in/product-transactional-read.port';

/**
 * Live profit and loss for one KST month.
 *
 * The month is evaluated over its KST business days closed at `now`: an ended
 * month keeps every day, the month containing today keeps the days through
 * yesterday, and a month with no closed day evaluates nothing (ADR-0001).
 * Rows, totals and the basis behind them come from one Repeatable Read
 * snapshot of the owner readers composed in `common/per-listing-profit`. A
 * row or total whose inputs were not all measured publishes `null`
 * (ADR-0006). Returns have no owner publication, so a row's return count is
 * `null`, never zero.
 */
@Injectable()
export class ProfitLossService {
  private readonly logger = new Logger(ProfitLossService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    @Inject(AI_LISTING_CONTENT_QUERY_PORT) private readonly listingContent: ListingContentQueryPort,
  ) {}

  async findAll(
    organizationId: string,
    year: number,
    month: number,
    now: Date,
  ): Promise<ProfitLossResponse> {
    const startedAt = Date.now();
    const window = resolveFinanceWindow(kstMonthWindow(year, month), now);

    const facts = await this.prisma.$transaction(
      (tx) => readProfitWindowFacts(
        tx,
        organizationId,
        window,
        this.inventoryTransactionalRead, { listings: this.channelListings, recipes: this.channelRecipes, accounts: this.channelAccounts, content: this.listingContent }
      ),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const rows = perListingProfitRows(facts).map((m) => ({
      listingId: m.listingId,
      externalId: m.externalId,
      channelName: m.channelName,
      masterId: m.masterId,
      masterCode: m.masterCode,
      masterName: m.masterName,
      category: m.category,
      grade: m.grade,
      thumbnailUrl: m.thumbnailUrl,
      revenue: m.revenue,
      cogs: m.costOfGoods,
      commission: m.commission,
      shippingCost: m.shippingCost,
      adCost: m.adCost,
      otherCost: m.otherCost,
      netProfit: m.netProfit,
      profitRate: m.profitRate,
      orderCount: m.orderCount,
      returnCount: null,
    } satisfies PLData)).sort((a, b) => b.revenue - a.revenue);

    const totals = profitWindowTotals(facts);

    this.logger.log({
      msg: 'profit-loss.findAll',
      organizationId,
      year,
      month,
      listingCount: rows.length,
      unavailableProfitCount: rows.filter((row) => row.netProfit === null).length,
      monthProfitMeasured: totals.netProfit !== null,
      latencyMs: Date.now() - startedAt,
    });

    return {
      period: `${year}-${String(month).padStart(2, '0')}`,
      rows,
      totals,
      basis: profitWindowBasis(facts),
    } satisfies ProfitLossResponse;
  }
}

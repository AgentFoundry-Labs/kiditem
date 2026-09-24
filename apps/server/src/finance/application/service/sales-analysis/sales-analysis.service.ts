import { AI_LISTING_CONTENT_QUERY_PORT, type ListingContentQueryPort } from '../../../../content/application/port/in/workspace/listing-content-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../channels/application/port/in/channel-option-recipe.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../channels/application/port/in/account/channel-account.port';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SalesAnalysisData, ChannelAnalysis } from '@kiditem/shared/finance';
import { PrismaService } from '../../../../prisma/prisma.service';
import { businessDateKey, kstBusinessDate, kstMonthWindow } from '../../../../common/kst';
import {
  addOrUnavailable,
  advertisingAppliesToListing,
  isOrderWindowComplete,
  profitRatePercent,
  profitWindowBasis,
  profitWindowTotals,
  readProfitWindowFacts,
  resolveFinanceWindow,
  roundOrUnavailable,
  totalOrUnavailable,
  type AccountAdEvidence,
} from '../../../../common/per-listing-profit';
import { advertisingAppliesToSale } from '../../../../advertising/domain/ad-sweep-coverage';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';

/**
 * Map ChannelAccount.channel (platform) → ChannelAnalysis.channelType.
 */
const CHANNEL_TYPE_MAP: Record<string, 'marketplace' | 'direct' | 'other'> = {
  coupang: 'marketplace',
  naver: 'marketplace',
  '11st': 'marketplace',
  gmarket: 'marketplace',
  auction: 'marketplace',
  wing: 'direct',
};

function resolveChannelType(channel: string): 'marketplace' | 'direct' | 'other' {
  return CHANNEL_TYPE_MAP[channel] ?? 'other';
}

/**
 * A channel's ad cost for the window. Where advertising does not apply — no
 * advertising account, or a channel none of whose sold listings the Coupang
 * target-day sweep covers and for which it published no spend — it is Not
 * applied, a satisfied zero. Where it applies it exists only when the sweep
 * measured every date of the window; then the sweep looked at every listing,
 * so a channel whose listings carry no rows spent nothing. Unmeasured
 * advertising is never added to a channel profit as zero, and measured spend
 * is never dropped as Not applied.
 */
function channelAdCost(
  ad: AccountAdEvidence,
  adSpendByChannel: ReadonlyMap<string, number>,
  channel: string,
  adApplies: boolean,
): number | null {
  if (!adApplies) return 0;
  if (!ad.coversWindow) return null;
  return Math.round(adSpendByChannel.has(channel) ? adSpendByChannel.get(channel)! : 0);
}

/**
 * Channel sales analysis for one KST month over the owner readers.
 *
 * The month is evaluated over its KST business days closed at `now`
 * (ADR-0001). Channel rows group the collected order lines by the channel
 * their listing sells on. A channel cost or profit is `null` when any of its
 * lines lacks a recorded cost, or when advertising applies to the channel
 * (it sells listings the Coupang target-day sweep covers) and either the
 * sweep or the Orders collection did not cover the whole evaluated window.
 * Ratios over zero are `null`. `totals` are the organization's window totals.
 * Returns have no owner publication, so return counts, return rates and the
 * orphan return count are `null`, never zero (ADR-0006).
 */
@Injectable()
export class SalesAnalysisService {
  private readonly logger = new Logger(SalesAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    @Inject(AI_LISTING_CONTENT_QUERY_PORT) private readonly listingContent: ListingContentQueryPort,
  ) {}

  async getAnalysis(
    organizationId: string,
    period: string | undefined,
    now: Date,
  ): Promise<SalesAnalysisData> {
    const startedAt = Date.now();
    const resolvedPeriod = this.resolvePeriod(period, now);
    const { year, month } = this.parsePeriod(resolvedPeriod);
    const window = resolveFinanceWindow(kstMonthWindow(year, month), now);

    const { facts, unsoldAdListings } = await this.prisma.$transaction(async (tx) => {
      const facts = await readProfitWindowFacts(
        tx,
        organizationId,
        window,
        this.inventoryTransactionalRead, { listings: this.channelListings, recipes: this.channelRecipes, accounts: this.channelAccounts, content: this.listingContent }
      );
      const soldListingIds = new Set(facts.lines.map((line) => line.listing.listingId));
      const unsoldAdListingIds = [...facts.listingAdSpend.keys()]
        .filter((listingId) => !soldListingIds.has(listingId));
      const unsoldAdListings = unsoldAdListingIds.length === 0
        ? []
        : await tx.channelListing.findMany({
          where: { id: { in: unsoldAdListingIds }, organizationId },
          select: { id: true, channelAccount: { select: { channel: true } } },
        });
      return { facts, unsoldAdListings };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const channelByListing = new Map<string, string>();
    for (const line of facts.lines) channelByListing.set(line.listing.listingId, line.listing.channel);
    for (const listing of unsoldAdListings) channelByListing.set(listing.id, listing.channelAccount.channel);

    const adSpendByChannel = new Map<string, number>();
    for (const [listingId, spend] of facts.listingAdSpend) {
      const channel = channelByListing.get(listingId);
      if (!channel) continue;
      adSpendByChannel.set(channel, (adSpendByChannel.get(channel) ?? 0) + spend);
    }

    type Group = {
      channel: string;
      orderIds: Set<string>;
      revenue: number;
      shipping: number;
      costOfGoods: number | null;
      commission: number | null;
      otherCost: number | null;
      /** Whether advertising applies to any of the channel's sold listings. */
      adApplies: boolean;
    };
    const groups = new Map<string, Group>();
    for (const line of facts.lines) {
      const channel = line.listing.channel;
      const group = groups.get(channel) ?? {
        channel,
        orderIds: new Set<string>(),
        revenue: 0,
        shipping: 0,
        costOfGoods: 0,
        commission: 0,
        otherCost: 0,
        adApplies: false,
      };
      group.orderIds.add(line.orderId);
      group.adApplies = group.adApplies
        || advertisingAppliesToListing(facts.ad, line.listing, facts.listingAdSpend);
      group.revenue += line.revenue;
      group.shipping += line.shippingCost;
      group.costOfGoods = addOrUnavailable(group.costOfGoods, line.costOfGoods);
      group.commission = addOrUnavailable(group.commission, line.commission);
      group.otherCost = addOrUnavailable(group.otherCost, line.otherCost);
      groups.set(channel, group);
    }

    const channels: ChannelAnalysis[] = Array.from(groups.values())
      .map((group) => {
        // Measured spend for the channel applies whatever account its sold
        // lines sit on (advertising's rule).
        const adApplies = advertisingAppliesToSale({
          organizationAdvertises: facts.ad.hasAdAccount,
          sweepCoversAccount: group.adApplies,
          hasMeasuredSpend: adSpendByChannel.has(group.channel),
        });
        // Advertising is a whole-window sum, so where it applies the orders
        // must cover the same whole window before a cost that includes it exists.
        const datesAligned = !adApplies || isOrderWindowComplete(facts.orderWindow);
        // Line costs stay exact; the channel rounds its own sums once (finance guide).
        const costs = totalOrUnavailable([
          roundOrUnavailable(group.costOfGoods),
          roundOrUnavailable(group.commission),
          roundOrUnavailable(group.otherCost),
          channelAdCost(facts.ad, adSpendByChannel, group.channel, adApplies),
        ]);
        const totalCost = !datesAligned || costs === null ? null : costs + group.shipping;
        const totalProfit = totalCost === null ? null : group.revenue - totalCost;
        const totalOrders = group.orderIds.size;
        return {
          channel: group.channel,
          channelType: resolveChannelType(group.channel),
          totalOrders,
          totalRevenue: group.revenue,
          totalCost,
          totalProfit,
          profitRate: profitRatePercent(totalProfit, group.revenue),
          // Returns have no owner publication: not collected, never zero.
          returnCount: null,
          returnRate: null,
          avgOrderValue: totalOrders === 0 ? null : group.revenue / totalOrders,
        } satisfies ChannelAnalysis;
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const windowTotals = profitWindowTotals(facts);
    const result = {
      period: resolvedPeriod,
      channels,
      totals: {
        totalRevenue: windowTotals.revenue,
        totalProfit: windowTotals.netProfit,
        totalOrders: windowTotals.orderCount,
        totalCost: windowTotals.cost,
        profitRate: windowTotals.profitRate,
        orphanReturnCount: null,
      },
      basis: profitWindowBasis(facts),
    } satisfies SalesAnalysisData;

    this.logger.log({
      msg: 'sales-analysis.getAnalysis',
      organizationId,
      period: resolvedPeriod,
      channelCount: channels.length,
      totalOrders: result.totals.totalOrders,
      totalRevenue: result.totals.totalRevenue,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }

  /** A valid `YYYY-MM`, or the KST month containing `now`. */
  private resolvePeriod(period: string | undefined, now: Date): string {
    if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
    return businessDateKey(kstBusinessDate(now)).slice(0, 7);
  }

  private parsePeriod(period: string): { year: number; month: number } {
    const [y, m] = period.split('-').map((s) => parseInt(s, 10));
    return { year: y, month: m };
  }
}
